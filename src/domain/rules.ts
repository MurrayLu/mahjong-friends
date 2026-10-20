import type { ResultInput, SessionInput, SessionUpdate } from "./model";
export const MINIMUM_SETTLEMENT_PLAYERS = 4;
export class DomainError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}
export function ensure(
  ok: unknown,
  code: string,
  status = 400,
  details: Record<string, unknown> = {},
): asserts ok {
  if (!ok) throw new DomainError(code, status, details);
}
export function text(value: unknown, field: string): string {
  ensure(
    typeof value === "string" &&
      value.trim().length > 0 &&
      value.length <= 1000,
    `Invalid${field}`,
  );
  return value.trim();
}
export function integer(
  value: unknown,
  field: string,
  minimum = -Number.MAX_SAFE_INTEGER,
): number {
  ensure(
    Number.isSafeInteger(value) && (value as number) >= minimum,
    `Invalid${field}`,
  );
  return value as number;
}
export function validateHandCount(value: unknown): number | null {
  return value === null || value === undefined
    ? null
    : integer(value, "HandCount", 1);
}
export function internalImage(value: unknown, groupId: string): string | null {
  if (value === null) return null;
  ensure(
    typeof value === "string" &&
      /^\/images\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(value),
    "InvalidImageUrl",
  );
  ensure(value.split("/")[2] === groupId, "CrossGroupImage");
  return value;
}
export function recordDate(value: unknown): string {
  ensure(
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
    "InvalidRecordDate",
  );
  const date = new Date(value + "T00:00:00Z");
  ensure(
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value,
    "InvalidRecordDate",
  );
  return value;
}
export function sessionFields(input: SessionInput | SessionUpdate) {
  ensure(
    input && typeof input === "object" && !Array.isArray(input),
    "InvalidSession",
  );
  if (input.Name !== undefined)
    ensure(
      typeof input.Name === "string" && input.Name.length <= 1000,
      "InvalidName",
    );
  if (input.MahjongType !== undefined)
    ensure(
      ["Traditional", "American", "Mixed"].includes(input.MahjongType),
      "InvalidMahjongType",
    );
  if (input.RateMajor !== undefined) integer(input.RateMajor, "RateMajor", 0);
  if (input.RateMinor !== undefined) integer(input.RateMinor, "RateMinor", 0);
  if ("HandCount" in input) validateHandCount(input.HandCount);
}
export function balancedResults(results: ResultInput[]): ResultInput[] {
  ensure(
    Array.isArray(results) && results.length >= MINIMUM_SETTLEMENT_PLAYERS,
    "AtLeastFourPlayersRequired",
  );
  const ids = new Set<string>();
  let total = 0n;
  for (const r of results) {
    ensure(r && typeof r === "object", "InvalidResult");
    text(r.PlayerId, "PlayerId");
    ensure(!ids.has(r.PlayerId), "DuplicatePlayer");
    ids.add(r.PlayerId);
    total += BigInt(integer(r.NetAmount, "NetAmount"));
  }
  ensure(total === 0n, "SettlementNotBalanced", 400, {
    CurrentTotal: total.toString(),
    RequiredAdjustment: (-total).toString(),
  });
  return results;
}
export function autoBalance(amounts: number[]): number {
  const result = -amounts.reduce(
    (sum, n) => sum + BigInt(integer(n, "NetAmount")),
    0n,
  );
  ensure(
    result >= BigInt(-Number.MAX_SAFE_INTEGER) &&
      result <= BigInt(Number.MAX_SAFE_INTEGER),
    "AmountOverflow",
  );
  return Number(result);
}
export function localToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function recentReportWindow(now = new Date()) {
  ensure(!Number.isNaN(now.getTime()), "InvalidDateTime");
  return {
    start: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    end: now.toISOString(),
  };
}
export function periodRange(
  period: string,
  today = localToday(),
): [string | null, string | null] {
  recordDate(today);
  const year = Number(today.slice(0, 4)),
    month = Number(today.slice(5, 7));
  const first = (y: number, m: number) =>
    `${y}-${String(m).padStart(2, "0")}-01`;
  if (period === "all") return [null, null];
  if (period === "year") return [first(year, 1), first(year + 1, 1)];
  if (period === "current-month")
    return [
      first(year, month),
      month === 12 ? first(year + 1, 1) : first(year, month + 1),
    ];
  if (period === "previous-month")
    return [
      month === 1 ? first(year - 1, 12) : first(year, month - 1),
      first(year, month),
    ];
  throw new DomainError("InvalidPeriod");
}
