import {
  derivePlayerAnalysis,
  type AnalysisPlayer,
  type AnalysisSession,
} from "./player-analysis";
import { LedgerService } from "./service";
import {
  ensure,
  localToday,
  recordDate,
  periodRange,
  recentReportWindow,
} from "../domain/rules";
import type { Highlight, Session, SessionResult } from "../domain/model";
import { deriveSessionTags, type SessionTag } from "../fun/session-tags";
import type { FunSession } from "../fun/facts";

export interface Participation {
  PlayerId: string;
  DisplayName: string;
  AvatarImageUrl: string | null;
  SessionId: string;
  RecordDate: string;
  CreatedAt: string;
  NetAmount: number;
}
export interface PlayerStatistics {
  PlayerId: string;
  DisplayName: string;
  AvatarImageUrl: string | null;
  Total: number;
  MonthTotal: number;
  Sessions: number;
  Wins: number;
  Losses: number;
  Draws: number;
  WinRate: number;
  CurrentStreak: number;
  LongestStreak: number;
  LongestLossStreak: number;
  RecentFive: number;
  Best: number;
  Worst: number;
  Average: number;
}
export function deriveStatistics(
  rows: Participation[],
  today = localToday(),
): PlayerStatistics[] {
  const grouped = new Map<string, Participation[]>();
  for (const row of rows) {
    const participation = grouped.get(row.PlayerId);
    if (participation) participation.push(row);
    else grouped.set(row.PlayerId, [row]);
  }
  return [...grouped.values()]
    .map((participations) => {
      const ordered = [...participations].sort(
        (a, b) =>
          a.RecordDate.localeCompare(b.RecordDate) ||
          a.CreatedAt.localeCompare(b.CreatedAt) ||
          a.SessionId.localeCompare(b.SessionId),
      );
      const first = ordered[0];
      let current = 0,
        longest = 0,
        losses = 0,
        longestLoss = 0;
      for (const r of ordered) {
        current = r.NetAmount > 0 ? current + 1 : 0;
        longest = Math.max(longest, current);
        losses = r.NetAmount < 0 ? losses + 1 : 0;
        longestLoss = Math.max(longestLoss, losses);
      }
      const total = ordered.reduce((sum, r) => sum + r.NetAmount, 0),
        wins = ordered.filter((r) => r.NetAmount > 0).length;
      return {
        PlayerId: first.PlayerId,
        DisplayName: first.DisplayName,
        AvatarImageUrl: first.AvatarImageUrl,
        Total: total,
        MonthTotal: ordered
          .filter((r) => r.RecordDate.slice(0, 7) === today.slice(0, 7))
          .reduce((sum, r) => sum + r.NetAmount, 0),
        Sessions: ordered.length,
        Wins: wins,
        Losses: ordered.filter((r) => r.NetAmount < 0).length,
        Draws: ordered.filter((r) => r.NetAmount === 0).length,
        WinRate: wins / ordered.length,
        CurrentStreak: current,
        LongestStreak: longest,
        LongestLossStreak: longestLoss,
        RecentFive: ordered.slice(-5).reduce((sum, r) => sum + r.NetAmount, 0),
        Best: ordered.reduce(
          (best, r) => Math.max(best, r.NetAmount),
          first.NetAmount,
        ),
        Worst: ordered.reduce(
          (worst, r) => Math.min(worst, r.NetAmount),
          first.NetAmount,
        ),
        Average: total / ordered.length,
      };
    })
    .sort((a, b) => b.Total - a.Total || a.PlayerId.localeCompare(b.PlayerId));
}
export type MetricLeader = {
  PlayerId: string;
  DisplayName: string;
  AvatarImageUrl: string | null;
  MetricValue: number;
} | null;
export function quickStats(stats: PlayerStatistics[]) {
  const leader = (
    key: "CurrentStreak" | "WinRate" | "RecentFive",
    positiveOnly = false,
  ): MetricLeader => {
    const p = [...stats].sort(
      (a, b) => b[key] - a[key] || a.PlayerId.localeCompare(b.PlayerId),
    )[0];
    return p && (!positiveOnly || p[key] > 0)
      ? {
          PlayerId: p.PlayerId,
          DisplayName: p.DisplayName,
          AvatarImageUrl: p.AvatarImageUrl,
          MetricValue: p[key],
        }
      : null;
  };
  return {
    CurrentStreakLeader: leader("CurrentStreak", true),
    WinRateLeader: leader("WinRate"),
    RecentFiveLeader: leader("RecentFive"),
  };
}
export type MobileSession = Session & {
  SessionTags?: Record<string, SessionTag[]>;
  GroupId: string;
  RecordDate: string;
  IsSettled: boolean;
  Results: (SessionResult & {
    DisplayName: string;
    AvatarImageUrl: string | null;
    IsArchived?: number;
  })[];
};
export type DailyReportRow = {
  PlayerId: string;
  DisplayName: string;
  AvatarImageUrl: string | null;
  NetAmount: number;
  SessionsPlayed: number;
};
export type DailyReport = {
  WindowStart: string;
  WindowEnd: string;
  GroupName: string;
  Sessions: number;
  Hands: number;
  Players: number;
  Leader: DailyReportRow | null;
  Leaders: DailyReportRow[];
  Rankings: DailyReportRow[];
  Items: MobileSession[];
};
export function aggregateDailyReport(
  groupName: string,
  items: MobileSession[],
  now = new Date(),
): DailyReport {
  const window = recentReportWindow(now);
  items = items.filter((session) => {
    const time = Date.parse(session.UpdatedAt);
    return (
      session.IsSettled &&
      time >= Date.parse(window.start) &&
      time <= now.getTime()
    );
  });
  const totals = new Map<string, DailyReportRow>();
  for (const session of items) {
    for (const result of session.Results) {
      const current = totals.get(result.PlayerId);
      if (current) {
        current.NetAmount += result.NetAmount;
        current.SessionsPlayed += 1;
      } else {
        totals.set(result.PlayerId, {
          PlayerId: result.PlayerId,
          DisplayName: result.DisplayName,
          AvatarImageUrl: result.AvatarImageUrl,
          NetAmount: result.NetAmount,
          SessionsPlayed: 1,
        });
      }
    }
  }
  const Rankings = [...totals.values()].sort(
    (a, b) => b.NetAmount - a.NetAmount || a.PlayerId.localeCompare(b.PlayerId),
  );
  return {
    WindowStart: window.start,
    WindowEnd: window.end,
    GroupName: groupName,
    Sessions: items.length,
    Hands: items.reduce((sum, session) => sum + (session.HandCount ?? 1), 0),
    Players: new Set(
      items.flatMap((session) =>
        session.Results.map((result) => result.PlayerId),
      ),
    ).size,
    Leader:
      Rankings.length &&
      Rankings.filter((r) => r.NetAmount === Rankings[0].NetAmount).length === 1
        ? Rankings[0]
        : null,
    Leaders: Rankings.filter((r) => r.NetAmount === Rankings[0]?.NetAmount),
    Rankings,
    Items: items,
  };
}
export type HighlightFeed = Highlight & {
  RecordDate: string;
  SessionName: string | null;
  CreatorName: string;
  CreatorAvatar: string | null;
  PlayerName: string | null;
  PlayerAvatar: string | null;
  PlayerIsArchived?: number;
};
export interface Page<T> {
  Items: T[];
  HasMore: boolean;
  NextOffset: number;
}
export class MobileQueries {
  // A separate read gate is used only by the authenticated /api/admin read router.
  // This class has no mutation methods; normal ledger membership/write gates stay unchanged.
  constructor(
    private ledger: LedgerService,
    private readGate?: (userId: string, groupId: string) => Promise<unknown>,
  ) {}
  private authorize(userId: string, groupId: string) {
    return this.readGate
      ? this.readGate(userId, groupId)
      : this.ledger.member(userId, groupId);
  }
  async invitePreview(code: string) {
    ensure(/^[a-f0-9]{64}$/.test(code), "InviteNotFound", 404);
    const preview = await this.ledger.repo.one<{
      Name: string;
      MemberCount: number;
    }>(
      `SELECT g.Name,(SELECT COUNT(*) FROM GroupMember m WHERE m.GroupId=g.Id) AS MemberCount FROM "Group" g WHERE g.InviteCode=?`,
      code,
    );
    ensure(preview, "InviteNotFound", 404);
    return preview;
  }
  async sessionDates(userId: string, groupId: string) {
    await this.authorize(userId, groupId);
    const dates = await this.ledger.repo.many<{ RecordDate: string }>(
      "SELECT DISTINCT d.RecordDate FROM DayRecord d JOIN Session s ON s.DayRecordId=d.Id WHERE d.GroupId=? ORDER BY d.RecordDate",
      groupId,
    );
    return dates.map((d) => d.RecordDate);
  }
  async range(
    userId: string,
    groupId: string,
    period: string,
    from?: string,
    to?: string,
  ) {
    await this.authorize(userId, groupId);
    if (from !== undefined || to !== undefined) {
      const start = recordDate(from),
        end = recordDate(to);
      ensure(start <= end, "InvalidDateRange");
      const dates = await this.sessionDates(userId, groupId);
      ensure(
        dates.length && start >= dates[0] && end <= dates[dates.length - 1],
        "DateRangeOutsideAvailableBounds",
      );
      return [start, end] as const;
    }
    const [start, exclusiveEnd] = periodRange(period);
    const end = exclusiveEnd
      ? new Date(Date.parse(exclusiveEnd + "T00:00:00Z") - 86400000)
          .toISOString()
          .slice(0, 10)
      : null;
    return [start, end] as const;
  }
  async rangeLeaderboard(
    userId: string,
    groupId: string,
    from?: string,
    to?: string,
  ) {
    const [start, end] = await this.range(userId, groupId, "all", from, to);
    const rows = await this.ledger.repo.many<{
      PlayerId: string;
      DisplayName: string;
      AvatarImageUrl: string | null;
      NetAmount: number;
      SessionsPlayed: number;
    }>(
      "SELECT p.Id AS PlayerId,p.DisplayName,p.AvatarImageUrl,SUM(r.NetAmount) AS NetAmount,COUNT(*) AS SessionsPlayed FROM SessionResult r JOIN PlayerPresentation p ON p.Id=r.PlayerId JOIN Session s ON s.Id=r.SessionId JOIN DayRecord d ON d.Id=s.DayRecordId WHERE d.GroupId=? AND p.IsArchived=0 AND d.RecordDate>=? AND d.RecordDate<=? GROUP BY p.Id ORDER BY NetAmount DESC,p.Id",
      groupId,
      start,
      end,
    );
    return rows.map((r) => ({
      ...r,
      AveragePerSession: r.NetAmount / r.SessionsPlayed,
    }));
  }
  async playerAnalysis(
    userId: string,
    groupId: string,
    playerId: string,
    period = "current-month",
    from?: string,
    to?: string,
  ) {
    const [start, end] = await this.range(userId, groupId, period, from, to);
    const player = await this.ledger.repo.one<AnalysisPlayer>(
      `SELECT p.Id AS PlayerId,p.DisplayName,p.AvatarImageUrl,p.IsArchived FROM PlayerPresentation p WHERE p.Id=? AND p.GroupId=?`,
      playerId,
      groupId,
    );
    ensure(player, "PlayerNotFound", 404);
    const rows = await this.ledger.repo.many<AnalysisSession>(
      `SELECT s.Id AS SessionId,s.Name AS SessionName,d.RecordDate,s.CreatedAt,r.NetAmount FROM SessionResult r JOIN Session s ON s.Id=r.SessionId JOIN DayRecord d ON d.Id=s.DayRecordId WHERE r.PlayerId=? AND d.GroupId=? AND (? IS NULL OR d.RecordDate>=?) AND (? IS NULL OR d.RecordDate<=?) ORDER BY d.RecordDate,s.CreatedAt,s.Id`,
      playerId,
      groupId,
      start,
      start,
      end,
      end,
    );
    const rank =
      from !== undefined || to !== undefined
        ? await this.rangeLeaderboard(userId, groupId, from, to)
        : await this.ledger.leaderboard(userId, groupId, period);
    const index = rank.findIndex((r) => r.PlayerId === playerId);
    return derivePlayerAnalysis(
      player!,
      rows,
      { Period: from !== undefined ? "custom" : period, From: start, To: end },
      { Rank: index < 0 ? null : index + 1, ActivePlayerCount: rank.length },
    );
  }
  private pageBounds(limit: number, offset: number) {
    ensure(
      Number.isSafeInteger(limit) &&
        limit >= 1 &&
        limit <= 50 &&
        Number.isSafeInteger(offset) &&
        offset >= 0,
      "InvalidPagination",
    );
  }
  async statistics(
    userId: string,
    groupId: string,
    period = "all",
    from?: string,
    to?: string,
  ) {
    const [start, end] = await this.range(userId, groupId, period, from, to);
    const rows = await this.ledger.repo.many<Participation>(
      `SELECT r.PlayerId,p.DisplayName,p.AvatarImageUrl,r.SessionId,d.RecordDate,s.CreatedAt,r.NetAmount FROM SessionResult r JOIN PlayerPresentation p ON p.Id=r.PlayerId JOIN Session s ON s.Id=r.SessionId JOIN DayRecord d ON d.Id=s.DayRecordId WHERE d.GroupId=? AND p.IsArchived=0 AND (? IS NULL OR d.RecordDate>=?) AND (? IS NULL OR d.RecordDate<=?)`,
      groupId,
      start,
      start,
      end,
      end,
    );
    const Players = deriveStatistics(rows);
    return { Players, ...quickStats(Players) };
  }
  async sessions(
    userId: string,
    groupId: string,
    limit = 3,
    offset = 0,
    date?: string,
  ): Promise<Page<MobileSession>> {
    await this.authorize(userId, groupId);
    this.pageBounds(limit, offset);
    const rows = await this.ledger.repo.many<
      Session & { GroupId: string; RecordDate: string; ResultsJson: string }
    >(
      `SELECT s.*,d.GroupId,d.RecordDate,COALESCE((SELECT json_group_array(json_object('SessionId',r.SessionId,'PlayerId',r.PlayerId,'NetAmount',r.NetAmount,'DisplayName',p.DisplayName,'IsArchived',p.IsArchived,'AvatarImageUrl',p.AvatarImageUrl)) FROM SessionResult r JOIN PlayerPresentation p ON p.Id=r.PlayerId WHERE r.SessionId=s.Id),'[]') AS ResultsJson FROM Session s JOIN DayRecord d ON d.Id=s.DayRecordId WHERE d.GroupId=? AND (? IS NULL OR d.RecordDate=?) ORDER BY d.RecordDate DESC,s.CreatedAt DESC,s.Id DESC LIMIT ? OFFSET ?`,
      groupId,
      date ?? null,
      date ?? null,
      limit + 1,
      offset,
    );
    const Items = rows.slice(0, limit).map(({ ResultsJson, ...s }) => {
      const Results = JSON.parse(ResultsJson) as MobileSession["Results"];
      return {
        ...s,
        Results,
        IsSettled:
          Results.length >= 4 &&
          Results.reduce((sum, r) => sum + BigInt(r.NetAmount), 0n) === 0n,
      };
    });
    // One batch of authoritative history includes participation before the page/date filter.
    const history = await this.ledger.repo.many<
      FunSession & { ResultsJson: string }
    >(
      `SELECT s.*,d.RecordDate,(SELECT json_group_array(json_object('PlayerId',r.PlayerId,'NetAmount',r.NetAmount)) FROM SessionResult r WHERE r.SessionId=s.Id) AS ResultsJson FROM Session s JOIN DayRecord d ON d.Id=s.DayRecordId WHERE d.GroupId=? AND (SELECT COUNT(*) FROM SessionResult r WHERE r.SessionId=s.Id)>=4 AND (SELECT SUM(NetAmount) FROM SessionResult r WHERE r.SessionId=s.Id)=0`,
      groupId,
    );
    const tags = deriveSessionTags(
      history.map((s) => ({ ...s, Results: JSON.parse(s.ResultsJson) })),
    );
    const taggedItems = Items.map((s) => ({
      ...s,
      SessionTags: tags[s.Id] || {},
    }));
    return {
      Items: taggedItems,
      HasMore: rows.length > limit,
      NextOffset: offset + Items.length,
    };
  }
  async dailyReport(
    userId: string,
    groupId: string,
    now = new Date(),
  ): Promise<DailyReport> {
    await this.authorize(userId, groupId);
    const bounds = recentReportWindow(now),
      group = await this.ledger.repo.one<{ Name: string }>(
        'SELECT Name FROM "Group" WHERE Id=?',
        groupId,
      );
    ensure(group, "GroupNotFound", 404);
    const rows = await this.ledger.repo.many<
      Session & { GroupId: string; RecordDate: string; ResultsJson: string }
    >(
      `SELECT s.*,d.GroupId,d.RecordDate,COALESCE((SELECT json_group_array(json_object('SessionId',r.SessionId,'PlayerId',r.PlayerId,'NetAmount',r.NetAmount,'DisplayName',p.DisplayName,'IsArchived',p.IsArchived,'AvatarImageUrl',p.AvatarImageUrl)) FROM SessionResult r JOIN PlayerPresentation p ON p.Id=r.PlayerId WHERE r.SessionId=s.Id),'[]') AS ResultsJson
       FROM Session s JOIN DayRecord d ON d.Id=s.DayRecordId
       WHERE d.GroupId=? AND s.UpdatedAt>=? AND s.UpdatedAt<=?
       AND (SELECT COUNT(*) FROM SessionResult r WHERE r.SessionId=s.Id)>=4
       AND (SELECT COALESCE(SUM(r.NetAmount),0) FROM SessionResult r WHERE r.SessionId=s.Id)=0
       ORDER BY s.UpdatedAt ASC,s.Id ASC`,
      groupId,
      bounds.start,
      bounds.end,
    );
    const Items = rows.map(({ ResultsJson, ...s }) => ({
      ...s,
      Results: JSON.parse(ResultsJson) as MobileSession["Results"],
      IsSettled: true,
    }));
    // UpdatedAt is the existing settlement-write timestamp; no separate completion timestamp exists.
    return aggregateDailyReport(group.Name, Items, now);
  }
  async highlights(
    userId: string,
    groupId: string,
    limit = 5,
    offset = 0,
  ): Promise<Page<HighlightFeed>> {
    await this.authorize(userId, groupId);
    this.pageBounds(limit, offset);
    const rows = await this.ledger.repo.many<HighlightFeed>(
      `SELECT h.*,d.RecordDate,s.Name AS SessionName,COALESCE(c.DisplayName,cu.DisplayName,'玩家') AS CreatorName,COALESCE(c.AvatarImageUrl,cu.AvatarImageUrl) AS CreatorAvatar,p.DisplayName AS PlayerName,p.IsArchived AS PlayerIsArchived,p.AvatarImageUrl AS PlayerAvatar FROM Highlight h JOIN DayRecord d ON d.Id=h.DayRecordId LEFT JOIN Session s ON s.Id=h.SessionId LEFT JOIN UserAccount cu ON cu.Id=h.CreatedByUserId LEFT JOIN PlayerPresentation c ON c.UserId=h.CreatedByUserId AND c.GroupId=d.GroupId LEFT JOIN PlayerPresentation p ON p.Id=h.PlayerId WHERE d.GroupId=? ORDER BY h.CreatedAt DESC,h.Id DESC LIMIT ? OFFSET ?`,
      groupId,
      limit + 1,
      offset,
    );
    return {
      Items: rows.slice(0, limit),
      HasMore: rows.length > limit,
      NextOffset: offset + Math.min(rows.length, limit),
    };
  }
}
