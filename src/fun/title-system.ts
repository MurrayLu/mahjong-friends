import {
  deriveFacts,
  deriveEvents,
  effectiveHands,
  orderedSessions,
  sum,
  type FunInput,
  type FunSession,
  type EventId,
} from "./facts";
import { deriveInactivityFacts } from "./inactivity";

export type TitleCategory =
  "ACTIVITY" | "STATE" | "STANDING" | "STYLE" | "SOCIAL" | "RECORD";
export interface TitleDefinition {
  Id: string;
  Name: string;
  Icon: string;
  Category: TitleCategory;
  EventId: EventId | null;
  Priority: number;
  UserDescription: string;
  Current?: string;
}
const rows: [
  string,
  string,
  string,
  TitleCategory,
  number,
  EventId | null,
  string,
][] = [
  [
    "T01",
    "🔥",
    "手感火熱",
    "STATE",
    90,
    "WIN_STREAK_2",
    "目前連續 2 次以上正收益。",
  ],
  [
    "T02",
    "🌋",
    "勢不可擋",
    "STATE",
    95,
    "WIN_STREAK_4",
    "目前連續 4 次以上正收益。",
  ],
  [
    "T03",
    "❄️",
    "最近有點冷",
    "STATE",
    88,
    "LOSS_STREAK_2",
    "目前連續 2 次以上負收益。",
  ],
  [
    "T04",
    "🧊",
    "冰封中",
    "STATE",
    94,
    "LOSS_STREAK_4",
    "目前連續 4 次以上負收益。",
  ],
  [
    "T05",
    "🌊",
    "回溫中",
    "STATE",
    91,
    "COMEBACK",
    "至少兩連敗後，目前形成兩連勝。",
  ],
  [
    "T06",
    "🏃",
    "只差一步",
    "STATE",
    92,
    "NEAR_STREAK_RECORD",
    "歷史最長連勝至少 3 次，目前距紀錄差 1 次。",
  ],
  [
    "T07",
    "📈",
    "穩定輸出",
    "STATE",
    82,
    "RECENT_FORM_STRONG",
    "完整最近 5 次參與中，至少 4 次正收益。",
  ],
  [
    "T08",
    "🫠",
    "最近不太妙",
    "STATE",
    81,
    "RECENT_FORM_WEAK",
    "完整最近 5 次參與中，至少 4 次負收益。",
  ],
  [
    "T09",
    "🪄",
    "剛剛翻紅",
    "STATE",
    93,
    "TURN_POSITIVE",
    "本月累積由非正數轉正。",
  ],
  [
    "T10",
    "🚀",
    "近期最旺",
    "STANDING",
    84,
    "RECENT5_LEADER",
    "完整近 5 場累積最高且為正，並列皆符合。",
  ],
  [
    "T11",
    "🕳️",
    "暫居地下室",
    "STANDING",
    79,
    "RECENT5_BOTTOM",
    "完整近 5 場累積最低且為負，並列皆符合。",
  ],
  [
    "T12",
    "👑",
    "本月龍頭",
    "STANDING",
    72,
    "MONTH_RANK_1",
    "本月排名第一，且參與至少 2 個麻將日。",
  ],
  [
    "T13",
    "🏰",
    "高處不勝寒",
    "STANDING",
    78,
    "LARGE_RANK_LEAD",
    "本月排名第一且依房間收益比例明顯領先。",
  ],
  [
    "T14",
    "🥈",
    "緊追不捨",
    "STANDING",
    70,
    "MONTH_RANK_2_CLOSE",
    "本月排名第二且依既有比例規則接近第一。",
  ],
  [
    "T15",
    "🚶",
    "默默追趕",
    "STANDING",
    68,
    "RECENT5_CHASER",
    "本月非第一，近 5 場為正且表現前二。",
  ],
  [
    "T16",
    "🏆",
    "牌桌霸主",
    "STANDING",
    80,
    null,
    "房間與自己均有至少 3 個麻將日，生涯累積收益最高。",
  ],
  [
    "T17",
    "❤️",
    "慈善家",
    "STANDING",
    77,
    null,
    "房間與自己均有至少 3 個麻將日，生涯累積收益最低。",
  ],
  [
    "T18",
    "🎯",
    "常勝軍",
    "STYLE",
    66,
    "HIGH_WIN_RATE_POSITIVE",
    "完整近 10 場勝率至少 70%，總收益為正。",
  ],
  [
    "T19",
    "💥",
    "一把定江山",
    "STYLE",
    76,
    "ONE_HIT_DOMINANT",
    "完整近 5 場總收益為正，最大正收益占正收益總和至少 70%。",
  ],
  [
    "T20",
    "🐜",
    "積少成多",
    "STYLE",
    63,
    "CONSISTENT_SMALL_GAINS",
    "完整近 10 場至少 6 勝、總收益為正，單次最大獲利低於正收益總和 35%。",
  ],
  [
    "T21",
    "🎢",
    "雲霄飛車",
    "STYLE",
    64,
    "HIGH_VOLATILITY",
    "至少 3 位有完整近 10 場有效底數樣本，自己的每將底數標準差最高。",
  ],
  [
    "T22",
    "🧱",
    "穩如泰山",
    "STYLE",
    65,
    "LOW_VOLATILITY_POSITIVE",
    "至少 3 位有完整近 10 場有效底數樣本，自己的波動在最低三分之一且收益為正。",
  ],
  [
    "T23",
    "🧘",
    "佛系玩家",
    "STYLE",
    61,
    null,
    "至少 10 場、所有底數有效，長期每將平均底數的絕對值最接近零。",
  ],
  [
    "T24",
    "📈📉",
    "大起大落",
    "STYLE",
    62,
    null,
    "完整近 10 場有效底數樣本中，最高到最低每將底數跨度最大。",
  ],
  [
    "T25",
    "🪑",
    "常駐居民",
    "SOCIAL",
    50,
    "ATTENDANCE_LEADER",
    "最近 30 天參與麻將日最多，至少 3 天。",
  ],
  [
    "T26",
    "📋",
    "全勤獎",
    "SOCIAL",
    53,
    null,
    "房間至少 5 個麻將日，最近 5 個麻將日全部參與。",
  ],
  [
    "T27",
    "🦾",
    "鐵人",
    "SOCIAL",
    52,
    null,
    "房間至少 5 個麻將日，生涯累積參與將數最多。",
  ],
  [
    "T28",
    "🛬",
    "稀客",
    "SOCIAL",
    54,
    null,
    "最近一次回桌，與前次參與之間錯過至少 5 個房間麻將日。",
  ],
  [
    "T29",
    "🧓",
    "元老",
    "SOCIAL",
    49,
    null,
    "房間至少 5 個麻將日，曾參與房間首個麻將日。",
  ],
  [
    "T30",
    "📸",
    "戰地記者",
    "SOCIAL",
    51,
    "HIGHLIGHT_REPORTER",
    "最近 30 天新增精華最多，至少 3 則。",
  ],
  [
    "R01",
    "💰",
    "單場之王",
    "RECORD",
    83,
    null,
    "房間至少 6 場已結算紀錄，目前持有歷史最高正收益單場紀錄。",
  ],
  [
    "R02",
    "💀",
    "史詩級放水",
    "RECORD",
    83,
    null,
    "房間至少 6 場已結算紀錄，目前持有歷史最低負收益單場紀錄。",
  ],
  [
    "MISSING_PERSON",
    "🫥",
    "失蹤人口",
    "ACTIVITY",
    100,
    null,
    "一個月沒看到人，但這桌可沒停。",
  ],
  [
    "AVOIDING_TABLE",
    "🫣",
    "避戰中",
    "ACTIVITY",
    99,
    null,
    "半個月沒上桌了。是忙，還是怕了？",
  ],
];
export const TITLES: TitleDefinition[] = rows.map(
  ([Id, Icon, Name, Category, Priority, EventId, UserDescription]) => ({
    Id,
    Icon,
    Name,
    Category,
    Priority,
    EventId,
    UserDescription,
  }),
);
export const SENIORITY_LEVELS = [
  ["S1", "🀄", "麻將萌新", 1],
  ["S2", "🎴", "牌桌學徒", 5],
  ["S3", "🀄", "摸牌熟手", 10],
  ["S4", "🎯", "聽牌高手", 25],
  ["S5", "🧓", "牌桌老江湖", 50],
  ["S6", "🐉", "麻將宗師", 100],
  ["S7", "👑", "傳說雀神", 200],
].map(([Id, Icon, Name, Threshold]) => ({
  Id: String(Id),
  Icon: String(Icon),
  Name: String(Name),
  Threshold: Number(Threshold),
}));
export function seniority(hands: number) {
  const index = Math.max(
    0,
    SENIORITY_LEVELS.filter((l) => hands >= l.Threshold).length - 1,
  );
  return {
    ...SENIORITY_LEVELS[index],
    Hands: hands,
    Next: SENIORITY_LEVELS[index + 1] || null,
  };
}
export type SeniorityTitle = ReturnType<typeof seniority>;
export function bottomsPerHand(s: FunSession, net: number): number | null {
  const base = s.RateMajor,
    hands = effectiveHands(s);
  return typeof base === "number" &&
    Number.isFinite(base) &&
    base > 0 &&
    Number.isFinite(hands) &&
    hands > 0 &&
    Number.isFinite(net)
    ? net / hands / base
    : null;
}
export function selectTitles(eligible: TitleDefinition[], limit = 2) {
  const ordered = [...eligible].sort(
    (a, b) => b.Priority - a.Priority || a.Id.localeCompare(b.Id),
  );
  const seen = new Set<TitleCategory>();
  return ordered
    .filter((t) => {
      if (seen.has(t.Category)) return false;
      seen.add(t.Category);
      return true;
    })
    .slice(0, limit);
}
export function deriveTitles(input: FunInput, today: string) {
  const inactivity = deriveInactivityFacts(input, today);
  const facts = deriveFacts(input, today),
    events = deriveEvents(input, facts);
  const active = facts.Players.filter(
    (f) => !input.Players.find((p) => p.Id === f.PlayerId)!.IsArchived,
  );
  const lifetime = facts.Players.filter((f) => f.Days >= 3);
  const groupDays = Object.keys(facts.GroupDayHands).sort();
  const ordered = orderedSessions(input.Sessions);
  const normalized = facts.Players.map((f) => {
    const values = f.Sessions.slice(-10).map((s, i) =>
      bottomsPerHand(s, f.Recent10[i]),
    );
    const valid = values.length === 10 && values.every((v) => v !== null);
    const xs = valid ? (values as number[]) : [];
    const mean = sum(xs) / (xs.length || 1);
    const allValid = f.Sessions.every((s) => bottomsPerHand(s, 0) !== null);
    return {
      id: f.PlayerId,
      valid,
      std: Math.sqrt(sum(xs.map((v) => (v - mean) ** 2)) / (xs.length || 1)),
      range: xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
      average:
        allValid && f.Sessions.length >= 10
          ? sum(f.Sessions.map((s, i) => f.Amounts[i] / s.RateMajor!)) / f.Hands
          : null,
    };
  });
  const n10 = normalized.filter(
    (n) => n.valid && active.some((f) => f.PlayerId === n.id),
  );
  const averages = normalized.filter(
    (n) => n.average !== null && active.some((f) => f.PlayerId === n.id),
  );
  const records = ordered.flatMap((s) => s.Results);
  return facts.Players.map((f) => {
    const ids = new Set(
      events.filter((e) => e.PlayerId === f.PlayerId).map((e) => e.Id),
    );
    const eligible = TITLES.filter(
      (t) =>
        t.EventId &&
        ids.has(t.EventId) &&
        !["T05", "T13", "T14", "T21", "T22"].includes(t.Id),
    ).map((t) => ({ ...t }));
    const add = (id: string, current?: string) => {
      const t = TITLES.find((t) => t.Id === id)!;
      eligible.push({ ...t, Current: current });
    };
    const absence = inactivity.find((p) => p.PlayerId === f.PlayerId)!;
    if (
      !input.Players.find((p) => p.Id === f.PlayerId)!.IsArchived &&
      absence.PlayerHasHistoricalParticipation &&
      absence.RoomRecentlyActiveAfterPlayerLastParticipation
    ) {
      const days = absence.DaysSinceLastParticipation!;
      if (days >= 30) add("MISSING_PERSON", `${days} 天沒上桌`);
      else if (days >= 15) add("AVOIDING_TABLE", `${days} 天沒上桌`);
    }
    // Recovery is current only: exactly two positive results immediately after a loss run.
    if (f.WinStreak === 2 && f.Amounts.at(-3)! < 0 && f.Amounts.at(-4)! < 0)
      add("T05", "2 連勝");
    const nets = active.filter((p) => p.MonthDays > 0).map((p) => p.MonthNet);
    const others = active.filter(
      (p) => p.PlayerId !== f.PlayerId && p.MonthDays > 0,
    );
    const second = others.length
      ? Math.max(...others.map((p) => p.MonthNet))
      : 0;
    // Same ratio convention, with a scale-free median fallback (no currency floor).
    const sorted = nets.map(Math.abs).sort((a, b) => a - b),
      median = sorted[Math.floor(sorted.length / 2)] || 0;
    if (
      f.Rank === 1 &&
      f.MonthDays >= 2 &&
      f.MonthNet > 0 &&
      (second > 0 ? f.MonthNet >= second * 2 : f.MonthNet - second >= median)
    )
      add("T13", `本月第 ${f.Rank} 名`);
    const leader = Math.max(...nets);
    if (
      f.Rank === 2 &&
      f.MonthDays >= 2 &&
      (leader > 0
        ? leader - f.MonthNet <= leader * 0.2
        : median > 0 && leader - f.MonthNet <= median * 0.2)
    )
      add("T14", `本月第 ${f.Rank} 名`);
    if (facts.GroupDays >= 3 && f.Days >= 3) {
      if (f.Net === Math.max(...lifetime.map((p) => p.Net)))
        add("T16", `累積 ${f.Net}`);
      if (f.Net === Math.min(...lifetime.map((p) => p.Net)))
        add("T17", `累積 ${f.Net}`);
    }
    const n = normalized.find((n) => n.id === f.PlayerId)!;
    if (n.valid && active.some((p) => p.PlayerId === f.PlayerId)) {
      if (
        n10.length >= 3 &&
        n.std > 0 &&
        n.std === Math.max(...n10.map((p) => p.std))
      )
        add("T21", `${n.std.toFixed(2)} 底／將標準差`);
      if (
        n10.length >= 3 &&
        f.Recent10Net > 0 &&
        n.std <=
          [...n10].sort((a, b) => a.std - b.std)[
            Math.floor((n10.length - 1) / 3)
          ].std
      )
        add("T22", `${n.std.toFixed(2)} 底／將標準差`);
      if (
        n10.length >= 1 &&
        n.range > 0 &&
        n.range === Math.max(...n10.map((p) => p.range))
      )
        add("T24", `${n.range.toFixed(2)} 底／將跨度`);
    }
    if (
      n.average !== null &&
      averages.length >= 1 &&
      Math.abs(n.average) ===
        Math.min(...averages.map((p) => Math.abs(p.average!)))
    )
      add("T23", `${n.average.toFixed(2)} 底／將平均`);
    if (facts.GroupDays >= 5) {
      if (groupDays.slice(-5).every((d) => d in f.DayTotals))
        add("T26", "最近 5 個麻將日全勤");
      if (f.Hands === Math.max(...facts.Players.map((p) => p.Hands)))
        add("T27", `${f.Hands} 將`);
      if (groupDays[0] in f.DayTotals) add("T29", "參與房間首個麻將日");
    }
    const last = f.Sessions.at(-1)?.RecordDate,
      previous = f.Sessions.at(-2)?.RecordDate;
    if (
      last &&
      previous &&
      groupDays.filter((d) => d > previous && d < last).length >= 5
    )
      add("T28", "錯過至少 5 個麻將日後回桌");
    if (ordered.length >= 6) {
      const best = Math.max(...records.map((r) => r.NetAmount)),
        worst = Math.min(...records.map((r) => r.NetAmount));
      if (
        best > 0 &&
        records.some((r) => r.PlayerId === f.PlayerId && r.NetAmount === best)
      )
        add("R01", `單場 +${best}`);
      if (
        worst < 0 &&
        records.some((r) => r.PlayerId === f.PlayerId && r.NetAmount === worst)
      )
        add("R02", `單場 ${worst}`);
    }
    for (const t of eligible)
      if (!t.Current)
        t.Current =
          t.Category === "STATE"
            ? f.WinStreak
              ? `${f.WinStreak} 連勝`
              : f.LossStreak
                ? `${f.LossStreak} 連敗`
                : `近 5 場 ${f.Recent5Net}`
            : t.Category === "STANDING"
              ? `本月 ${f.MonthNet} · 近 5 場 ${f.Recent5Net}`
              : t.Category === "SOCIAL"
                ? `近 30 天 ${f.Attendance} 個麻將日 · ${f.RecentHighlights} 則精華`
                : `近 10 場 ${f.Recent10Net}`;
    eligible.sort(
      (a, b) => b.Priority - a.Priority || a.Id.localeCompare(b.Id),
    );
    return {
      PlayerId: f.PlayerId,
      SeniorityTitle: seniority(f.Hands),
      EligibleTitles: eligible,
      Titles: selectTitles(eligible),
      CategoryCandidates: selectTitles(eligible, 5),
    };
  });
}
