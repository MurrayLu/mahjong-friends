import React, { useState } from "react";
import { TILES } from "../ting/engine";

export const TILE_ASSETS = [
  ...Array.from({ length: 9 }, (_, i) => `Man${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `Pin${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `Sou${i + 1}`),
  "Ton",
  "Nan",
  "Shaa",
  "Pei",
  "Chun",
  "Hatsu",
  "Haku",
].map((name) => `/assets/mahjong/ting/${name}.svg`);

/** Shared presentation only; canonical indices and calculation remain in the engine. */
export function MahjongTile({ tile }: { tile: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="mahjong-face">
      {failed ? (
        <span className="mahjong-fallback">{TILES[tile].name}</span>
      ) : (
        <img
          src={TILE_ASSETS[tile]}
          alt={TILES[tile].name}
          width="300"
          height="400"
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
