import React from "react";
import { Icon } from "./ui";

/** Presentation only: period ranking and lifetime overview remain authoritative. */
export function KOBoardEmptyState({
  lifetimeSettledSessions,
}: {
  lifetimeSettledSessions: number | undefined;
}) {
  // The fun projection loads independently. Do not briefly label an old room "new".
  if (lifetimeSettledSessions === undefined) return null;
  const isNew = lifetimeSettledSessions === 0;
  return (
    <div className="ranking-empty">
      <Icon name="crown" size={28} />
      <h3>{isNew ? "還沒有打牌紀錄" : "大家忘記打牌，還是只是忘記紀錄？"}</h3>
      {isNew && <p>第一場誰要先開張？</p>}
    </div>
  );
}
