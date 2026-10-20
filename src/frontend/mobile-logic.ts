import type { MobileSession } from "../application/mobile-queries";
export const INITIAL_HISTORY_COUNT = 3;
export const HISTORY_MORE_COUNT = 5;
export const HIGHLIGHT_UI_MAX_IMAGES = 1;
export const toggleSign = (value: string) =>
  value.startsWith("-") ? value.slice(1) : "-" + value.replace(/^\+/, "");
export const swipeDirection = (
  dx: number,
  dy: number,
): "history" | "highlights" | null =>
  Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.7
    ? dx < 0
      ? "highlights"
      : "history"
    : null;
export const appealPrefill = (s: MobileSession) => ({
  RecordDate: s.RecordDate,
  Name: "",
  MahjongType: s.MahjongType,
  RateMajor: s.RateMajor,
  RateMinor: s.RateMinor,
  HandCount: null,
  PlayerIds: s.Results.map((r) => r.PlayerId),
  Amounts: {} as Record<string, string>,
});
export const playerIdentity = (p: {
  IsGuest: number;
  UserId: string | null;
  Email: string | null;
}) => (p.IsGuest || !p.UserId ? "未認領牌咖" : p.Email || "未連結 Google");
export function signedInteger(value: string): number | null {
  if (!/^[+-]?\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}
export const money = (n: number) =>
  `${n > 0 ? "+" : ""}${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(n)}`;
export class ScrollMemory {
  private positions: Partial<Record<"history" | "highlights", number>> = {};
  save(tab: "history" | "highlights", position: number) {
    this.positions[tab] = position;
  }
  restore(tab: "history" | "highlights", fallback: number) {
    return this.positions[tab] ?? fallback;
  }
}
export function sessionWinnerSummary(
  session: Pick<MobileSession, "IsSettled" | "Results">,
) {
  if (!session.IsSettled || !session.Results.length)
    return {
      kind: "unsettled" as const,
      label: "尚未結算",
      amount: null,
      winner: null,
    };
  const max = Math.max(...session.Results.map((r) => r.NetAmount));
  if (session.Results.every((r) => r.NetAmount === 0))
    return {
      kind: "draw" as const,
      label: "全員平手",
      amount: 0,
      winner: null,
    };
  const winners = session.Results.filter((r) => r.NetAmount === max).sort(
    (a, b) =>
      a.DisplayName < b.DisplayName
        ? -1
        : a.DisplayName > b.DisplayName
          ? 1
          : a.PlayerId < b.PlayerId
            ? -1
            : a.PlayerId > b.PlayerId
              ? 1
              : 0,
  );
  return {
    kind: "winner" as const,
    label: winners.map((p) => p.DisplayName).join("・"),
    amount: max,
    winner: winners.length === 1 ? winners[0] : null,
  };
}
export function currentPlayerId(
  players: { Id: string; UserId: string | null; IsGuest: number }[],
  userId: string | undefined,
) {
  return userId
    ? players.find((p) => p.UserId === userId && !p.IsGuest)?.Id
    : undefined;
}
/** Keep enough document height until synchronous scroll restoration has run. */
export function pagerGuardHeight(
  currentHeight: number,
  target: number,
  anchor: number,
  viewport: number,
) {
  return Math.max(currentHeight, target - anchor + viewport, viewport - 54);
}

export function collapsedSessionData(s: MobileSession) {
  const winner = sessionWinnerSummary(s);
  return {
    name: s.Name,
    handCount: `${s.HandCount ?? 1}將`,
    winner: winner.label,
    amount: winner.amount,
  };
}
