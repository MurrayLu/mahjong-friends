import { LedgerService } from "./service";
import { ensure } from "../domain/rules";

export type HighlightReaction = "LIKE" | "DISLIKE";
export interface HighlightPerson {
  UserId: string;
  DisplayName: string;
  AvatarImageUrl: string | null;
}
export interface HighlightSocial {
  Likes: HighlightPerson[];
  Dislikes: HighlightPerson[];
  MyReaction: HighlightReaction | null;
  CommentCount: number;
}
export interface HighlightComment extends HighlightPerson {
  Id: string;
  Body: string;
  CreatedAt: string;
  CanDelete: boolean;
}
export class HighlightSocialService {
  constructor(private ledger: LedgerService) {}
  private get repo() {
    return this.ledger.repo;
  }
  async snapshot(userId: string, id: string): Promise<HighlightSocial> {
    await this.ledger.scopedHighlight(userId, id);
    const people = await this.repo.many<
      HighlightPerson & { Reaction: HighlightReaction }
    >(
      `SELECT r.UserId,u.DisplayName,u.AvatarImageUrl,r.Reaction FROM HighlightReaction r
       JOIN UserAccount u ON u.Id=r.UserId WHERE r.HighlightId=? ORDER BY r.CreatedAt,r.UserId`,
      id,
    );
    const clean = ({
      Reaction: _,
      ...person
    }: HighlightPerson & { Reaction: HighlightReaction }) => person;
    return {
      Likes: people.filter((p) => p.Reaction === "LIKE").map(clean),
      Dislikes: people.filter((p) => p.Reaction === "DISLIKE").map(clean),
      MyReaction: people.find((p) => p.UserId === userId)?.Reaction ?? null,
      CommentCount: (await this.repo.one<{ Count: number }>(
        "SELECT COUNT(*) AS Count FROM HighlightComment WHERE HighlightId=?",
        id,
      ))!.Count,
    };
  }
  async react(userId: string, id: string, reaction: unknown) {
    const h = await this.ledger.scopedHighlight(userId, id);
    await this.ledger.requireRoomWrite(userId, h.GroupId);
    ensure(
      reaction === null || reaction === "LIKE" || reaction === "DISLIKE",
      "InvalidHighlightReaction",
    );
    if (reaction === null)
      await this.repo.run(
        "DELETE FROM HighlightReaction WHERE HighlightId=? AND UserId=?",
        id,
        userId,
      );
    else
      await this.repo.run(
        `INSERT INTO HighlightReaction(HighlightId,UserId,Reaction,CreatedAt) VALUES(?,?,?,?)
      ON CONFLICT(HighlightId,UserId) DO UPDATE SET Reaction=excluded.Reaction`,
        id,
        userId,
        reaction,
        new Date().toISOString(),
      );
    return this.snapshot(userId, id);
  }
  async comments(userId: string, id: string, offset = 0) {
    const h = await this.ledger.scopedHighlight(userId, id);
    ensure(Number.isSafeInteger(offset) && offset >= 0, "InvalidPagination");
    const admin = await this.ledger.isRoomAdmin(userId, h.GroupId);
    const writable =
      (await this.ledger.requireRoomRead(userId, h.GroupId)) === "Member";
    const rows = await this.repo.many<Omit<HighlightComment, "CanDelete">>(
      `SELECT c.Id,c.UserId,c.Body,c.CreatedAt,u.DisplayName,u.AvatarImageUrl
      FROM HighlightComment c JOIN UserAccount u ON u.Id=c.UserId WHERE c.HighlightId=? ORDER BY c.CreatedAt DESC,c.Id DESC LIMIT 21 OFFSET ?`,
      id,
      offset,
    );
    return {
      Items: rows
        .slice(0, 20)
        .map((c) => ({
          ...c,
          CanDelete: writable && (admin || c.UserId === userId),
        })),
      HasMore: rows.length > 20,
      NextOffset: offset + Math.min(rows.length, 20),
    };
  }
  async comment(userId: string, id: string, body: unknown) {
    const h = await this.ledger.scopedHighlight(userId, id);
    await this.ledger.requireRoomWrite(userId, h.GroupId);
    ensure(
      typeof body === "string" &&
        body.trim().length > 0 &&
        body.trim().length <= 500,
      "InvalidHighlightComment",
    );
    await this.repo.run(
      "INSERT INTO HighlightComment(Id,HighlightId,UserId,Body,CreatedAt) VALUES(?,?,?,?,?)",
      crypto.randomUUID(),
      id,
      userId,
      body.trim(),
      new Date().toISOString(),
    );
    return { ok: true };
  }
  async deleteComment(userId: string, id: string, commentId: string) {
    const h = await this.ledger.scopedHighlight(userId, id);
    await this.ledger.requireRoomWrite(userId, h.GroupId);
    const comment = await this.repo.one<{ UserId: string }>(
      "SELECT UserId FROM HighlightComment WHERE Id=? AND HighlightId=?",
      commentId,
      id,
    );
    ensure(comment, "HighlightCommentNotFound", 404);
    ensure(
      comment.UserId === userId ||
        (await this.ledger.isRoomAdmin(userId, h.GroupId)),
      "HighlightCommentWriteAccessRequired",
      403,
    );
    await this.repo.run(
      "DELETE FROM HighlightComment WHERE Id=? AND HighlightId=?",
      commentId,
      id,
    );
    return { ok: true };
  }
}
