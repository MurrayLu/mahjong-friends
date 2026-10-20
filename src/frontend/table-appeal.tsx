import React, { useEffect, useState } from "react";
import type {
  AppealReaction,
  AppealSnapshot,
} from "../application/table-appeal";

export function appealCountdown(expiresAt: string, now = Date.now()) {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}
export function AppealChip({
  expiresAt,
  onClick,
  visible,
}: {
  expiresAt: string;
  onClick: () => void;
  visible: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return visible ? (
    <button className="appeal-fab-chip" onClick={onClick}>
      ⚖️ 上訴中 · {appealCountdown(expiresAt, now)}
    </button>
  ) : null;
}
const reactions: { id: AppealReaction; action: string; summary: string }[] = [
  { id: "SUPPORT", action: "🙋 我也不服", summary: "🙋 想再打" },
  { id: "REJECT", action: "❌ 駁回", summary: "❌ 今天到這" },
  { id: "WATCH", action: "🍿 看戲", summary: "🍿 看戲" },
];
export function AppealCard({
  appeal,
  compact = false,
  busy = false,
  onReact,
  onSource,
}: {
  appeal: AppealSnapshot;
  compact?: boolean;
  busy?: boolean;
  onReact?: (reaction: AppealReaction) => void;
  onSource?: (sessionId: string) => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (appeal.Status !== "ACTIVE") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [appeal.Status]);
  const active = appeal.Status === "ACTIVE";
  const groups = [appeal.Support, appeal.Reject, appeal.Watch];
  return (
    <article
      className={`table-appeal ${compact ? "compact" : "full"}`}
      id="active-appeal"
    >
      <div className="appeal-title">
        <strong>⚖️ {appeal.CreatedByDisplayName}不服</strong>
        {active && (
          <time dateTime={appeal.ExpiresAt}>
            {appealCountdown(appeal.ExpiresAt, now)}
          </time>
        )}
      </div>
      <div className="appeal-status">
        {active ? (
          appeal.ReadyAt ? (
            <>
              <strong>🀄 人到齊了</strong>
              <small>{appeal.Support.Count} 人想再打</small>
            </>
          ) : (
            `${appeal.Support.Count} 人想再打${appeal.Support.Count === 3 ? " · 三缺一" : ""}`
          )
        ) : (
          `結果：${({ READY: "可以開桌", IGNORED: "無人理會", ONE_SHORT: "三缺一", REJECTED: "駁回", WATCH_ONLY: "大家只想看戲", MIXED: "各有各的想法" } as const)[appeal.FinalResult!]}`
        )}
      </div>
      <div className="appeal-people">
        {reactions.map((reaction, i) => {
          const names = groups[i].Names;
          return names.length ? (
            <div className="appeal-person-row" key={reaction.id}>
              <span>{reaction.summary}</span>
              <strong>
                {names.slice(0, compact ? 3 : undefined).join(" · ")}
                {compact && names.length > 3 && ` +${names.length - 3}`}
              </strong>
            </div>
          ) : null;
        })}
      </div>
      {active && appeal.CanReact && !appeal.IsInitiator && onReact && (
        <div className="appeal-actions">
          {reactions.map((r) => (
            <button
              key={r.id}
              className={appeal.MyReaction === r.id ? "selected" : ""}
              aria-pressed={appeal.MyReaction === r.id}
              disabled={busy}
              onClick={() => onReact(r.id)}
            >
              {r.action}
            </button>
          ))}
        </div>
      )}
      {!compact && onSource && (
        <button
          className="text-button appeal-source"
          onClick={() => onSource(appeal.SourceSessionId)}
        >
          查看原本牌局 ›
        </button>
      )}
    </article>
  );
}
