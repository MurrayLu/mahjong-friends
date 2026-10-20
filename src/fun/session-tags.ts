import { orderedSessions, type FunSession } from "./facts";
/** Final result measured against the table base; hand count describes experience. */
export function bottomMultiple(s: FunSession, net: number): number | null {
  const base = s.RateMajor;
  return typeof base === "number" &&
    Number.isFinite(base) &&
    base > 0 &&
    Number.isFinite(net)
    ? net / base
    : null;
}
export const SESSION_TAGS = [
  {
    Id: "REVERSE_KING",
    Name: "逆轉王",
    Icon: "🔄",
    Priority: 100,
    Winner: true,
  },
  { Id: "SOLE_WINNER", Name: "一贏N", Icon: "👑", Priority: 95, Winner: true },
  {
    Id: "SOLE_LOSER",
    Name: "一家烤肉萬家香",
    Icon: "🔥",
    Priority: 90,
    Winner: false,
  },
  { Id: "OPENING_WIN", Name: "開門紅", Icon: "🚪", Priority: 85, Winner: true },
  { Id: "NARROW_WIN", Name: "險勝", Icon: "😮‍💨", Priority: 70, Winner: true },
  {
    Id: "SCATTER_CHILD",
    Name: "散財童子",
    Icon: "💸",
    Priority: 60,
    Winner: false,
  },
  {
    Id: "BREAK_EVEN",
    Name: "不輸不贏",
    Icon: "⚖️",
    Priority: 50,
    Winner: false,
  },
  { Id: "COMPANION", Name: "陪打", Icon: "🪑", Priority: 40, Winner: true },
] as const;
export type SessionTag = {
  Id: (typeof SESSION_TAGS)[number]["Id"];
  Name: string;
  Icon: string;
  Priority: number;
  Winner: boolean;
};
export function soleWinnerName(opponents: number) {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  return (
    "一贏" +
    (opponents < 10
      ? digits[opponents]
      : opponents === 10
        ? "十"
        : opponents < 20
          ? "十" + digits[opponents % 10]
          : opponents < 100
            ? digits[Math.floor(opponents / 10)] +
              "十" +
              (opponents % 10 ? digits[opponents % 10] : "")
            : String(opponents))
  );
}
export function deriveSessionTags(sessions: FunSession[]) {
  const result: Record<string, Record<string, SessionTag[]>> = {};
  const previous = new Map<string, FunSession>();
  for (const s of orderedSessions(sessions)) {
    const max = Math.max(...s.Results.map((r) => r.NetAmount)),
      min = Math.min(...s.Results.map((r) => r.NetAmount));
    const best = s.Results.filter((r) => r.NetAmount === max),
      worst = s.Results.filter((r) => r.NetAmount === min);
    const positive = s.Results.filter((r) => r.NetAmount > 0).length,
      negative = s.Results.filter((r) => r.NetAmount < 0).length;
    result[s.Id] = {};
    for (const r of s.Results) {
      const tags: SessionTag[] = [],
        prior = previous.get(r.PlayerId),
        n = bottomMultiple(s, r.NetAmount);
      const add = (id: SessionTag["Id"]) => {
        const t = SESSION_TAGS.find((t) => t.Id === id)!;
        tags.push({
          ...t,
          Name:
            id === "SOLE_WINNER"
              ? soleWinnerName(s.Results.length - 1)
              : t.Name,
        });
      };
      const isBest =
        best.length === 1 && best[0].PlayerId === r.PlayerId && r.NetAmount > 0;
      const isWorst =
        worst.length === 1 &&
        worst[0].PlayerId === r.PlayerId &&
        r.NetAmount < 0;
      if (prior && isBest) {
        const low = Math.min(...prior.Results.map((r) => r.NetAmount));
        const losers = prior.Results.filter((r) => r.NetAmount === low);
        if (losers.length === 1 && losers[0].PlayerId === r.PlayerId)
          add("REVERSE_KING");
      }
      if (positive === 1 && r.NetAmount > 0) add("SOLE_WINNER");
      if (negative === 1 && r.NetAmount < 0) add("SOLE_LOSER");
      if (!prior && r.NetAmount > 0) add("OPENING_WIN");
      if (isBest && n !== null && n >= 1.5 && n <= 3) add("NARROW_WIN");
      if (isWorst && n !== null && n <= -3) add("SCATTER_CHILD");
      if (r.NetAmount === 0) add("BREAK_EVEN");
      else if (
        n !== null &&
        Math.abs(n) < 3 &&
        !(isBest && n >= 1.5) &&
        !(isWorst && n <= -3)
      )
        add("COMPANION");
      result[s.Id][r.PlayerId] = tags.sort(
        (a, b) => b.Priority - a.Priority || a.Id.localeCompare(b.Id),
      );
      previous.set(r.PlayerId, s);
    }
  }
  return result;
}
