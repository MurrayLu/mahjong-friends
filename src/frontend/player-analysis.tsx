import React from "react";
import type { PlayerAnalysis } from "../application/player-analysis";
import { Avatar, Amount, Empty } from "./ui";
import { RangePicker } from "./polish";
export function PlayerAnalysisPage({
  data,
  dates,
  label,
  isMe,
  onPeriod,
  onSession,
  funSection,
  funIdentity,
  funTitle,
  funRepresentative,
  funSeniority,
  funMotto,
  funInsights,
  onPersonalize,
}: {
  data: PlayerAnalysis;
  dates: string[];
  label: string;
  isMe: boolean;
  onPeriod: (period: string, from?: string, to?: string) => void;
  onSession: (id: string) => void;
  funSection?: React.ReactNode;
  funIdentity?: React.ReactNode;
  funTitle?: React.ReactNode;
  funRepresentative?: React.ReactNode;
  funSeniority?: React.ReactNode;
  funMotto?: React.ReactNode;
  funInsights?: React.ReactNode;
  onPersonalize?: () => void;
}) {
  const { Player: p, Summary: s, Streak: streak } = data;
  const hasData = s.SessionsPlayed > 0;
  const values = [0, ...data.Trend.map((r) => r.CumulativeNet)];
  const low = Math.min(...values),
    high = Math.max(...values),
    span = high - low || 1;
  const y = (value: number) => 148 - ((value - low) / span) * 120;
  const x = (i: number) => 20 + (i / (values.length - 1 || 1)) * 280;
  return (
    <section className="player-analysis page-content">
      <div className="analysis-identity">
        <div className="analysis-avatar-column">
          <Avatar name={p.DisplayName} url={p.AvatarImageUrl} size={106} />
          <div
            className="analysis-rank"
            aria-label={
              p.IsArchived
                ? "已離開"
                : `K.O.榜，第${data.Ranking.Rank || "—"}名`
            }
          >
            {p.IsArchived ? (
              <strong>已離開</strong>
            ) : (
              <>
                <small>K.O.榜</small>
                <strong>
                  {data.Ranking.Rank ? `第 ${data.Ranking.Rank} 名` : "—"}
                </strong>
              </>
            )}
          </div>
        </div>
        <div className="analysis-profile-copy">
          <div className="analysis-name-line">
            <div className="analysis-name-cluster">
              <h2 title={p.DisplayName}>{p.DisplayName}</h2>
              {funRepresentative}
            </div>
            {isMe && onPersonalize && (
              <button
                className="secondary analysis-personalize"
                onClick={onPersonalize}
              >
                ✦ 個人化
              </button>
            )}
          </div>
          {funSeniority}
          {funTitle}
          {funMotto ?? funIdentity}
        </div>
      </div>
      {funInsights}
      <RangePicker dates={dates} value={label} onApply={onPeriod} />
      <div className="stat-grid analysis-summary">
        <div>
          <strong>{hasData ? <Amount value={s.NetAmount} /> : "—"}</strong>
          <small>總損益</small>
        </div>
        <div>
          <strong>{hasData ? `${Math.round(s.WinRate! * 100)}%` : "—"}</strong>
          <small>勝率</small>
        </div>
        <div>
          <strong>{s.SessionsPlayed} 場</strong>
          <small>參與場次</small>
        </div>
        <div>
          <strong>
            {hasData ? <Amount value={s.AveragePerSession!} /> : "—"}
          </strong>
          <small>平均每場</small>
        </div>
      </div>
      <p className="analysis-record">
        勝 {hasData ? s.WinningSessions : "—"} · 敗{" "}
        {hasData ? s.LosingSessions : "—"} · 平 {hasData ? s.FlatSessions : "—"}
      </p>
      <h3>最好與最差的一場</h3>
      <div
        className={`analysis-extremes${data.Extremes.BestSession && data.Extremes.BestSession.SessionId === data.Extremes.WorstSession?.SessionId ? " single" : ""}`}
      >
        {(data.Extremes.BestSession &&
        data.Extremes.BestSession.SessionId ===
          data.Extremes.WorstSession?.SessionId
          ? ([
              [
                s.SessionsPlayed === 1 ? "唯一一場紀錄" : "最佳與最差 · 同一場",
                data.Extremes.BestSession,
              ],
            ] as const)
          : ([
              ["最佳單場", data.Extremes.BestSession],
              ["最差單場", data.Extremes.WorstSession],
            ] as const)
        ).map(([title, r]) =>
          r ? (
            <button
              className="analysis-card"
              key={title}
              onClick={() => onSession(r.SessionId)}
              aria-label={`${title}，${r.SessionName}，查看紀錄`}
            >
              <small>{title}</small>
              <Amount value={r.NetAmount} />
              <span className="analysis-session-name">{r.SessionName}</span>
              <small>{r.RecordDate.replaceAll("-", "/")}</small>
            </button>
          ) : (
            <div className="analysis-card" key={title}>
              <small>{title}</small>
              <strong>—</strong>
            </div>
          ),
        )}
      </div>
      <div className="analysis-streak" aria-label="連勝與連敗">
        <div>
          <small>目前{streak.CurrentType === "Loss" ? "連敗" : "連勝"}</small>
          <strong>{hasData ? `${streak.CurrentCount} 場` : "—"}</strong>
        </div>
        <div>
          <small>最長連勝</small>
          <strong>{hasData ? `${streak.MaxWinStreak} 場` : "—"}</strong>
        </div>
        <div>
          <small>最長連敗</small>
          <strong>{hasData ? `${streak.MaxLossStreak} 場` : "—"}</strong>
        </div>
      </div>
      <h3>累積損益趨勢</h3>
      {hasData ? (
        <div className="analysis-chart">
          <svg
            viewBox="0 0 320 180"
            role="img"
            aria-label="所選期間累積損益，從零起算"
          >
            <line x1="20" x2="300" y1={y(0)} y2={y(0)} className="chart-zero" />
            <polyline
              points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              className="chart-line"
            />
            {data.Trend.map((r, i) => (
              <circle
                key={r.SessionId}
                cx={x(i + 1)}
                cy={y(r.CumulativeNet)}
                r="3"
                className="chart-point"
              >
                <title>
                  {r.RecordDate} · {r.SessionName} · {r.CumulativeNet}
                </title>
              </circle>
            ))}
          </svg>
          <div className="chart-labels">
            <span>起點 0</span>
            <span>
              累積 <Amount value={s.NetAmount} />
            </span>
          </div>
          <small>
            {data.Trend[0].RecordDate} — {data.Trend.at(-1)!.RecordDate}
          </small>
        </div>
      ) : (
        <Empty
          title="這段時間還沒上桌"
          note="參與牌局後，就能看見你的輸贏走勢。"
        />
      )}
      <h3>最近參與 · 最多 10 場</h3>
      <ol className="analysis-recent">
        {data.RecentSessions.map((r) => (
          <li key={r.SessionId}>
            <button onClick={() => onSession(r.SessionId)}>
              <div>
                <b>{r.SessionName}</b>
                <small>{r.RecordDate.replaceAll("-", "/")}</small>
              </div>
              <Amount value={r.NetAmount} />
            </button>
          </li>
        ))}
      </ol>
      {funSection}
    </section>
  );
}
