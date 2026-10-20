import { Governance } from "./governance";
import {
  defaultRateSettings,
  normalizeRateSettings,
  type RatePreset,
} from "../domain/rate-presets";
import type {
  DayRecord,
  Group,
  GroupView,
  Highlight,
  HighlightInput,
  LeaderboardRow,
  Player,
  PlayerView,
  RoomMemberView,
  ResultInput,
  Session,
  SessionInput,
  SessionResult,
  SessionUpdate,
  UserAccount,
} from "../domain/model";
import {
  balancedResults,
  DomainError,
  ensure,
  internalImage,
  integer,
  MINIMUM_SETTLEMENT_PLAYERS,
  periodRange,
  recordDate,
  sessionFields,
  text,
  validateHandCount,
} from "../domain/rules";
import { Repository } from "../persistence/repository";
import type { MediaImage } from "./media";
export class LedgerService extends Governance {
  constructor(repo: Repository) {
    super(repo);
  }
  async user(id: string) {
    const user = await this.repo.one<UserAccount>(
      "SELECT * FROM UserAccount WHERE Id=?",
      id,
    );
    ensure(user, "Unauthorized", 401);
    return user;
  }
  async upsertGoogleUser(subject: string, email: string, displayName: string) {
    const now = new Date().toISOString();
    await this.repo.run(
      "INSERT INTO UserAccount(Id,GoogleSubjectId,Email,DisplayName,CreatedAt,UpdatedAt) VALUES (?,?,?,?,?,?) ON CONFLICT(GoogleSubjectId) WHERE GoogleSubjectId IS NOT NULL DO UPDATE SET Email=excluded.Email, UpdatedAt=excluded.UpdatedAt",
      crypto.randomUUID(),
      subject,
      email,
      text(displayName, "DisplayName"),
      now,
      now,
    );
    return (await this.repo.one<UserAccount>(
      "SELECT * FROM UserAccount WHERE GoogleSubjectId=?",
      subject,
    ))!;
  }
  async updateUser(userId: string, displayName: string) {
    const name = text(displayName, "DisplayName"),
      now = new Date().toISOString();
    await this.repo.run(
      "UPDATE UserAccount SET DisplayName=?, UpdatedAt=? WHERE Id=?",
      name,
      now,
      userId,
    );
    return this.user(userId);
  }
  member(userId: string, groupId: string) {
    return this.requireRoomRead(userId, groupId);
  }
  async groups(userId: string) {
    const groups = await this.repo.many<GroupView>(
      `SELECT g.Id,g.Name,g.OwnerUserId,g.CreatedAt,g.UpdatedAt,m.AccessLevel,
      EXISTS(SELECT 1 FROM GroupAdmin a WHERE a.GroupId=g.Id AND a.UserId=m.UserId) AS IsAdmin,
      CASE WHEN m.AccessLevel='Member' THEN g.InviteCode ELSE NULL END AS InviteCode
      FROM "Group" g JOIN GroupMember m ON m.GroupId=g.Id WHERE m.UserId=? ORDER BY g.CreatedAt DESC`,
      userId,
    );
    const rates = await this.repo.many<RatePreset & { GroupId: string }>(
      "SELECT r.* FROM GroupRatePreset r JOIN GroupMember m ON m.GroupId=r.GroupId WHERE m.UserId=? ORDER BY r.RateMajor,r.RateMinor",
      userId,
    );
    return groups.map((g) => ({
      ...g,
      RatePresets: rates
        .filter((r) => r.GroupId === g.Id)
        .map(({ RateMajor, RateMinor, IsCustom, IsSelected }) => ({
          RateMajor,
          RateMinor,
          IsCustom: !!IsCustom,
          IsSelected: !!IsSelected,
        })),
    }));
  }
  private rateStatements(groupId: string, rates: RatePreset[], now: string) {
    return rates.map((r) =>
      this.repo.statement(
        "INSERT INTO GroupRatePreset(GroupId,RateMajor,RateMinor,IsCustom,IsSelected,CreatedAt,UpdatedAt) VALUES (?,?,?,?,?,?,?)",
        groupId,
        r.RateMajor,
        r.RateMinor,
        Number(r.IsCustom),
        Number(r.IsSelected),
        now,
        now,
      ),
    );
  }
  async updateRatePresets(userId: string, groupId: string, input: unknown) {
    await this.requireRoomAdmin(userId, groupId);
    const rates = normalizeRateSettings(input);
    await this.repo.batch([
      this.repo.statement(
        "DELETE FROM GroupRatePreset WHERE GroupId=?",
        groupId,
      ),
      ...this.rateStatements(groupId, rates, new Date().toISOString()),
    ]);
    return rates;
  }
  async createGroup(userId: string, name: string, settings?: unknown) {
    const rates = normalizeRateSettings(
      settings === undefined ? defaultRateSettings() : settings,
    );
    const user = await this.user(userId),
      id = crypto.randomUUID(),
      now = new Date().toISOString();
    const invite =
      crypto.randomUUID().replaceAll("-", "") +
      crypto.randomUUID().replaceAll("-", "");
    await this.repo.batch([
      this.repo.statement(
        'INSERT INTO "Group" VALUES (?,?,?,?,?,?)',
        id,
        text(name, "GroupName"),
        userId,
        invite,
        now,
        now,
      ),
      this.repo.statement(
        "INSERT INTO GroupMember (GroupId,UserId,JoinedAt,AccessLevel) VALUES (?,?,?,'Member')",
        id,
        userId,
        now,
      ),
      this.repo.statement(
        "INSERT INTO Player (Id,GroupId,UserId,DisplayName,IsGuest,CreatedAt,UpdatedAt) VALUES (?,?,?,?,?,?,?)",
        crypto.randomUUID(),
        id,
        userId,
        user.DisplayName,
        0,
        now,
        now,
      ),
      this.repo.statement(
        "INSERT INTO GroupAdmin VALUES (?,?,?,?)",
        id,
        userId,
        now,
        userId,
      ),
      ...this.rateStatements(id, rates, now),
    ]);
    return {
      ...(await this.repo.one<Group>('SELECT * FROM "Group" WHERE Id=?', id))!,
      AccessLevel: "Member" as const,
      IsAdmin: 1,
      RatePresets: rates,
    };
  }
  async updateGroup(userId: string, groupId: string, name: string) {
    await this.requireRoomAdmin(userId, groupId);
    await this.repo.run(
      'UPDATE "Group" SET Name=?, UpdatedAt=? WHERE Id=?',
      text(name, "GroupName"),
      new Date().toISOString(),
      groupId,
    );
    return this.repo.one<Group>('SELECT * FROM "Group" WHERE Id=?', groupId);
  }
  /** Explicit whole-room deletion. Account identities and other rooms are never targets. */
  async deleteGroup(userId: string, groupId: string, confirmationName: string) {
    await this.requireRoomAdmin(userId, groupId);
    const group = await this.repo.one<Group>(
      'SELECT * FROM "Group" WHERE Id=?',
      groupId,
    );
    ensure(
      group && confirmationName === group.Name,
      "RoomDeletionNameMismatch",
      409,
    );
    const images = await this.repo.many<MediaImage>(
      "SELECT * FROM MediaImage WHERE GroupId=?",
      groupId,
    );
    const days = "SELECT Id FROM DayRecord WHERE GroupId=?";
    const sessions = `SELECT Id FROM Session WHERE DayRecordId IN (${days})`;
    try {
      await this.repo.batch([
        // Recheck confirmation and authority inside the atomic batch. A NOT NULL
        // failure aborts every deletion if a rename/demotion raced with the dialog.
        this.repo.statement(
          `UPDATE "Group" SET Name=CASE WHEN Name=? AND EXISTS(
          SELECT 1 FROM GroupAdmin a JOIN GroupMember m ON m.GroupId=a.GroupId AND m.UserId=a.UserId
          WHERE a.GroupId=? AND a.UserId=? AND m.AccessLevel='Member'
        ) THEN Name ELSE NULL END WHERE Id=?`,
          confirmationName,
          groupId,
          userId,
          groupId,
        ),
        this.repo.statement("DELETE FROM MediaImage WHERE GroupId=?", groupId),
        this.repo.statement("DELETE FROM TableAppeal WHERE GroupId=?", groupId),
        this.repo.statement(
          `DELETE FROM Highlight WHERE DayRecordId IN (${days})`,
          groupId,
        ),
        this.repo.statement(
          `DELETE FROM SessionResult WHERE SessionId IN (${sessions})`,
          groupId,
        ),
        this.repo.statement(
          `DELETE FROM Session WHERE DayRecordId IN (${days})`,
          groupId,
        ),
        this.repo.statement("DELETE FROM Player WHERE GroupId=?", groupId),
        this.repo.statement("DELETE FROM DayRecord WHERE GroupId=?", groupId),
        this.repo.statement("DELETE FROM GroupMember WHERE GroupId=?", groupId),
        // Cascades remove the last admin only after its parent is gone, honoring
        // GroupAdmin_LastRequired. Fun projections/unlocks/read cursors cascade too.
        this.repo.statement('DELETE FROM "Group" WHERE Id=?', groupId),
      ]);
    } catch (error) {
      if (/NOT NULL.*Group.Name/i.test(String(error)))
        throw new DomainError("RoomDeletionChanged", 409);
      throw error;
    }
    return images;
  }
  async join(userId: string, inviteCode: string, displayName?: string) {
    const group = await this.repo.one<Group>(
      'SELECT * FROM "Group" WHERE InviteCode=?',
      inviteCode,
    );
    ensure(group, "InviteNotFound", 404);
    return this.joinMember(userId, group.Id, displayName);
  }
  async becomeMember(userId: string, groupId: string, displayName?: string) {
    await this.requireRoomRead(userId, groupId);
    return this.joinMember(userId, groupId, displayName);
  }
  private async joinMember(
    userId: string,
    groupId: string,
    displayName?: string,
  ) {
    const user = await this.user(userId),
      now = new Date().toISOString();
    const existing = await this.repo.one(
      "SELECT 1 FROM Player WHERE GroupId=? AND UserId=?",
      groupId,
      userId,
    );
    const name =
      displayName === undefined || existing
        ? user.DisplayName
        : text(displayName, "DisplayName");
    await this.repo.batch([
      ...(displayName === undefined || existing
        ? []
        : [
            this.repo.statement(
              "UPDATE UserAccount SET DisplayName=?,UpdatedAt=? WHERE Id=?",
              name,
              now,
              userId,
            ),
          ]),
      this.repo.statement(
        "INSERT INTO GroupMember (GroupId,UserId,JoinedAt,AccessLevel) VALUES (?,?,?,'Member') ON CONFLICT(GroupId,UserId) DO UPDATE SET AccessLevel='Member'",
        groupId,
        userId,
        now,
      ),
      this.repo.statement(
        "INSERT INTO Player (Id,GroupId,UserId,DisplayName,IsGuest,CreatedAt,UpdatedAt) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING",
        crypto.randomUUID(),
        groupId,
        userId,
        name,
        0,
        now,
        now,
      ),
    ]);
    return (await this.groups(userId)).find((g) => g.Id === groupId)!;
  }
  async viewInvite(userId: string, inviteCode: string) {
    const group = await this.repo.one<Group>(
      'SELECT * FROM "Group" WHERE InviteCode=?',
      inviteCode,
    );
    ensure(group, "InviteNotFound", 404);
    await this.user(userId);
    await this.repo.run(
      "UPDATE UserAccount SET DisplayName='幽靈',UpdatedAt=? WHERE Id=? AND DisplayName='玩家' AND NOT EXISTS(SELECT 1 FROM GroupMember WHERE UserId=?) AND NOT EXISTS(SELECT 1 FROM Player WHERE UserId=?)",
      new Date().toISOString(),
      userId,
      userId,
      userId,
    );
    await this.repo.run(
      "INSERT INTO GroupMember (GroupId,UserId,JoinedAt,AccessLevel) VALUES (?,?,?,'Viewer') ON CONFLICT(GroupId,UserId) DO NOTHING",
      group.Id,
      userId,
      new Date().toISOString(),
    );
    return (await this.groups(userId)).find((g) => g.Id === group.Id)!;
  }
  async claimablePlayers(userId: string, groupId: string) {
    await this.requireRoomRead(userId, groupId);
    return this.repo.many<{
      PlayerId: string;
      DisplayName: string;
      AvatarImageUrl: string | null;
      SessionsPlayed: number;
    }>(
      `SELECT p.Id AS PlayerId,p.DisplayName,p.AvatarImageUrl,
      (SELECT COUNT(*) FROM SessionResult r WHERE r.PlayerId=p.Id) AS SessionsPlayed
      FROM Player p WHERE p.GroupId=? AND p.IsGuest=1 AND p.UserId IS NULL AND p.IsArchived=0 ORDER BY p.DisplayName,p.Id`,
      groupId,
    );
  }
  async claimGuest(userId: string, groupId: string, playerId: string) {
    await this.requireRoomRead(userId, groupId);
    ensure(
      typeof playerId === "string" && playerId.length > 0,
      "PlayerClaimUnavailable",
      409,
    );
    const player = await this.repo.one<Player>(
      "SELECT * FROM Player WHERE Id=?",
      playerId,
    );
    ensure(
      player &&
        player.GroupId === groupId &&
        player.IsGuest === 1 &&
        player.IsArchived === 0 &&
        player.UserId === null,
      "PlayerClaimUnavailable",
      409,
    );
    ensure(
      !(await this.repo.one(
        "SELECT 1 FROM Player WHERE GroupId=? AND UserId=?",
        groupId,
        userId,
      )),
      "PlayerClaimUnavailable",
      409,
    );
    // Conditional update and membership promotion share one atomic D1 batch. The second
    // statement only promotes the winning claimant, including under concurrent requests.
    await this.repo.batch([
      this.repo.statement(
        `UPDATE Player SET UserId=?,IsGuest=0,UpdatedAt=? WHERE Id=? AND GroupId=? AND IsGuest=1 AND UserId IS NULL AND IsArchived=0
        AND NOT EXISTS (SELECT 1 FROM Player WHERE GroupId=? AND UserId=?)`,
        userId,
        new Date().toISOString(),
        playerId,
        groupId,
        groupId,
        userId,
      ),
      this.repo.statement(
        "UPDATE UserAccount SET DisplayName=CASE WHEN DisplayName IN ('玩家','幽靈') THEN (SELECT DisplayName FROM Player WHERE Id=?) ELSE DisplayName END,AvatarImageUrl=COALESCE(AvatarImageUrl,(SELECT AvatarImageUrl FROM Player WHERE Id=?)),UpdatedAt=? WHERE Id=? AND EXISTS(SELECT 1 FROM Player WHERE Id=? AND UserId=?)",
        playerId,
        playerId,
        new Date().toISOString(),
        userId,
        playerId,
        userId,
      ),
      this.repo.statement(
        `UPDATE GroupMember SET AccessLevel='Member' WHERE GroupId=? AND UserId=?
        AND EXISTS (SELECT 1 FROM Player WHERE Id=? AND UserId=?)`,
        groupId,
        userId,
        playerId,
        userId,
      ),
    ]);
    const claimed = await this.repo.one<Player>(
      "SELECT * FROM Player WHERE Id=?",
      playerId,
    );
    ensure(claimed?.UserId === userId, "PlayerClaimUnavailable", 409);
    return claimed;
  }
  async players(userId: string, groupId: string) {
    const access = await this.requireRoomRead(userId, groupId);
    return this.repo.many<PlayerView>(
      "SELECT p.*,CASE WHEN ?='Member' THEN u.Email ELSE NULL END AS Email FROM PlayerPresentation p LEFT JOIN UserAccount u ON u.Id=p.UserId WHERE p.GroupId=? AND p.IsArchived=0 ORDER BY p.CreatedAt,p.Id",
      access,
      groupId,
    );
  }
  async createGuest(userId: string, groupId: string, name: string) {
    await this.requireRoomWrite(userId, groupId);
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    await this.repo.run(
      "INSERT INTO Player (Id,GroupId,UserId,DisplayName,IsGuest,CreatedAt,UpdatedAt) VALUES (?,?,?,?,?,?,?)",
      id,
      groupId,
      null,
      text(name, "DisplayName"),
      1,
      now,
      now,
    );
    return (await this.repo.one<Player>(
      "SELECT * FROM Player WHERE Id=?",
      id,
    ))!;
  }
  async updatePlayer(userId: string, playerId: string, name: string) {
    const player = await this.repo.one<Player>(
      "SELECT * FROM Player WHERE Id=?",
      playerId,
    );
    ensure(player, "PlayerNotFound", 404);
    await this.requirePlayerWrite(userId, player);
    if (player.UserId !== null) {
      if (player.UserId === userId) await this.updateUser(userId, name);
      else await this.renameMember(userId, player.GroupId, player.UserId, name);
      return this.repo.one<Player>(
        "SELECT * FROM PlayerPresentation WHERE Id=?",
        playerId,
      );
    }
    await this.repo.run(
      "UPDATE Player SET DisplayName=?,UpdatedAt=? WHERE Id=?",
      text(name, "DisplayName"),
      new Date().toISOString(),
      playerId,
    );
    return this.repo.one<Player>("SELECT * FROM Player WHERE Id=?", playerId);
  }
  private dayInsert(groupId: string, date: string) {
    return this.repo.statement(
      "INSERT INTO DayRecord VALUES (?,?,?,?) ON CONFLICT(GroupId,RecordDate) DO NOTHING",
      crypto.randomUUID(),
      groupId,
      recordDate(date),
      new Date().toISOString(),
    );
  }
  async updatePlayerAvatar(
    userId: string,
    playerId: string,
    avatarImageUrl: unknown,
  ) {
    const player = await this.repo.one<Player>(
      "SELECT * FROM Player WHERE Id=?",
      playerId,
    );
    ensure(player, "PlayerNotFound", 404);
    await this.requirePlayerWrite(userId, player);
    ensure(
      player.UserId === null || player.UserId === userId,
      "OfficialIdentityReadOnly",
      403,
    );
    const image = internalImage(avatarImageUrl, player.GroupId);
    if (image) {
      const metadata = await this.repo.one<{
        ByteSize: number;
        Width: number;
        Height: number;
      }>(
        "SELECT ByteSize,Width,Height FROM MediaImage WHERE Id=? AND DeletedAt IS NULL",
        image.split("/").pop(),
      );
      if (metadata && metadata.ByteSize > 0) {
        ensure(metadata.ByteSize <= 500 * 1024, "IMAGE_TOO_LARGE", 413);
        ensure(
          metadata.Width === metadata.Height && metadata.Width <= 512,
          "IMAGE_INVALID_DIMENSIONS",
        );
      }
    }
    await this.repo.run(
      player.UserId === null
        ? "UPDATE Player SET AvatarImageUrl=?,UpdatedAt=? WHERE Id=?"
        : "UPDATE UserAccount SET AvatarImageUrl=?,UpdatedAt=? WHERE Id=?",
      image,
      new Date().toISOString(),
      player.UserId || playerId,
    );
    return this.repo.one<Player>(
      "SELECT * FROM PlayerPresentation WHERE Id=?",
      playerId,
    );
  }
  async createSession(userId: string, groupId: string, input: SessionInput) {
    await this.requireRoomWrite(userId, groupId);
    sessionFields(input);
    const date = recordDate(input.RecordDate),
      id = crypto.randomUUID(),
      now = new Date().toISOString();
    await this.repo.batch([
      this.dayInsert(groupId, date),
      this.repo.statement(
        `INSERT INTO Session (Id,DayRecordId,Name,MahjongType,RateMajor,RateMinor,HandCount,CreatedByUserId,CreatedAt,UpdatedByUserId,UpdatedAt)
    SELECT ?, d.Id, COALESCE(?, '第 ' || (SELECT COUNT(*)+1 FROM Session WHERE DayRecordId=d.Id) || ' 場'), ?,?,?,?,?,?,?,? FROM DayRecord d WHERE d.GroupId=? AND d.RecordDate=?`,
        id,
        input.Name?.trim() || null,
        input.MahjongType ?? "Traditional",
        input.RateMajor ?? 100,
        input.RateMinor ?? 20,
        validateHandCount(input.HandCount),
        userId,
        now,
        userId,
        now,
        groupId,
        date,
      ),
    ]);
    return this.getSession(userId, id);
  }
  async scopedSession(userId: string, id: string, write = false) {
    const s = await this.repo.one<
      Session & { GroupId: string; RecordDate: string }
    >(
      "SELECT s.*,d.GroupId,d.RecordDate FROM Session s JOIN DayRecord d ON d.Id=s.DayRecordId WHERE s.Id=?",
      id,
    );
    ensure(s, "SessionNotFound", 404);
    await (write
      ? this.requireRoomWrite(userId, s.GroupId)
      : this.requireRoomRead(userId, s.GroupId));
    return s;
  }
  async getSession(userId: string, id: string) {
    const session = await this.scopedSession(userId, id);
    const Results = await this.repo.many<
      SessionResult & {
        DisplayName: string;
        AvatarImageUrl: string | null;
        IsArchived: number;
      }
    >(
      "SELECT r.*,p.DisplayName,p.AvatarImageUrl,p.IsArchived FROM SessionResult r JOIN PlayerPresentation p ON p.Id=r.PlayerId WHERE r.SessionId=? ORDER BY p.Id",
      id,
    );
    return {
      ...session,
      Results,
      IsSettled:
        Results.length >= MINIMUM_SETTLEMENT_PLAYERS &&
        Results.reduce((sum, r) => sum + BigInt(r.NetAmount), 0n) === 0n,
    };
  }
  async updateSession(userId: string, id: string, input: SessionUpdate) {
    await this.scopedSession(userId, id, true);
    sessionFields(input);
    const columns: string[] = [],
      values: unknown[] = [];
    for (const field of [
      "Name",
      "MahjongType",
      "RateMajor",
      "RateMinor",
      "HandCount",
    ] as const) {
      if (input[field] === undefined) continue;
      const v =
        field === "Name"
          ? text(input.Name, "Name")
          : field === "HandCount"
            ? validateHandCount(input.HandCount)
            : input[field];
      columns.push(`${field}=?`);
      values.push(v);
    }
    await this.repo.run(
      `UPDATE Session SET ${[...columns, "UpdatedByUserId=?", "UpdatedAt=?"].join(",")} WHERE Id=?`,
      ...values,
      userId,
      new Date().toISOString(),
      id,
    );
    return this.getSession(userId, id);
  }
  async settle(userId: string, id: string, results: ResultInput[]) {
    const session = await this.scopedSession(userId, id, true);
    balancedResults(results);
    const players = await this.repo.many<Player>(
        "SELECT * FROM PlayerPresentation WHERE GroupId=? AND (IsArchived=0 OR Id IN (SELECT PlayerId FROM SessionResult WHERE SessionId=?))",
        session.GroupId,
        id,
      ),
      valid = new Set(players.map((p) => p.Id));
    for (const result of results)
      ensure(valid.has(result.PlayerId), "CrossGroupPlayer");
    const settledAt = new Date().toISOString();
    await this.repo.batch([
      this.repo.statement("DELETE FROM SessionResult WHERE SessionId=?", id),
      ...results.map((r) =>
        this.repo.statement(
          "INSERT INTO SessionResult VALUES (?,?,?)",
          id,
          r.PlayerId,
          r.NetAmount,
        ),
      ),
      this.repo.statement(
        "UPDATE Session SET UpdatedByUserId=?, UpdatedAt=?, SettledAt=? WHERE Id=?",
        userId,
        settledAt,
        settledAt,
        id,
      ),
    ]);
    return this.getSession(userId, id);
  }
  async deleteSession(userId: string, id: string) {
    await this.scopedSession(userId, id, true);
    await this.repo.batch([
      this.repo.statement(
        "UPDATE Highlight SET SessionId=NULL,UpdatedAt=? WHERE SessionId=?",
        new Date().toISOString(),
        id,
      ),
      this.repo.statement("DELETE FROM SessionResult WHERE SessionId=?", id),
      this.repo.statement("DELETE FROM Session WHERE Id=?", id),
    ]);
  }
  async days(userId: string, groupId: string) {
    await this.member(userId, groupId);
    return this.repo.many<DayRecord>(
      "SELECT * FROM DayRecord WHERE GroupId=? ORDER BY RecordDate DESC",
      groupId,
    );
  }
  async day(userId: string, groupId: string, date: string) {
    await this.member(userId, groupId);
    recordDate(date);
    const day = await this.repo.one<DayRecord>(
      "SELECT * FROM DayRecord WHERE GroupId=? AND RecordDate=?",
      groupId,
      date,
    );
    if (!day)
      return { DayRecord: null, Sessions: [], Highlights: [], Totals: [] };
    const Sessions = await this.repo.many<
      Session & { RecordDate: string; IsSettled: number }
    >(
      `SELECT s.*,d.RecordDate,(SELECT COUNT(*) >= ? AND SUM(NetAmount) = 0 FROM SessionResult WHERE SessionId=s.Id) AS IsSettled FROM Session s JOIN DayRecord d ON d.Id=s.DayRecordId WHERE d.Id=? ORDER BY s.CreatedAt DESC,s.Id`,
      MINIMUM_SETTLEMENT_PLAYERS,
      day.Id,
    );
    const Highlights = await this.repo.many<Highlight>(
      "SELECT * FROM Highlight WHERE DayRecordId=? ORDER BY CreatedAt DESC",
      day.Id,
    );
    const Totals = await this.repo.many<{
      PlayerId: string;
      DisplayName: string;
      AvatarImageUrl: string | null;
      NetAmount: number;
    }>(
      "SELECT p.Id AS PlayerId,p.DisplayName,p.AvatarImageUrl,SUM(r.NetAmount) AS NetAmount FROM SessionResult r JOIN PlayerPresentation p ON p.Id=r.PlayerId JOIN Session s ON s.Id=r.SessionId WHERE s.DayRecordId=? GROUP BY p.Id ORDER BY NetAmount DESC",
      day.Id,
    );
    return { DayRecord: day, Sessions, Highlights, Totals };
  }
  async leaderboard(
    userId: string,
    groupId: string,
    period: string,
    today?: string,
  ) {
    await this.member(userId, groupId);
    const [start, end] = periodRange(period, today);
    const rows = await this.repo.many<
      Omit<LeaderboardRow, "AveragePerSession">
    >(
      `SELECT p.Id AS PlayerId,p.DisplayName,p.AvatarImageUrl,SUM(r.NetAmount) AS NetAmount,COUNT(*) AS SessionsPlayed FROM SessionResult r JOIN PlayerPresentation p ON p.Id=r.PlayerId JOIN Session s ON s.Id=r.SessionId JOIN DayRecord d ON d.Id=s.DayRecordId WHERE d.GroupId=? AND p.IsArchived=0 AND (? IS NULL OR d.RecordDate>=?) AND (? IS NULL OR d.RecordDate<?) GROUP BY p.Id ORDER BY NetAmount DESC,p.Id`,
      groupId,
      start,
      start,
      end,
      end,
    );
    return rows.map((r) => ({
      ...r,
      AveragePerSession: r.NetAmount / r.SessionsPlayed,
    }));
  }
  private async highlightFields(
    groupId: string,
    input: HighlightInput,
    retainedPlayerId?: string | null,
  ) {
    recordDate(input.RecordDate);
    const clean = (v: string | null | undefined) =>
      v == null || (typeof v === "string" && v.trim() === "")
        ? null
        : text(v, "HighlightContent");
    const Title = clean(input.Title),
      Note = clean(input.Note),
      ImageUrl = internalImage(input.ImageUrl ?? null, groupId),
      Amount = input.Amount == null ? null : integer(input.Amount, "Amount");
    ensure(
      Title || Note || ImageUrl || Amount !== null,
      "HighlightRequiresContent",
    );
    if (input.SessionId)
      ensure(
        await this.repo.one(
          "SELECT 1 FROM Session s JOIN DayRecord d ON d.Id=s.DayRecordId WHERE s.Id=? AND d.GroupId=? AND d.RecordDate=?",
          input.SessionId,
          groupId,
          input.RecordDate,
        ),
        "HighlightSessionMismatch",
      );
    if (input.PlayerId)
      ensure(
        await this.repo.one(
          "SELECT 1 FROM Player WHERE Id=? AND GroupId=? AND (IsArchived=0 OR Id=?)",
          input.PlayerId,
          groupId,
          retainedPlayerId ?? null,
        ),
        "CrossGroupPlayer",
      );
    return { Title, Note, ImageUrl, Amount };
  }
  async createHighlight(
    userId: string,
    groupId: string,
    input: HighlightInput,
  ) {
    await this.requireRoomWrite(userId, groupId);
    const fields = await this.highlightFields(groupId, input),
      id = crypto.randomUUID(),
      now = new Date().toISOString();
    await this.repo.batch([
      this.dayInsert(groupId, input.RecordDate),
      this.repo.statement(
        "INSERT INTO Highlight (Id,DayRecordId,SessionId,PlayerId,Title,Note,ImageUrl,CreatedByUserId,CreatedAt,UpdatedAt,Amount) SELECT ?,Id,?,?,?,?,?,?,?,?,? FROM DayRecord WHERE GroupId=? AND RecordDate=?",
        id,
        input.SessionId || null,
        input.PlayerId || null,
        fields.Title,
        fields.Note,
        fields.ImageUrl,
        userId,
        now,
        now,
        fields.Amount,
        groupId,
        input.RecordDate,
      ),
    ]);
    return this.repo.one<Highlight>("SELECT * FROM Highlight WHERE Id=?", id);
  }
  async scopedHighlight(userId: string, id: string, write = false) {
    const h = await this.repo.one<
      Highlight & { GroupId: string; RecordDate: string }
    >(
      "SELECT h.*,d.GroupId,d.RecordDate FROM Highlight h JOIN DayRecord d ON d.Id=h.DayRecordId WHERE h.Id=?",
      id,
    );
    ensure(h, "HighlightNotFound", 404);
    await (write
      ? this.requireRoomWrite(userId, h.GroupId)
      : this.requireRoomRead(userId, h.GroupId));
    if (write)
      ensure(
        h.CreatedByUserId === userId ||
          (await this.isRoomAdmin(userId, h.GroupId)),
        "HighlightWriteAccessRequired",
        403,
      );
    return h;
  }
  async updateHighlight(
    userId: string,
    id: string,
    input: Partial<HighlightInput>,
  ) {
    const h = await this.scopedHighlight(userId, id, true);
    const merged = { ...h, ...input };
    ensure(merged.RecordDate === h.RecordDate, "HighlightDateImmutable");
    const fields = await this.highlightFields(h.GroupId, merged, h.PlayerId);
    await this.repo.run(
      "UPDATE Highlight SET SessionId=?,PlayerId=?,Title=?,Note=?,ImageUrl=?,Amount=?,UpdatedAt=? WHERE Id=?",
      merged.SessionId || null,
      merged.PlayerId || null,
      fields.Title,
      fields.Note,
      fields.ImageUrl,
      fields.Amount,
      new Date().toISOString(),
      id,
    );
    return this.repo.one<Highlight>("SELECT * FROM Highlight WHERE Id=?", id);
  }
  async deleteHighlight(userId: string, id: string) {
    await this.scopedHighlight(userId, id, true);
    await this.repo.run("DELETE FROM Highlight WHERE Id=?", id);
  }
}
