import React, { useState } from "react";
import type { MobileSession } from "../application/mobile-queries";
import { Avatar, Amount, Icon } from "./ui";
import { sessionWinnerSummary } from "./mobile-logic";
export function ResultList({
  results,
  tags,
  avatar,
  currentPlayerId,
  compact = false,
}: {
  results: MobileSession["Results"];
  tags?: MobileSession["SessionTags"];
  currentPlayerId?: string;
  compact?: boolean;
  avatar: (id: string, fallback?: string | null) => string | null | undefined;
}) {
  return (
    <div className="result-list">
      {[...results]
        .sort((a, b) => b.NetAmount - a.NetAmount)
        .map((p) => (
          <div
            className={`result-row ${p.PlayerId === currentPlayerId ? "my-result" : ""}`}
            key={p.PlayerId}
          >
            <Avatar
              name={p.DisplayName}
              url={avatar(p.PlayerId, p.AvatarImageUrl)}
              size={compact ? 30 : 34}
            />
            <div className="result-owner">
              <b>
                {p.DisplayName}
                {!!p.IsArchived && <span className="left-badge">已離開</span>}
                {p.PlayerId === currentPlayerId && (
                  <span className="you-badge">你</span>
                )}
              </b>
              {tags?.[p.PlayerId]?.length ? (
                <div className="session-tags">
                  {tags[p.PlayerId].slice(0, 2).map((t) => (
                    <span key={t.Id}>
                      {t.Icon} {t.Name}
                    </span>
                  ))}
                  {tags[p.PlayerId].length > 2 && (
                    <small>+{tags[p.PlayerId].length - 2}</small>
                  )}
                </div>
              ) : null}
            </div>
            <Amount value={p.NetAmount} />
          </div>
        ))}
    </div>
  );
}
export function SessionCard({
  session: s,
  onEdit,
  onAppeal,
  onShare,
  avatar,
  writable,
  currentPlayerId,
  defaultExpanded = false,
}: {
  session: MobileSession;
  onEdit: () => void;
  onAppeal: () => void;
  onShare?: () => void;
  writable: boolean;
  currentPlayerId?: string;
  defaultExpanded?: boolean;
  avatar: (id: string, fallback?: string | null) => string | null | undefined;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const summary = sessionWinnerSummary(s);
  const headline = summary.winner
    ? s.SessionTags?.[summary.winner.PlayerId]?.find((t) => t.Winner)
    : undefined;
  return (
    <article className={`session-card ${expanded ? "expanded" : "collapsed"}`}>
      <button
        className="session-card-head"
        aria-expanded={expanded}
        aria-label={`${s.Name}，${expanded ? "收合" : "展開"}`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="history-header">
          <div className="history-metadata">
            <b className="compact-name" title={s.Name}>
              {s.Name}
            </b>
            <span>
              {s.RateMajor}/{s.RateMinor} · {s.HandCount ?? 1}將
            </span>
          </div>
          <div className="history-winner">
            <b className="compact-winner" title={summary.label}>
              {summary.label}
            </b>
            {headline && (
              <span className="session-tag-headline">
                {headline.Icon} {headline.Name}
              </span>
            )}
          </div>
          <span className="compact-amount">
            {summary.amount !== null && <Amount value={summary.amount} />}
          </span>
        </div>
        <Icon name="chevron" size={18} />
      </button>
      {expanded && (
        <>
          <ResultList
            results={s.Results}
            tags={s.SessionTags}
            avatar={avatar}
            currentPlayerId={currentPlayerId}
          />
          {(writable || onShare) && (
            <div
              className={`flow-actions inline-actions session-actions${writable ? "" : " session-actions--share-only"}`}
            >
              {writable && (
                <>
                  <button className="text-button" onClick={onEdit}>
                    ✎ 編輯
                  </button>
                  <button className="text-button session-action-appeal" onClick={onAppeal}>
                    ⚑ 我要上訴
                  </button>
                </>
              )}
              {onShare && (
                <button className="text-button" onClick={onShare}>
                  ↗ 分享
                </button>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}
