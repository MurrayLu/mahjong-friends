import React from "react";
import { localToday } from "../domain/rules";
import { slotQuote } from "../fun/catalog";

/** Brand artwork is decorative; the surrounding controls keep their existing labels. */
export function BrandMark({
  size = "normal",
  className = "",
}: {
  size?: "compact" | "normal" | "appIcon";
  className?: string;
}) {
  return (
    <img
      className={`brand-mark brand-mark--${size} ${className}`}
      src="/brand/mark.svg"
      alt=""
      aria-hidden="true"
      width="28"
      height="36"
      draggable={false}
    />
  );
}

export function BrandWordmark() {
  return (
    <span className="brand-wordmark">
      <BrandMark />
      <span>MAHJONG / FRIENDS</span>
    </span>
  );
}

export function BrandIllustration({
  size = "normal",
  className = "",
}: {
  size?: "normal" | "small" | "decoration";
  className?: string;
}) {
  return (
    <div
      className={`brand-illustration brand-illustration--${size} ${className}`}
      aria-hidden="true"
    >
      <span className="brand-illustration-tile brand-illustration-first">
        發
      </span>
      <span className="brand-illustration-tile brand-illustration-second">
        中
      </span>
      <span className="brand-illustration-spark">✦</span>
    </div>
  );
}

export function BrandedEmptyState({
  title,
  note,
  action,
}: {
  title: string;
  note: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty branded-empty">
      <BrandIllustration size="small" />
      <h3>{title}</h3>
      <p>{note}</p>
      {action}
    </div>
  );
}

export function BrandLoading() {
  const loadingQuote = slotQuote(
    "LoadingQuote",
    "brand-loading",
    localToday(),
  );
  return (
    <div className="brand-loading" role="status">
      <BrandMark size="appIcon" />
      <span className="brand-loading-label">載入中…</span>
      <p className="brand-loading-quote">{loadingQuote.Text}</p>
    </div>
  );
}

export function CompletionBrandHero({
  sessionName = "",
  recordDate = "",
  sessionMeta = "",
}: {
  sessionName?: string;
  recordDate?: string;
  sessionMeta?: string;
}) {
  return (
    <div className="completion-mark">
      <BrandIllustration size="small" />
      <div className="completion-mark-copy">
        <p className="eyebrow">GOOD GAME, GREAT COMPANY.</p>
        <h2>本桌結算完成</h2>
        {sessionName && (
          <p className="completion-mark-session">{sessionName}</p>
        )}
        {recordDate && <p className="completion-mark-date">{recordDate}</p>}
        {sessionMeta && (
          <p className="completion-mark-meta">{sessionMeta}</p>
        )}
      </div>
    </div>
  );
}
