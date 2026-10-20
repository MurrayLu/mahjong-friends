/** Client-only structural Taiwanese 16-tile Mahjong. No scoring or visible inventory. */
export const TILE_TYPES = 34;
const numerals = "一二三四五六七八九";
export const TILES = Array.from({ length: TILE_TYPES }, (_, index) => ({
  index,
  group: index < 9 ? "萬" : index < 18 ? "筒" : index < 27 ? "條" : "字",
  name:
    index < 27
      ? numerals[index % 9] + ["萬", "筒", "條"][Math.floor(index / 9)]
      : ["東", "南", "西", "北", "中", "發", "白"][index - 27],
  label:
    index < 27
      ? String((index % 9) + 1) + ["萬", "筒", "條"][Math.floor(index / 9)]
      : ["東", "南", "西", "北", "中", "發", "白"][index - 27],
}));
export type Counts = readonly number[];
export const emptyHand = (): number[] => Array(TILE_TYPES).fill(0);
export function validCounts(counts: Counts): boolean {
  return (
    counts.length === TILE_TYPES &&
    Array.from(counts).every((n) => Number.isInteger(n) && n >= 0 && n <= 4)
  );
}
export function selectedCount(counts: Counts): number {
  return counts.reduce((a, b) => a + b, 0);
}
export type HandMode =
  | { mode: "waiting" | "drawn"; exposedMeldCount: number }
  | { mode: "incomplete"; exposedMeldCount: null };
export function detectHandMode(counts: Counts): HandMode {
  if (!validCounts(counts))
    return { mode: "incomplete", exposedMeldCount: null };
  const total = selectedCount(counts);
  for (const [mode, base] of [
    ["waiting", 16],
    ["drawn", 17],
  ] as const) {
    const exposed = (base - total) / 3;
    if (Number.isInteger(exposed) && exposed >= 0 && exposed <= 5)
      return { mode, exposedMeldCount: exposed };
  }
  return { mode: "incomplete", exposedMeldCount: null };
}
export function isWinningHand(
  counts: Counts,
  exposedMeldCount: number,
): boolean {
  if (
    !validCounts(counts) ||
    !Number.isInteger(exposedMeldCount) ||
    exposedMeldCount < 0 ||
    exposedMeldCount > 5
  )
    return false;
  const required = 5 - exposedMeldCount;
  if (selectedCount(counts) !== required * 3 + 2) return false;
  const hand = [...counts],
    memo = new Map<string, boolean>();
  function melds(left: number): boolean {
    const first = hand.findIndex((n) => n > 0);
    if (first < 0) return left === 0;
    if (left === 0) return false;
    const key = left + ":" + hand.join("");
    const saved = memo.get(key);
    if (saved !== undefined) return saved;
    let result = false;
    if (hand[first] >= 3) {
      hand[first] -= 3;
      result = melds(left - 1);
      hand[first] += 3;
    }
    if (
      !result &&
      first < 27 &&
      first % 9 <= 6 &&
      hand[first + 1] > 0 &&
      hand[first + 2] > 0
    ) {
      hand[first]--;
      hand[first + 1]--;
      hand[first + 2]--;
      result = melds(left - 1);
      hand[first]++;
      hand[first + 1]++;
      hand[first + 2]++;
    }
    memo.set(key, result);
    return result;
  }
  for (let pair = 0; pair < TILE_TYPES; pair++) {
    if (hand[pair] < 2) continue;
    hand[pair] -= 2;
    const result = melds(required);
    hand[pair] += 2;
    if (result) return true;
  }
  return false;
}
export function findWaitingTiles(counts: Counts): number[] {
  const state = detectHandMode(counts);
  if (state.mode !== "waiting") return [];
  const hand = [...counts],
    waits: number[] = [];
  for (let tile = 0; tile < TILE_TYPES; tile++) {
    if (hand[tile] >= 4) continue;
    hand[tile]++;
    if (isWinningHand(hand, state.exposedMeldCount)) waits.push(tile);
    hand[tile]--;
  }
  return waits;
}
export type DiscardOption = { tile: number; waits: number[] };
export function findDiscardOptions(counts: Counts): DiscardOption[] {
  if (detectHandMode(counts).mode !== "drawn") return [];
  const hand = [...counts],
    options: DiscardOption[] = [];
  for (let tile = 0; tile < TILE_TYPES; tile++) {
    if (!hand[tile]) continue;
    hand[tile]--;
    const waits = findWaitingTiles(hand);
    hand[tile]++;
    if (waits.length) options.push({ tile, waits });
  }
  return options.sort(
    (a, b) => b.waits.length - a.waits.length || a.tile - b.tile,
  );
}
export function changeTile(
  counts: Counts,
  tile: number,
  delta: 1 | -1,
): number[] {
  if (
    !validCounts(counts) ||
    !Number.isInteger(tile) ||
    tile < 0 ||
    tile >= TILE_TYPES
  )
    return [...counts];
  if (
    counts[tile] + delta < 0 ||
    counts[tile] + delta > 4 ||
    (delta === 1 && selectedCount(counts) >= 17)
  )
    return [...counts];
  const next = [...counts];
  next[tile] += delta;
  return next;
}
export function sortedHand(counts: Counts): number[] {
  return validCounts(counts)
    ? counts.flatMap((n, tile) => Array<number>(n).fill(tile))
    : [];
}
