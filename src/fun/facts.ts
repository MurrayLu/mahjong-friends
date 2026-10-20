export const EVENT_IDS = [
  "WIN_STREAK_2",
  "WIN_STREAK_4",
  "LOSS_STREAK_2",
  "LOSS_STREAK_4",
  "RECENT_FORM_STRONG",
  "RECENT_FORM_WEAK",
  "RECENT5_LEADER",
  "RECENT5_BOTTOM",
  "MONTH_RANK_1",
  "LARGE_RANK_LEAD",
  "MONTH_RANK_2_CLOSE",
  "RECENT5_CHASER",
  "TURN_POSITIVE",
  "TURN_NEGATIVE",
  "NEW_PERSONAL_BEST_SESSION",
  "NEW_PERSONAL_WORST_SESSION",
  "NEAR_STREAK_RECORD",
  "HIGH_VOLATILITY",
  "LOW_VOLATILITY_POSITIVE",
  "ONE_HIT_DOMINANT",
  "COMEBACK",
  "ATTENDANCE_LEADER",
  "HIGHLIGHT_REPORTER",
  "CONSISTENT_SMALL_GAINS",
  "BURST_WINNER",
  "HIGH_WIN_RATE_POSITIVE",
  "RANK_IMPROVED",
  "RANK_DROPPED",
  "PLAYER_RETURNED_AFTER_LONG_ABSENCE",
] as const;
export type EventId = (typeof EVENT_IDS)[number];
export interface FunEvent {
  Id: EventId;
  PlayerId: string;
  TriggerSessionId: string | null;
  TriggerDayRecordId: string | null;
  OccurredAt: string;
  Metadata: Record<string, number | string>;
}
export interface FunPlayer {
  Id: string;
  UserId: string | null;
  DisplayName: string;
  AvatarImageUrl: string | null;
  IsArchived: number;
  CreatedAt: string;
}
export interface FunSession {
  Id: string;
  DayRecordId: string;
  RecordDate: string;
  CreatedAt: string;
  HandCount: number | null;
  RateMajor?: number | null;
  RateMinor?: number | null;
  Name: string;
  Results: { PlayerId: string; NetAmount: number }[];
}
export interface FunHighlight {
  CreatorPlayerId?: string | null;
  Id: string;
  DayRecordId: string;
  CreatedAt: string;
  CreatedByUserId: string;
  Title: string | null;
  HasImage: boolean;
}
export interface FunInput {
  GroupId: string;
  Players: FunPlayer[];
  Sessions: FunSession[];
  Highlights: FunHighlight[];
  Appeals: { SessionId: string; PlayerId: string; CreatedAt: string }[];
}
export interface PlayerFacts {
  PlayerId: string;
  Sessions: FunSession[];
  Amounts: number[];
  Days: number;
  Hands: number;
  Net: number;
  MonthNet: number;
  MonthDays: number;
  Rank: number | null;
  WinStreak: number;
  LossStreak: number;
  BestWinStreak: number;
  BestLossStreak: number;
  Recent5: number[];
  Recent10: number[];
  Recent5Net: number;
  Recent10Net: number;
  Volatility: number;
  Attendance: number;
  Highlights: number;
  RecentHighlights: number;
  PartnerDays: Record<string, number>;
  DayTotals: Record<string, number>;
  DayHands: Record<string, number>;
}
export interface FunFacts {
  Today: string;
  Month: string;
  Players: PlayerFacts[];
  GroupDays: number;
  GroupHands: number;
  GroupDayHands: Record<string, number>;
}
const taipeiCalendar=new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
export function taipeiDate(now = new Date()) {
  return taipeiCalendar.format(now);
}
export function dayShift(day: string, days: number) {
  return new Date(Date.parse(day + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
}
export function monthBoundary(month: string) {
  return nextMonth(month) + "-01T00:00:00+08:00";
}
export const effectiveHands = (s: FunSession) => s.HandCount ?? 1;
export const orderedSessions = (sessions: FunSession[]) =>
  [...sessions].sort(
    (a, b) =>
      a.RecordDate.localeCompare(b.RecordDate) ||
      a.CreatedAt.localeCompare(b.CreatedAt) ||
      a.Id.localeCompare(b.Id),
  );
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export function deriveFacts(input: FunInput, today = taipeiDate()): FunFacts {
  const ordered = orderedSessions(input.Sessions);
  const month = today.slice(0, 7);
  const groupDayHands: Record<string, number> = {};
  for (const s of ordered)
    groupDayHands[s.RecordDate] =
      (groupDayHands[s.RecordDate] || 0) + effectiveHands(s);
  const facts = input.Players.map((p) => {
    const sessions = ordered.filter((s) =>
      s.Results.some((r) => r.PlayerId === p.Id),
    );
    const amounts = sessions.map(
      (s) => s.Results.find((r) => r.PlayerId === p.Id)!.NetAmount,
    );
    let w = 0,
      l = 0,
      bw = 0,
      bl = 0;
    for (const n of amounts) {
      w = n > 0 ? w + 1 : 0;
      l = n < 0 ? l + 1 : 0;
      bw = Math.max(bw, w);
      bl = Math.max(bl, l);
    }
    const dayTotals: Record<string, number> = {},
      dayHands: Record<string, number> = {},
      partners = new Map<string, Set<string>>();
    sessions.forEach((s, i) => {
      dayTotals[s.RecordDate] = (dayTotals[s.RecordDate] || 0) + amounts[i];
      dayHands[s.RecordDate] =
        (dayHands[s.RecordDate] || 0) + effectiveHands(s);
      for (const r of s.Results)
        if (r.PlayerId !== p.Id) {
          if (!partners.has(r.PlayerId)) partners.set(r.PlayerId, new Set());
          partners.get(r.PlayerId)!.add(s.RecordDate);
        }
    });
    const recent5 = amounts.slice(-5),
      recent10 = amounts.slice(-10);
    const mean = recent10.length ? sum(recent10) / recent10.length : 0;
    const highlights = input.Highlights.filter((h) =>
      h.CreatorPlayerId === undefined
        ? p.UserId !== null && h.CreatedByUserId === p.UserId
        : h.CreatorPlayerId === p.Id,
    );
    return {
      PlayerId: p.Id,
      Sessions: sessions,
      Amounts: amounts,
      Days: Object.keys(dayTotals).length,
      Hands: sum(sessions.map(effectiveHands)),
      Net: sum(amounts),
      MonthNet: sum(
        sessions.map((s, i) =>
          s.RecordDate.startsWith(month) ? amounts[i] : 0,
        ),
      ),
      MonthDays: new Set(
        sessions
          .filter((s) => s.RecordDate.startsWith(month))
          .map((s) => s.RecordDate),
      ).size,
      Rank: null as number | null,
      WinStreak: w,
      LossStreak: l,
      BestWinStreak: bw,
      BestLossStreak: bl,
      Recent5: recent5,
      Recent10: recent10,
      Recent5Net: sum(recent5),
      Recent10Net: sum(recent10),
      Volatility: Math.sqrt(
        sum(recent10.map((n) => (n - mean) ** 2)) / (recent10.length || 1),
      ),
      Attendance: Object.keys(dayTotals).filter(
        (d) => d >= dayShift(today, -29) && d <= today,
      ).length,
      Highlights: highlights.length,
      RecentHighlights: highlights.filter(
        (h) =>
          taipeiDate(new Date(h.CreatedAt)) >= dayShift(today, -29) &&
          taipeiDate(new Date(h.CreatedAt)) <= today,
      ).length,
      PartnerDays: Object.fromEntries(
        [...partners].map(([id, days]) => [id, days.size]),
      ),
      DayTotals: dayTotals,
      DayHands: dayHands,
    };
  });
  const active = facts.filter(
    (f) =>
      !input.Players.find((p) => p.Id === f.PlayerId)!.IsArchived &&
      f.MonthDays > 0,
  );
  for (const f of active)
    f.Rank = 1 + active.filter((other) => other.MonthNet > f.MonthNet).length;
  return {
    Today: today,
    Month: month,
    Players: facts,
    GroupDays: Object.keys(groupDayHands).length,
    GroupHands: sum(ordered.map(effectiveHands)),
    GroupDayHands: groupDayHands,
  };
}
// Currency is integer; single authoritative fallback uses the median absolute monthly net,
// with a 100-unit floor. Ratio rules never divide by nonpositive amounts.
export function absoluteLeadThreshold(nets: number[]) {
  const a = nets.map(Math.abs).sort((a, b) => a - b);
  return Math.max(100, a[Math.floor(a.length / 2)] || 0);
}
export function largeLead(leader: number, second: number, nets: number[]) {
  return (
    leader > 0 &&
    (second > 0
      ? leader >= second * 2
      : leader - second >= absoluteLeadThreshold(nets))
  );
}
export function closeLead(leader: number, second: number, nets: number[]) {
  return leader > 0
    ? leader - second <= leader * 0.2
    : leader - second <= absoluteLeadThreshold(nets) * 0.2;
}
export function deriveEvents(
  input: FunInput,
  facts = deriveFacts(input),
): FunEvent[] {
  const events: FunEvent[] = [];
  const active = facts.Players.filter(
    (f) => !input.Players.find((p) => p.Id === f.PlayerId)!.IsArchived,
  );
  const r5 = active.filter((f) => f.Recent5.length === 5),
    r10 = active.filter((f) => f.Recent10.length === 10);
  const month = active
    .filter((f) => f.MonthDays > 0)
    .sort(
      (a, b) => b.MonthNet - a.MonthNet || a.PlayerId.localeCompare(b.PlayerId),
    );
  const ordered = orderedSessions(input.Sessions);
  const lastGroup = ordered
    .filter((s) => s.RecordDate.startsWith(facts.Month))
    .at(-1);
  const beforeGroup = lastGroup
    ? deriveFacts(
        { ...input, Sessions: ordered.filter((s) => s !== lastGroup) },
        facts.Today,
      )
    : null;

  for (const f of facts.Players) {
    const last = f.Sessions.at(-1);
    if (!last) continue;
    const n = f.Amounts.at(-1)!;
    const add = (Id: EventId, Metadata: FunEvent["Metadata"] = {}) =>
      events.push({
        Id,
        PlayerId: f.PlayerId,
        TriggerSessionId: last.Id,
        TriggerDayRecordId: last.DayRecordId,
        OccurredAt: last.CreatedAt,
        Metadata,
      });
    const participatedDays = [...new Set(f.Sessions.map((s) => s.RecordDate))];
    if (participatedDays.length >= 2) {
      const previous = participatedDays.at(-2)!;
      const latest = participatedDays.at(-1)!;
      const gap = (Date.parse(`${latest}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`)) / 86400000;
      if (gap >= 30) add("PLAYER_RETURNED_AFTER_LONG_ABSENCE", { days: gap });
    }
    if (f.WinStreak >= 2) add("WIN_STREAK_2", { count: f.WinStreak });
    if (f.WinStreak >= 4) add("WIN_STREAK_4", { count: f.WinStreak });
    if (f.LossStreak >= 2) add("LOSS_STREAK_2", { count: f.LossStreak });
    if (f.LossStreak >= 4) add("LOSS_STREAK_4", { count: f.LossStreak });
    if (f.Recent5.length === 5) {
      if (f.Recent5.filter((n) => n > 0).length >= 4)
        add("RECENT_FORM_STRONG", {
          wins: f.Recent5.filter((n) => n > 0).length,
        });
      if (f.Recent5.filter((n) => n < 0).length >= 4) add("RECENT_FORM_WEAK");
      const positives = f.Recent5.filter((n) => n > 0);
      if (f.Recent5Net > 0 && Math.max(...positives) >= sum(positives) * 0.7)
        add("ONE_HIT_DOMINANT");
    }
    if (f.Recent10.length === 10) {
      const pos = f.Recent10.filter((n) => n > 0);
      if (f.Recent10Net > 0) {
        if (pos.length >= 6 && Math.max(...pos) < sum(pos) * 0.35)
          add("CONSISTENT_SMALL_GAINS");
        if (Math.max(...pos) >= sum(pos) * 0.5) add("BURST_WINNER");
        if (pos.length >= 7) add("HIGH_WIN_RATE_POSITIVE");
      }
    }
    const monthBefore = sum(
      f.Sessions.slice(0, -1).map((s, i) =>
        s.RecordDate.slice(0, 7) === last.RecordDate.slice(0, 7)
          ? f.Amounts[i]
          : 0,
      ),
    );
    if (last.RecordDate.slice(0, 7) === facts.Month) {
      if (monthBefore <= 0 && monthBefore + n > 0) add("TURN_POSITIVE");
      if (monthBefore >= 0 && monthBefore + n < 0) add("TURN_NEGATIVE");
    }
    const prior = f.Amounts.slice(0, -1);
    if (prior.length >= 5) {
      if (n > Math.max(...prior))
        add("NEW_PERSONAL_BEST_SESSION", { amount: n });
      if (n < Math.min(...prior))
        add("NEW_PERSONAL_WORST_SESSION", { amount: n });
    }
    if (f.BestWinStreak >= 3 && f.WinStreak === f.BestWinStreak - 1)
      add("NEAR_STREAK_RECORD", {
        count: f.WinStreak,
        record: f.BestWinStreak,
      });
    for (
      let i = Math.max(0, f.Amounts.length - 4);
      i <= f.Amounts.length - 2;
      i++
    )
      if (
        i >= 2 &&
        f.Amounts[i - 1] < 0 &&
        f.Amounts[i - 2] < 0 &&
        f.Amounts[i] > 0 &&
        f.Amounts[i + 1] > 0 &&
        f.Amounts.slice(i + 2).every((n) => n >= 0)
      ) {
        add("COMEBACK");
        break;
      }
    if (input.Players.find((p) => p.Id === f.PlayerId)!.IsArchived) continue;
    if (f.Recent5.length === 5) {
      if (
        f.Recent5Net > 0 &&
        f.Recent5Net === Math.max(...r5.map((x) => x.Recent5Net))
      )
        add("RECENT5_LEADER", { net: f.Recent5Net });
      if (
        f.Recent5Net < 0 &&
        f.Recent5Net === Math.min(...r5.map((x) => x.Recent5Net))
      )
        add("RECENT5_BOTTOM", { net: f.Recent5Net });
      if (
        f.Rank &&
        f.Rank > 1 &&
        f.Recent5Net > 0 &&
        r5.filter((x) => x.Recent5Net > f.Recent5Net).length < 2
      )
        add("RECENT5_CHASER");
    }
    if (f.MonthDays >= 2 && f.Rank === 1) {
      add("MONTH_RANK_1");
      const second = month.find((x) => x.MonthNet < f.MonthNet)?.MonthNet ?? 0;
      if (
        largeLead(
          f.MonthNet,
          second,
          month.map((x) => x.MonthNet),
        )
      )
        add("LARGE_RANK_LEAD");
    }
    if (
      f.MonthDays >= 2 &&
      f.Rank === 2 &&
      closeLead(
        month[0].MonthNet,
        f.MonthNet,
        month.map((x) => x.MonthNet),
      )
    )
      add("MONTH_RANK_2_CLOSE");
    if (r10.length >= 3 && f.Recent10.length === 10) {
      if (
        f.Volatility > 0 &&
        f.Volatility === Math.max(...r10.map((x) => x.Volatility))
      )
        add("HIGH_VOLATILITY", { dispersion: f.Volatility });
      const lower = [...r10].sort((a, b) => a.Volatility - b.Volatility)[
        Math.floor((r10.length - 1) / 3)
      ].Volatility;
      if (f.Recent10Net > 0 && f.Volatility <= lower)
        add("LOW_VOLATILITY_POSITIVE");
    }
    if (
      f.Attendance >= 3 &&
      f.Attendance === Math.max(...active.map((x) => x.Attendance))
    )
      add("ATTENDANCE_LEADER", { days: f.Attendance });
    if (
      f.RecentHighlights >= 3 &&
      f.RecentHighlights === Math.max(...active.map((x) => x.RecentHighlights))
    )
      add("HIGHLIGHT_REPORTER", { count: f.RecentHighlights });
    if (lastGroup) {
      const old = beforeGroup!.Players.find((x) => x.PlayerId === f.PlayerId)!;
      if (old.Rank && f.Rank && old.Rank !== f.Rank) {
        add(old.Rank > f.Rank ? "RANK_IMPROVED" : "RANK_DROPPED", {
          oldRank: old.Rank,
          newRank: f.Rank,
        });
        Object.assign(events[events.length - 1], {
          TriggerSessionId: lastGroup.Id,
          TriggerDayRecordId: lastGroup.DayRecordId,
          OccurredAt: lastGroup.CreatedAt,
        });
      }
    }
  }
  return events;
}
