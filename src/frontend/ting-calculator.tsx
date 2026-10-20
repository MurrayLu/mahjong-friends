import React, { useMemo, useState } from "react";
import { BrandMark } from "./brand";
import {
  TILES,
  emptyHand,
  selectedCount,
  changeTile,
  sortedHand,
  detectHandMode,
  findWaitingTiles,
  findDiscardOptions,
  type Counts,
} from "../ting/engine";

import { MahjongTile } from "./mahjong-tile";

export const TING_PATH = "/tools/ting";
export function isTingRoute(path: string) {
  return path === TING_PATH || path === TING_PATH + "/";
}
export function TilePicker({
  counts,
  onAdd,
}: {
  counts: Counts;
  onAdd: (tile: number) => void;
}) {
  const total = selectedCount(counts);
  const suits = [
    { name: "萬子", tiles: TILES.slice(0, 9) },
    { name: "筒子", tiles: TILES.slice(9, 18) },
    { name: "條子", tiles: TILES.slice(18, 27) },
    { name: "字牌", tiles: TILES.slice(27, 34) },
  ];
  return (
    <div className="ting-picker" role="group" aria-label="34 種麻將牌面">
      {suits.map((suit) => (
        <div
          className="ting-suit-row"
          role="group"
          aria-label={suit.name}
          key={suit.name}
        >
          {suit.tiles.map((t) => (
            <button
              key={t.index}
              className="ting-tile"
              data-selected={counts[t.index] > 0}
              disabled={counts[t.index] >= 4 || total >= 17}
              aria-label={`${t.name}，已選 ${counts[t.index]} 張${counts[t.index] === 4 ? "，已達上限" : ""}`}
              onClick={() => onAdd(t.index)}
            >
              <MahjongTile tile={t.index} />
              {counts[t.index] > 1 && (
                <small className="ting-copy-count">×{counts[t.index]}</small>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
export function HandDisplay({
  counts,
  onRemove,
}: {
  counts: Counts;
  onRemove: (tile: number) => void;
}) {
  const tiles = sortedHand(counts);
  if (!tiles.length) return null;
  return (
    <div className="ting-hand" aria-label="目前手牌">
      {tiles.length
        ? tiles.map((tile, i) => (
            <button
              className="ting-held"
              key={tile + ":" + i}
              aria-label={`移除一張${TILES[tile].name}`}
              onClick={() => onRemove(tile)}
            >
              <MahjongTile tile={tile} />
            </button>
          ))
        : null}
    </div>
  );
}
type TingCalculation = ReturnType<typeof calculateTing>;
function calculateTing(counts: Counts) {
  const state = detectHandMode(counts);
  return {
    ...state,
    waits: state.mode === "waiting" ? findWaitingTiles(counts) : [],
    options: state.mode === "drawn" ? findDiscardOptions(counts) : [],
  };
}
const theoreticalCopies = (counts: Counts, waits: number[]) =>
  waits.reduce((sum, tile) => sum + Math.max(0, 4 - counts[tile]), 0);

export function CurrentTingResult({
  counts,
  result = calculateTing(counts),
}: {
  counts: Counts;
  result?: TingCalculation;
}) {
  if (result.mode !== "waiting") return null;
  return (
    <section
      className="ting-results ting-current-result"
      aria-live="polite"
      aria-atomic="true"
    >
      <h2>你現在聽什麼？</h2>
      {result.waits.length > 0 ? (
        <>
          <div className="ting-waits">
            {result.waits.map((tile) => (
              <div className="ting-wait-item" key={tile}>
                <MahjongTile tile={tile} />
                <span>可聽 {Math.max(0, 4 - counts[tile])} 張</span>
              </div>
            ))}
          </div>
          <p className="ting-total-waits">
            共 {theoreticalCopies(counts, result.waits)} 張
          </p>
        </>
      ) : (
        <p className="muted">目前沒有找到聽牌。</p>
      )}
      {result.waits.length > 0 && (
        <small className="ting-count-disclaimer muted">理論張數</small>
      )}
    </section>
  );
}

export function TingSuggestions({
  result,
  counts,
}: {
  result?: TingCalculation;
  counts: Counts;
}) {
  const calculated = result ?? calculateTing(counts);
  if (calculated.mode !== "drawn") return null;
  return (
    <section
      className="ting-results ting-suggestions"
      aria-live="polite"
      aria-atomic="true"
    >
      <h2>打什麼可以聽？</h2>
      {calculated.options.length ? (
        <ol className="ting-discards">
          {calculated.options.map((o) => (
            <li key={o.tile}>
              <span className="ting-discard-face">
                <span>打 {TILES[o.tile].name}</span>
                <MahjongTile tile={o.tile} />
              </span>
              <small>
                共{" "}
                {theoreticalCopies(
                  counts.map(
                    (count, tile) => count - (tile === o.tile ? 1 : 0),
                  ),
                  o.waits,
                )}{" "}
                張
              </small>
              <div className="ting-advice-waits">
                <span>聽：</span>
                {o.waits.map((tile) => (
                  <MahjongTile key={tile} tile={tile} />
                ))}
                <span className="sr-only">
                  {o.waits.map((tile) => TILES[tile].name).join("、")}
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p>目前沒有找到可以聽牌的打法。</p>
      )}
    </section>
  );
}
export function TingCalculatorPage() {
  const [counts, setCounts] = useState(emptyHand);
  const result = useMemo(() => calculateTing(counts), [counts]);
  const total = selectedCount(counts),
    state = detectHandMode(counts);
  return (
    <section className="ting-page page-content">
      <p className="ting-intro muted">台灣 16 張 · 標準五組面子＋一對將眼</p>
      <h2 className="ting-picker-title">選擇你的牌</h2>
      <TilePicker
        counts={counts}
        onAdd={(tile) => setCounts((c) => changeTile(c, tile, 1))}
      />
      <div className="ting-hand-header">
        <h2>你的手牌</h2>
        <button
          className="text-button"
          disabled={!total}
          onClick={() => setCounts(emptyHand())}
        >
          清除
        </button>
      </div>
      <p className="ting-count" role="status">
        已選 {total} 張
        {state.mode === "waiting"
          ? " · 聽牌狀態"
          : state.mode === "drawn"
            ? " · 摸牌狀態"
            : ""}
      </p>
      <HandDisplay
        counts={counts}
        onRemove={(tile) => setCounts((c) => changeTile(c, tile, -1))}
      />
      <CurrentTingResult counts={counts} result={result} />
      <TingSuggestions counts={counts} result={result} />
    </section>
  );
}
export function PublicTingPage() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="icon-button" href="/" aria-label="回到這桌">
          ‹
        </a>
        <BrandMark size="compact" className="app-header-brand" />
        <h1 className="ting-header-title">聽牌計算機</h1>
      </header>
      <TingCalculatorPage />
    </main>
  );
}
