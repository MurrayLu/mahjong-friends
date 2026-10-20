import React from "react";

export function QuickStatCard({
  icon,
  label,
  player,
  metric,
  accessibleLabel = label,
}: {
  icon: string;
  label: string;
  player: string;
  metric: string;
  accessibleLabel?: string;
}) {
  return (
    <article
      className="quick-card"
      aria-label={`${accessibleLabel}，${player}，${metric.replace(/^\+/, "正 ").replace(/^-/, "負 ")}`}
    >
      <div className="quick-category">
        <span className="quick-icon" aria-hidden="true">
          {icon}
        </span>
        <small>{label}</small>
      </div>
      <strong>{metric}</strong>
      <span className="quick-player" title={player} aria-label={player}>
        {player}
      </span>
    </article>
  );
}

export function HistoryActionToolbar({
  mode,
  onAction,
}: {
  mode: "history" | "highlights";
  onAction: () => void;
}) {
  const highlight = mode === "highlights";
  return (
    <div className="history-action-toolbar" data-mode={mode}>
      <span>{highlight ? "牌桌精華" : "牌局紀錄"}</span>
      <button className="secondary" onClick={onAction}>
        ＋ {highlight ? "新增精華" : "新增牌局"}
      </button>
    </div>
  );
}
