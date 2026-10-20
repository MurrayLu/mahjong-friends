import { DomainError, ensure } from "../domain/rules";
import { LedgerService } from "./service";

export type AppealReaction = "SUPPORT" | "REJECT" | "WATCH";
export type AppealResult =
  "READY" | "IGNORED" | "ONE_SHORT" | "REJECTED" | "WATCH_ONLY" | "MIXED";
export interface AppealPeople {
  Count: number;
  Names: string[];
}
export interface AppealSnapshot {
  Id: string;
  GroupId: string;
  SourceSessionId: string;
  CreatedByUserId: string;
  CreatedByDisplayName: string;
  CreatedAt: string;
  ExpiresAt: string;
  Status: "ACTIVE" | "FINALIZED";
  ReadyAt: string | null;
  FinalizedAt: string | null;
  FinalResult: AppealResult | null;
  MyReaction: AppealReaction | null;
  IsInitiator: boolean;
  CanReact: boolean;
  Support: AppealPeople;
  Reject: AppealPeople;
  Watch: AppealPeople;
}
interface AppealRow {
  Id: string;
  GroupId: string;
  SourceSessionId: string;
  CreatedByUserId: string;
  CreatedAt: string;
  ExpiresAt: string;
  Status: "ACTIVE" | "FINALIZED";
  ReadyAt: string | null;
  FinalizedAt: string | null;
  FinalResult: AppealResult | null;
}
interface ReactionRow {
  UserAccountId: string;
  Reaction: AppealReaction;
  DisplayName: string;
}
export const APPEAL_TTL_MS = 2 * 60 * 60 * 1000;
export function appealResult(
  support: number,
  reject: number,
  watch: number,
): AppealResult {
  if (support >= 4) return "READY";
  if (support === 1 && reject === 0 && watch === 0) return "IGNORED";
  if (support === 3) return "ONE_SHORT";
  if (reject > support && reject >= watch) return "REJECTED";
  if (watch > support && watch > reject) return "WATCH_ONLY";
  return "MIXED";
}
export const appealResultLabel: Record<AppealResult, string> = {
  READY: "可以開桌",
  IGNORED: "無人理會",
  ONE_SHORT: "三缺一",
  REJECTED: "駁回",
  WATCH_ONLY: "大家只想看戲",
  MIXED: "各有各的想法",
};
function changes(result: unknown): number {
  if (!result || typeof result !== "object") return 0;
  const r = result as { changes?: number; meta?: { changes?: number } };
  return r.meta?.changes ?? r.changes ?? 0;
}
export class TableAppealService {
  constructor(
    public ledger: LedgerService,
    public now: () => Date = () => new Date(),
  ) {}
  get repo() {
    return this.ledger.repo;
  }
  private row(id: string) {
    return this.repo.one<AppealRow>("SELECT * FROM TableAppeal WHERE Id=?", id);
  }
  private async reactions(id: string) {
    return this.repo.many<ReactionRow>(
      `SELECT r.UserAccountId,r.Reaction,
         u.DisplayName AS DisplayName
       FROM TableAppealReaction r JOIN TableAppeal a ON a.Id=r.AppealId
       JOIN UserAccount u ON u.Id=r.UserAccountId
       WHERE r.AppealId=? ORDER BY r.CreatedAt,r.UserAccountId`,
      id,
    );
  }
  private async snapshot(
    row: AppealRow,
    userId: string,
    access: "Member" | "Viewer",
  ): Promise<AppealSnapshot> {
    const creator = await this.repo.one<{ DisplayName: string }>(
      `SELECT u.DisplayName AS DisplayName FROM UserAccount u WHERE u.Id=?`,
      row.CreatedByUserId,
    );
    const reactions = await this.reactions(row.Id);
    const people = (reaction: AppealReaction): AppealPeople => {
      const names = reactions
        .filter((r) => r.Reaction === reaction)
        .map((r) => r.DisplayName);
      return { Count: names.length, Names: names };
    };
    return {
      ...row,
      CreatedByDisplayName: creator?.DisplayName || "牌咖",
      MyReaction:
        reactions.find((r) => r.UserAccountId === userId)?.Reaction || null,
      IsInitiator: row.CreatedByUserId === userId,
      CanReact:
        access === "Member" &&
        row.Status === "ACTIVE" &&
        row.ExpiresAt > this.now().toISOString(),
      Support: people("SUPPORT"),
      Reject: people("REJECT"),
      Watch: people("WATCH"),
    };
  }
  async get(userId: string, id: string) {
    const row = await this.row(id);
    ensure(row, "AppealNotFound", 404);
    const access = await this.ledger.requireRoomRead(userId, row.GroupId);
    if (row.Status === "ACTIVE" && row.ExpiresAt <= this.now().toISOString()) {
      await this.finalize(id);
      return this.snapshot((await this.row(id))!, userId, access);
    }
    return this.snapshot(row, userId, access);
  }
  async active(
    userId: string,
    groupId: string,
  ): Promise<AppealSnapshot | null> {
    const access = await this.ledger.requireRoomRead(userId, groupId);
    const row = await this.repo.one<AppealRow>(
      "SELECT * FROM TableAppeal WHERE GroupId=? AND Status='ACTIVE'",
      groupId,
    );
    if (!row) return null;
    if (row.ExpiresAt <= this.now().toISOString()) {
      await this.finalize(row.Id);
      return null;
    }
    return this.snapshot(row, userId, access);
  }
  async create(userId: string, groupId: string, sourceSessionId: string) {
    await this.ledger.requireRoomWrite(userId, groupId);
    ensure(
      typeof sourceSessionId === "string" && sourceSessionId.length > 0,
      "InvalidSourceSession",
    );
    const source = await this.ledger.getSession(userId, sourceSessionId);
    ensure(
      source.GroupId === groupId && source.IsSettled,
      "SettledSessionRequired",
      409,
    );
    const existing = await this.active(userId, groupId);
    if (existing)
      throw new DomainError("ActiveAppealExists", 409, { Appeal: existing });
    const now = this.now(),
      at = now.toISOString(),
      id = crypto.randomUUID();
    const expires = new Date(now.getTime() + APPEAL_TTL_MS).toISOString();
    try {
      await this.repo.batch([
        this.repo.statement(
          "INSERT INTO TableAppeal(Id,GroupId,SourceSessionId,CreatedByUserId,CreatedAt,ExpiresAt,Status) VALUES(?,?,?,?,?,?,'ACTIVE')",
          id,
          groupId,
          sourceSessionId,
          userId,
          at,
          expires,
        ),
        this.repo.statement(
          "INSERT INTO TableAppealReaction VALUES(?,?,?, ?,?)",
          id,
          userId,
          "SUPPORT",
          at,
          at,
        ),
        this.repo.statement(
          "INSERT INTO GroupActivity(Id,GroupId,Type,ActorUserId,SessionId,CreatedAt,MetadataJson,AppealId) VALUES(?,?,'TABLE_APPEAL',?,?,?,?,?)",
          crypto.randomUUID(),
          groupId,
          userId,
          sourceSessionId,
          at,
          "{}",
          id,
        ),
      ]);
    } catch (error) {
      if (
        String(error).includes("UNIQUE constraint failed: TableAppeal.GroupId")
      ) {
        const existing = await this.active(userId, groupId);
        throw new DomainError("ActiveAppealExists", 409, { Appeal: existing });
      }
      throw error;
    }
    return this.get(userId, id);
  }
  async react(userId: string, id: string, reaction: AppealReaction) {
    ensure(
      ["SUPPORT", "REJECT", "WATCH"].includes(reaction),
      "InvalidAppealReaction",
    );
    const row = await this.row(id);
    ensure(row, "AppealNotFound", 404);
    await this.ledger.requireRoomWrite(userId, row.GroupId);
    if (row.ExpiresAt <= this.now().toISOString()) {
      await this.finalize(id);
      throw new DomainError("AppealExpired", 409);
    }
    ensure(row.Status === "ACTIVE", "AppealExpired", 409);
    ensure(userId !== row.CreatedByUserId, "InitiatorReactionFixed", 409);
    const at = this.now().toISOString();
    const update = await this.repo.run(
      `INSERT INTO TableAppealReaction(AppealId,UserAccountId,Reaction,CreatedAt,UpdatedAt)
       VALUES(?,?,?,?,?) ON CONFLICT(AppealId,UserAccountId) DO UPDATE SET Reaction=excluded.Reaction,UpdatedAt=excluded.UpdatedAt WHERE TableAppealReaction.Reaction<>excluded.Reaction`,
      id,
      userId,
      reaction,
      at,
      at,
    );
    const counts = await this.reactions(id);
    const ready = counts.filter((r) => r.Reaction === "SUPPORT").length >= 4;
    const result = ready
      ? await this.repo.run(
          "UPDATE TableAppeal SET ReadyAt=? WHERE Id=? AND Status='ACTIVE' AND ReadyAt IS NULL",
          at,
          id,
        )
      : null;
    return {
      Appeal: await this.get(userId, id),
      Changed: changes(update) === 1,
      ReadyChanged: changes(result) === 1,
    };
  }
  async finalize(
    id: string,
  ): Promise<{ Changed: boolean; GroupId: string | null }> {
    const row = await this.row(id);
    if (
      !row ||
      row.Status !== "ACTIVE" ||
      row.ExpiresAt > this.now().toISOString()
    )
      return { Changed: false, GroupId: row?.GroupId || null };
    const rows = await this.reactions(id);
    const count = (reaction: AppealReaction) =>
      rows.filter((r) => r.Reaction === reaction).length;
    const result = appealResult(
      count("SUPPORT"),
      count("REJECT"),
      count("WATCH"),
    );
    const updated = await this.repo.run(
      "UPDATE TableAppeal SET Status='FINALIZED',FinalizedAt=?,FinalResult=? WHERE Id=? AND Status='ACTIVE' AND ExpiresAt<=?",
      this.now().toISOString(),
      result,
      id,
      this.now().toISOString(),
    );
    return { Changed: changes(updated) === 1, GroupId: row.GroupId };
  }
}
