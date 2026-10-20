import { Repository } from "../persistence/repository";
import { ensure } from "../domain/rules";
import { LedgerService } from "./service";
import { MobileQueries } from "./mobile-queries";

export const SITE_ADMIN_EMAIL = "admin@example.invalid";
export function matchesSiteAdmin(
  configuredSub: string | undefined,
  user: { GoogleSubjectId: string | null; Email: string | null },
  proof: {
    VerifiedGoogleSubject: string | null;
    VerifiedGoogleEmail: string | null;
  } | null,
) {
  return !!(
    configuredSub?.trim() &&
    proof &&
    user.GoogleSubjectId === configuredSub &&
    proof.VerifiedGoogleSubject === configuredSub &&
    user.Email?.toLowerCase() === SITE_ADMIN_EMAIL &&
    proof.VerifiedGoogleEmail?.toLowerCase() === SITE_ADMIN_EMAIL
  );
}
// Same authoritative settled-state definition as MobileQueries.sessions / LedgerService.getSession.
export const settledPredicate = `(SELECT COUNT(*) FROM SessionResult r WHERE r.SessionId=s.Id)>=4
 AND (SELECT SUM(r.NetAmount) FROM SessionResult r WHERE r.SessionId=s.Id)=0`;
const DAY = 86400000;
export function siteWindow(now: Date, days: number) {
  return {
    Start: new Date(now.getTime() - days * DAY).toISOString(),
    End: now.toISOString(),
  };
}
export function taipeiDate(now: Date) {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}
export async function recordSiteActivity(
  repo: Repository,
  userId: string,
  now = new Date(),
) {
  // Only Google-linked accounts count as registered/active users. Not an admin-preview event.
  await repo.run(
    `INSERT INTO SiteUserActivity(UserId,UtcDay,LastSeenAt)
    SELECT Id,?,? FROM UserAccount WHERE Id=? AND GoogleSubjectId IS NOT NULL
    ON CONFLICT(UserId,UtcDay) DO UPDATE SET LastSeenAt=MAX(LastSeenAt,excluded.LastSeenAt)`,
    now.toISOString().slice(0, 10),
    now.toISOString(),
    userId,
  );
}
export type AdminPerson = {
  UserId: string;
  DisplayName: string;
  Email: string | null;
};
export type AdminGroup = {
  Id: string;
  Name: string;
  CreatorId: string | null;
  CreatorName: string | null;
  CreatedAt: string;
  LastActivityAt: string;
  MemberCount: number;
  SettledCount: number;
  Admins: AdminPerson[];
};
export type AdminListInput = {
  q?: string;
  sort?: string;
  mode?: string;
  creator?: string;
  admin?: string;
  offset?: number;
  limit?: number;
};
export class SiteAdminQueries {
  constructor(public repo: Repository) {}
  async publicStats() {
    return (await this.repo.one<{
      RecordedPlayers: number;
      Groups: number;
    }>(`SELECT
      (SELECT COUNT(DISTINCT CASE WHEN p.UserId IS NOT NULL THEN 'user:'||p.UserId ELSE 'player:'||p.Id END)
       FROM Player p JOIN "Group" g ON g.Id=p.GroupId
       WHERE EXISTS (SELECT 1 FROM SessionResult r JOIN Session s ON s.Id=r.SessionId
         JOIN DayRecord d ON d.Id=s.DayRecordId WHERE r.PlayerId=p.Id AND d.GroupId=g.Id)) AS RecordedPlayers,
      (SELECT COUNT(*) FROM "Group") AS Groups`))!;
  }
  async dashboard(now = new Date()) {
    const w7 = siteWindow(now, 7),
      w30 = siteWindow(now, 30);
    const start = (await this.repo.one<{ StartedAt: string }>(
      "SELECT StartedAt FROM SiteObservationStart WHERE Id=1",
    ))!.StartedAt;
    const totals = (await this.repo.one<{
      RegisteredUsers: number;
      Groups: number;
      Creators: number;
      Admins: number;
      SettledSessions: number;
      ActiveGroups30: number;
      UnknownSettlementDates: number;
      UnknownRegistrationDates: number;
    }>(
      `SELECT
      (SELECT COUNT(DISTINCT GoogleSubjectId) FROM UserAccount WHERE GoogleSubjectId IS NOT NULL) AS RegisteredUsers,
      (SELECT COUNT(*) FROM "Group") AS Groups,
      (SELECT COUNT(DISTINCT OwnerUserId) FROM "Group") AS Creators,
      (SELECT COUNT(DISTINCT a.UserId) FROM GroupAdmin a JOIN GroupMember m ON m.GroupId=a.GroupId AND m.UserId=a.UserId AND m.AccessLevel='Member') AS Admins,
      (SELECT COUNT(*) FROM Session s WHERE ${settledPredicate}) AS SettledSessions,
      (SELECT COUNT(DISTINCT d.GroupId) FROM Session s JOIN DayRecord d ON d.Id=s.DayRecordId WHERE ${settledPredicate} AND s.SettledAt>=? AND s.SettledAt<=?) AS ActiveGroups30,
      (SELECT COUNT(*) FROM Session s WHERE ${settledPredicate} AND s.SettledAt IS NULL) AS UnknownSettlementDates,
      (SELECT COUNT(*) FROM UserAccount WHERE GoogleSubjectId IS NOT NULL AND GoogleLinkedAt IS NULL) AS UnknownRegistrationDates`,
      w30.Start,
      w30.End,
    ))!;
    const activity = async (w: { Start: string; End: string }) =>
      (await this.repo.one<{ Count: number }>(
        `SELECT COUNT(DISTINCT u.GoogleSubjectId) AS Count FROM SiteUserActivity a JOIN UserAccount u ON u.Id=a.UserId WHERE a.LastSeenAt>=? AND a.LastSeenAt<=?`,
        w.Start,
        w.End,
      ))!.Count;
    const growth = (await this.repo.one<{
      NewUsers30: number;
      NewGroups30: number;
    }>(
      `SELECT
      (SELECT COUNT(*) FROM UserAccount WHERE GoogleSubjectId IS NOT NULL AND GoogleLinkedAt>=? AND GoogleLinkedAt<=?) AS NewUsers30,
      (SELECT COUNT(*) FROM "Group" WHERE CreatedAt>=? AND CreatedAt<=?) AS NewGroups30`,
      w30.Start,
      w30.End,
      w30.Start,
      w30.End,
    ))!;
    const dates = Array.from({ length: 7 }, (_, i) =>
      taipeiDate(new Date(now.getTime() - (6 - i) * DAY)),
    );
    // Seven Taipei calendar buckets (today is partial), separate from rolling metrics.
    const daily = await Promise.all(
      dates.map(async (Date) => {
        const from = new globalThis.Date(
          Date + "T00:00:00+08:00",
        ).toISOString();
        const to = new globalThis.Date(
          globalThis.Date.parse(from) + DAY,
        ).toISOString();
        const row = (await this.repo.one<{ Users: number; Groups: number }>(
          `SELECT
        (SELECT COUNT(*) FROM UserAccount WHERE GoogleSubjectId IS NOT NULL AND GoogleLinkedAt>=? AND GoogleLinkedAt<? AND GoogleLinkedAt<=?) AS Users,
        (SELECT COUNT(*) FROM "Group" WHERE CreatedAt>=? AND CreatedAt<? AND CreatedAt<=?) AS Groups`,
          from,
          to,
          w7.End,
          from,
          to,
          w7.End,
        ))!;
        return { Date, ...row, UsersReliable: start <= from };
      }),
    );
    const CreatorsTop = await this.repo.many<{
      UserId: string;
      DisplayName: string;
      Groups: number;
    }>(
      `SELECT g.OwnerUserId AS UserId,COALESCE(u.DisplayName,'未知建立者') AS DisplayName,COUNT(*) AS Groups FROM "Group" g LEFT JOIN UserAccount u ON u.Id=g.OwnerUserId GROUP BY g.OwnerUserId ORDER BY Groups DESC,g.OwnerUserId LIMIT 10`,
    );
    return {
      ...totals,
      ...growth,
      ActiveUsers7: await activity(w7),
      ActiveUsers30: await activity(w30),
      Daily: daily,
      CreatorsTop,
      ObservationStartedAt: start,
      Active7Reliable: start <= w7.Start,
      Active30Reliable: start <= w30.Start,
      Registration30Reliable: start <= w30.Start,
      ActiveGroups30Reliable: totals.UnknownSettlementDates === 0,
      Window7: w7,
      Window30: w30,
      TimeZone: "Asia/Taipei",
    };
  }
  private bounds(input: AdminListInput) {
    const limit = input.limit ?? 20,
      offset = input.offset ?? 0;
    ensure(
      Number.isSafeInteger(limit) &&
        limit >= 1 &&
        limit <= 50 &&
        Number.isSafeInteger(offset) &&
        offset >= 0,
      "InvalidPagination",
    );
    ensure(!input.q || input.q.length <= 200, "InvalidSearch");
    return { limit, offset };
  }
  async groups(input: AdminListInput = {}) {
    const { limit, offset } = this.bounds(input);
    const filter = `(?='' OR instr(lower(g.Name),lower(?))>0 OR EXISTS(SELECT 1 FROM UserAccount c WHERE c.Id=g.OwnerUserId AND instr(lower(c.DisplayName),lower(?))>0) OR EXISTS(SELECT 1 FROM GroupAdmin a JOIN GroupMember m ON m.GroupId=a.GroupId AND m.UserId=a.UserId AND m.AccessLevel='Member' JOIN UserAccount u ON u.Id=a.UserId WHERE a.GroupId=g.Id AND (instr(lower(u.DisplayName),lower(?))>0 OR instr(lower(COALESCE(u.Email,'')),lower(?))>0)))
      AND (?='' OR g.OwnerUserId=?) AND (?='' OR EXISTS(SELECT 1 FROM GroupAdmin a JOIN GroupMember m ON m.GroupId=a.GroupId AND m.UserId=a.UserId AND m.AccessLevel='Member' WHERE a.GroupId=g.Id AND a.UserId=?))`;
    const q = input.q?.trim() ?? "",
      creator = input.creator ?? "",
      admin = input.admin ?? "";
    const args = [q, q, q, q, q, creator, creator, admin, admin];
    const Total = (await this.repo.one<{ Count: number }>(
      `SELECT COUNT(*) AS Count FROM "Group" g WHERE ${filter}`,
      ...args,
    ))!.Count;
    const orders: Record<string, string> = {
      activity: "LastActivityAt DESC",
      created: "g.CreatedAt DESC",
      oldest: "g.CreatedAt ASC",
      settlements: "SettledCount DESC",
    };
    const sort = input.sort ?? "activity";
    ensure(Object.hasOwn(orders, sort), "InvalidSort");
    const order = orders[sort];
    const rows = await this.repo.many<
      Omit<AdminGroup, "Admins"> & { AdminsJson: string }
    >(
      `SELECT g.Id,g.Name,g.OwnerUserId AS CreatorId,c.DisplayName AS CreatorName,g.CreatedAt,
      MAX(g.UpdatedAt,COALESCE((SELECT MAX(s.UpdatedAt) FROM Session s JOIN DayRecord d ON d.Id=s.DayRecordId WHERE d.GroupId=g.Id),g.CreatedAt),COALESCE((SELECT MAX(h.UpdatedAt) FROM Highlight h JOIN DayRecord d ON d.Id=h.DayRecordId WHERE d.GroupId=g.Id),g.CreatedAt)) AS LastActivityAt,
      (SELECT COUNT(*) FROM GroupMember m WHERE m.GroupId=g.Id) AS MemberCount,
      (SELECT COUNT(*) FROM Session s JOIN DayRecord d ON d.Id=s.DayRecordId WHERE d.GroupId=g.Id AND ${settledPredicate}) AS SettledCount,
      (SELECT json_group_array(json_object('UserId',u.Id,'DisplayName',u.DisplayName,'Email',u.Email)) FROM GroupAdmin a JOIN GroupMember m ON m.GroupId=a.GroupId AND m.UserId=a.UserId AND m.AccessLevel='Member' JOIN UserAccount u ON u.Id=a.UserId WHERE a.GroupId=g.Id) AS AdminsJson
      FROM "Group" g LEFT JOIN UserAccount c ON c.Id=g.OwnerUserId WHERE ${filter} ORDER BY ${order},g.Id LIMIT ? OFFSET ?`,
      ...args,
      limit,
      offset,
    );
    return {
      Items: rows.map(({ AdminsJson, ...g }) => ({
        ...g,
        Admins: JSON.parse(AdminsJson) as AdminPerson[],
      })),
      Total,
      Offset: offset,
      Limit: limit,
      HasMore: offset + rows.length < Total,
    };
  }
  async admins(input: AdminListInput = {}) {
    const { limit, offset } = this.bounds(input),
      q = input.q?.trim() ?? "";
    const filter = `(?='' OR instr(lower(u.DisplayName),lower(?))>0 OR instr(lower(COALESCE(u.Email,'')),lower(?))>0 OR EXISTS(SELECT 1 FROM GroupAdmin ga JOIN "Group" g ON g.Id=ga.GroupId LEFT JOIN UserAccount c ON c.Id=g.OwnerUserId WHERE ga.UserId=u.Id AND (instr(lower(g.Name),lower(?))>0 OR instr(lower(c.DisplayName),lower(?))>0)))`;
    const args = [q, q, q, q, q];
    const base = `FROM UserAccount u JOIN GroupAdmin a ON a.UserId=u.Id JOIN "Group" g ON g.Id=a.GroupId JOIN GroupMember m ON m.GroupId=a.GroupId AND m.UserId=a.UserId AND m.AccessLevel='Member' WHERE ${filter}`;
    const Total = (await this.repo.one<{ Count: number }>(
      `SELECT COUNT(DISTINCT u.Id) AS Count ${base}`,
      ...args,
    ))!.Count;
    const Items = await this.repo.many<
      AdminPerson & { Groups: number; CreatedGroups: number }
    >(
      `SELECT u.Id AS UserId,u.DisplayName,u.Email,COUNT(*) AS Groups,SUM(CASE WHEN g.OwnerUserId=u.Id THEN 1 ELSE 0 END) AS CreatedGroups ${base} GROUP BY u.Id ORDER BY Groups DESC,u.Id LIMIT ? OFFSET ?`,
      ...args,
      limit,
      offset,
    );
    return {
      Items,
      Total,
      Offset: offset,
      Limit: limit,
      HasMore: offset + Items.length < Total,
    };
  }
  async requireGroup(groupId: string) {
    const group = await this.repo.one<{
      Id: string;
      Name: string;
      CreatedAt: string;
    }>('SELECT Id,Name,CreatedAt FROM "Group" WHERE Id=?', groupId);
    ensure(group, "GroupNotFound", 404);
    return group;
  }
  // Reuse MobileQueries' exact reads, derived totals and tags without creating a
  // membership, a projection, a read cursor, or a write-capable impersonated ledger.
  readQueries() {
    return new MobileQueries(new LedgerService(this.repo), (_userId, id) =>
      this.requireGroup(id),
    );
  }
  async preview(groupId: string, period = "all") {
    const Group = await this.requireGroup(groupId),
      queries = this.readQueries();
    const Statistics = await queries.statistics("", groupId, period);
    const Ranking = Statistics.Players.map((p) => ({
      PlayerId: p.PlayerId,
      DisplayName: p.DisplayName,
      AvatarImageUrl: p.AvatarImageUrl,
      NetAmount: p.Total,
      SessionsPlayed: p.Sessions,
      AveragePerSession: p.Average,
    }));
    const Members = await this.repo.many<
      AdminPerson & {
        AccessLevel: string;
        IsAdmin: number;
        AvatarImageUrl: string | null;
      }
    >(
      `SELECT u.Id AS UserId,u.DisplayName,u.Email,u.AvatarImageUrl,m.AccessLevel,EXISTS(SELECT 1 FROM GroupAdmin a WHERE a.GroupId=m.GroupId AND a.UserId=m.UserId) AS IsAdmin FROM GroupMember m JOIN UserAccount u ON u.Id=m.UserId WHERE m.GroupId=? ORDER BY m.JoinedAt,m.UserId`,
      groupId,
    );
    return {
      Group,
      Members,
      Statistics,
      Ranking,
      Sessions: await queries.sessions("", groupId, 20),
      Highlights: await queries.highlights("", groupId, 20),
      DailyReport: await queries.dailyReport("", groupId),
      ReadOnly: true as const,
    };
  }
  audit(
    userId: string,
    groupId: string,
    outcome: "allowed" | "not-found" | "failed",
  ) {
    return this.repo.run(
      "INSERT INTO SiteAdminAudit VALUES (?,?,?,?,?)",
      crypto.randomUUID(),
      userId,
      groupId,
      new Date().toISOString(),
      outcome,
    );
  }
}
export type SiteDashboard = Awaited<ReturnType<SiteAdminQueries["dashboard"]>>;
export type AdminGroupPage = Awaited<ReturnType<SiteAdminQueries["groups"]>>;
export type AdminPeoplePage = Awaited<ReturnType<SiteAdminQueries["admins"]>>;
export type AdminPreview = Awaited<ReturnType<SiteAdminQueries["preview"]>>;
