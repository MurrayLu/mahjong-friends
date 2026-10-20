import {
  deriveFacts,
  deriveEvents,
  orderedSessions,
  effectiveHands,
  largeLead,
  monthBoundary,
  sum,
  nextMonth,
  type FunInput,
  type FunSession,
  type FunEvent,
  taipeiDate,
} from "./facts";
export interface Unlock {
  PlayerId: string | null;
  AchievementId: string;
  UnlockedAt: string;
  TriggerSessionId: string | null;
  TriggerDayRecordId: string | null;
  Metadata: Record<string, unknown>;
}
export function replayAchievements(input: FunInput, today: string) {
  const player = new Map<string, Unlock>(),
    group = new Map<string, Unlock>();
  const ordered = orderedSessions(input.Sessions);
  const Records: FunEvent[] = [];
  const unlock = (
    id: string,
    p: string | null,
    s: FunSession | null,
    date: string,
    metadata: Record<string, unknown> = {},
  ) => {
    const key = (p || "GROUP") + id;
    const target = p ? player : group;
    if (!target.has(key))
      target.set(key, {
        PlayerId: p,
        AchievementId: id,
        UnlockedAt: date,
        TriggerSessionId: s?.Id || null,
        TriggerDayRecordId: s?.DayRecordId || null,
        Metadata: metadata,
      });
  };
  const dateOf = (s: FunSession) => s.RecordDate + "T00:00:00+08:00";
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i],
      prefix = {
        ...input,
        Players: input.Players.map((p) => ({ ...p, IsArchived: 0 })),
        Sessions: ordered.slice(0, i + 1),
        Highlights: input.Highlights.filter(
          (h) => taipeiComparison(h.CreatedAt) <= s.RecordDate,
        ),
      };
    const facts = deriveFacts(prefix, s.RecordDate);
    const es = deriveEvents(prefix, facts);
    Records.push(
      ...es.filter(
        (e) =>
          e.TriggerSessionId === s.Id &&
          (e.Id === "NEW_PERSONAL_BEST_SESSION" ||
            e.Id === "NEW_PERSONAL_WORST_SESSION"),
      ),
    );
    for (const f of facts.Players) {
      if (!s.Results.some((r) => r.PlayerId === f.PlayerId)) continue;
      const p = f.PlayerId;
      const n = s.Results.find((r) => r.PlayerId === p)!.NetAmount;
      const prior = f.Amounts.slice(0, -1);
      const at = dateOf(s);
      [1, 3, 5, 10, 20].forEach((goal, j) => {
        if (f.Days >= goal)
          unlock("A" + String(j + 1).padStart(2, "0"), p, s, at, {
            days: f.Days,
          });
      });
      [10, 25, 50, 100].forEach((goal, j) => {
        if (f.Hands >= goal)
          unlock("A" + String(j + 6).padStart(2, "0"), p, s, at, {
            hands: f.Hands,
          });
      });
      [2, 5, 10].forEach((goal, j) => {
        if ((f.DayHands[s.RecordDate] || 0) >= goal)
          unlock("A" + String(j + 10).padStart(2, "0"), p, s, at);
      });
      if (f.WinStreak >= 2) unlock("A13", p, s, at);
      if (f.WinStreak >= 4) unlock("A14", p, s, at);
      if (f.Recent5.length === 5 && f.Recent5.filter((n) => n > 0).length >= 4)
        unlock("A15", p, s, at);
      if (prior.length >= 5 && n > 0 && n > Math.max(...prior))
        unlock("A16", p, s, at, { amount: n });
      if (f.Days >= 5 && f.Net > 0) unlock("A17", p, s, at);
      if (es.some((e) => e.PlayerId === p && e.Id === "TURN_POSITIVE"))
        unlock("A18", p, s, at);
      const priorAmounts = ordered
        .slice(0, i)
        .flatMap((s) => s.Results.map((r) => r.NetAmount));
      if (i >= 5 && n > 0 && n > Math.max(...priorAmounts))
        unlock("A21", p, s, at, { amount: n });
      if (es.some((e) => e.PlayerId === p && e.Id === "RECENT5_LEADER"))
        unlock("A22", p, s, at);
      if (f.LossStreak >= 2) unlock("A24", p, s, at);
      if (f.LossStreak >= 4) unlock("A25", p, s, at);
      if (prior.length >= 5 && n < 0 && n < Math.min(...prior))
        unlock("A27", p, s, at, { amount: n });
      if (es.some((e) => e.PlayerId === p && e.Id === "RECENT5_BOTTOM"))
        unlock("A29", p, s, at);
      if (Math.max(0, ...Object.values(f.PartnerDays)) >= 10)
        unlock("A30", p, s, at);
      if (Object.values(f.PartnerDays).filter((n) => n >= 3).length >= 3)
        unlock("A31", p, s, at);
      if (n === 0) unlock("A36", p, s, at);
      if (
        f.WinStreak >= 2 &&
        f.Amounts.slice(0, -f.WinStreak).some(
          (_, j, a) => j >= 3 && a.slice(j - 3, j + 1).every((n) => n < 0),
        )
      )
        unlock("A38", p, s, at);
      // Day-based claims use all recorded sessions for the date, never a misleading partial-day net.
      const day = input.Sessions.filter(
        (x) =>
          x.RecordDate === s.RecordDate &&
          x.Results.some((r) => r.PlayerId === p),
      );
      const finalDay = orderedSessions(day).at(-1);
      if (finalDay?.Id === s.Id) {
        const ns = day.map(
          (x) => x.Results.find((r) => r.PlayerId === p)!.NetAmount,
        );
        const dayNet = sum(ns);
        if (day.length >= 2 && ns.some((n) => n < 0) && dayNet > 0)
          unlock("A23", p, s, at);
        const priorDays = Object.entries(f.DayTotals)
          .filter(([d]) => d < s.RecordDate)
          .map(([, n]) => n);
        if (priorDays.length && dayNet < 0 && dayNet < Math.min(...priorDays))
          unlock("A28", p, s, at, { amount: dayNet });
        const winners = day.filter((x) => {
          const n = x.Results.find((r) => r.PlayerId === p)!.NetAmount;
          return n > 0 && n === Math.max(...x.Results.map((r) => r.NetAmount));
        });
        const losers = day.filter((x) => {
          const n = x.Results.find((r) => r.PlayerId === p)!.NetAmount;
          return n < 0 && n === Math.min(...x.Results.map((r) => r.NetAmount));
        });
        if (winners.some((w) => losers.some((l) => w.Id !== l.Id)))
          unlock("A37", p, s, at);
      }
    }
    if (facts.GroupDays >= 1) unlock("G01", null, s, dateOf(s));
    if (facts.GroupDays >= 5) unlock("G02", null, s, dateOf(s));
    if (facts.GroupDays >= 20) unlock("G03", null, s, dateOf(s));
    if (facts.GroupHands >= 100) unlock("G04", null, s, dateOf(s));
    if (facts.GroupDayHands[s.RecordDate] >= 10)
      unlock("G05", null, s, dateOf(s));
    const active = input.Players.filter(
      (p) => !p.IsArchived && p.CreatedAt <= s.CreatedAt,
    );
    if (
      active.length >= 4 &&
      active.every((p) => [...player.values()].some((a) => a.PlayerId === p.Id))
    )
      unlock("G07", null, s, dateOf(s), { playerIds: active.map((p) => p.Id) });
  }
  for (const p of input.Players) {
    const hs = [...input.Highlights]
      .filter((h) =>
        h.CreatorPlayerId === undefined
          ? p.UserId && h.CreatedByUserId === p.UserId
          : h.CreatorPlayerId === p.Id,
      )
      .sort(
        (a, b) =>
          a.CreatedAt.localeCompare(b.CreatedAt) || a.Id.localeCompare(b.Id),
      );
    for (let i = 0; i < hs.length; i++) {
      const h = hs[i],
        metadata = { highlightId: h.Id };
      if (h.HasImage) unlock("A32", p.Id, null, h.CreatedAt, metadata);
      if (i + 1 >= 5) unlock("A33", p.Id, null, h.CreatedAt, metadata);
      if (i + 1 >= 10) unlock("A34", p.Id, null, h.CreatedAt, metadata);
    }
  }
  const hs = [...input.Highlights].sort(
    (a, b) =>
      a.CreatedAt.localeCompare(b.CreatedAt) || a.Id.localeCompare(b.Id),
  );
  if (hs.length >= 20)
    unlock("G06", null, null, hs[19].CreatedAt, { highlightId: hs[19].Id });
  for (const a of [...input.Appeals].sort((a, b) =>
    a.CreatedAt.localeCompare(b.CreatedAt),
  )) {
    const s = input.Sessions.find((s) => s.Id === a.SessionId) || null;
    unlock("A35", a.PlayerId, s, a.CreatedAt, {
      provenanceSessionId: a.SessionId,
    });
  }
  const months = [...new Set(ordered.map((s) => s.RecordDate.slice(0, 7)))]
    .filter((m) => m < today.slice(0, 7))
    .sort();
  const champions = new Map<string, Set<string>>();
  for (const month of months) {
    const sessions = ordered.filter((s) => s.RecordDate.startsWith(month));
    const facts = deriveFacts({ ...input, Sessions: sessions }, month + "-28");
    const eligible = facts.Players.filter((f) => f.MonthDays > 0);
    const top = Math.max(...eligible.map((f) => f.MonthNet)),
      bottom = Math.min(...eligible.map((f) => f.MonthNet));
    const champ = new Set<string>();
    const lineage = sessions.at(-1)!;
    const boundary = monthBoundary(month);
    for (const f of eligible) {
      const id = f.PlayerId;
      if (f.MonthDays >= 2 && f.MonthNet === top) {
        champ.add(id);
        unlock("A19", id, lineage, boundary, { month });
        const previous = [...champions.keys()].at(-1);
        if (
          previous &&
          nextMonth(previous) === month &&
          champions.get(previous)!.has(id)
        )
          unlock("A20", id, lineage, boundary, { month });
        const second =
          eligible
            .filter((x) => x.MonthNet < top)
            .sort((a, b) => b.MonthNet - a.MonthNet)[0]?.MonthNet ?? 0;
        if (
          largeLead(
            top,
            second,
            eligible.map((x) => x.MonthNet),
          )
        )
          unlock("A39", id, lineage, boundary, { month });
        let wasLast = false;
        for (let i = 0; i < sessions.length - 1; i++) {
          const snap = deriveFacts(
            { ...input, Sessions: sessions.slice(0, i + 1) },
            month + "-28",
          );
          const present = snap.Players.filter((x) => x.MonthDays > 0);
          const me = present.find((x) => x.PlayerId === id);
          if (
            present.length >= 4 &&
            me &&
            me.MonthNet === Math.min(...present.map((x) => x.MonthNet)) &&
            present.some((x) => x.MonthNet > me.MonthNet)
          )
            wasLast = true;
        }
        if (wasLast) unlock("A40", id, lineage, boundary, { month });
      }
      if (f.MonthDays >= 2 && f.MonthNet === bottom)
        unlock("A26", id, lineage, boundary, { month });
    }
    champions.set(month, champ);
  }
  // Include non-session unlocks (photos and explicit appeals) in the shared milestone.
  const active = input.Players.filter((p) => !p.IsArchived);
  if (active.length >= 4) {
    const first = active.map(
      (p) =>
        [...player.values()]
          .filter((a) => a.PlayerId === p.Id)
          .sort(
            (a, b) => Date.parse(a.UnlockedAt) - Date.parse(b.UnlockedAt),
          )[0],
    );
    if (first.every(Boolean)) {
      const at = first
        .map((a) => a.UnlockedAt)
        .sort((a, b) => Date.parse(a) - Date.parse(b))
        .at(-1)!;
      const key = "GROUPG07";
      const old = group.get(key);
      if (!old || Date.parse(at) < Date.parse(old.UnlockedAt)) {
        group.delete(key);
        unlock(
          "G07",
          null,
          input.Sessions.find(
            (s) =>
              s.Id === first.find((a) => a.UnlockedAt === at)?.TriggerSessionId,
          ) || null,
          at,
          { playerIds: active.map((p) => p.Id) },
        );
      }
    }
  }
  return {
    Records,
    Player: [...player.values()],
    Group: [...group.values()],
    ClosedMonths: months,
  };
}
function taipeiComparison(at: string) {
  return taipeiDate(new Date(at));
}
