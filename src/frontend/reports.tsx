import React, { useEffect, useState } from "react";
import type {
  DailyReport,
  DailyReportRow,
  MobileSession,
} from "../application/mobile-queries";
import { Amount, Avatar, Icon, Modal } from "./ui";
import { BrandIllustration } from "./brand";
import { createReportImage } from "./report-image";
import { api } from "./mobile-api";
import { championQuote } from "../fun/catalog";

export type ReportPresentation = {
  title: string;
  subtitle: string;
  room: string;
  heroLabel: string;
  leaders: DailyReportRow[];
  hands: number;
  rankings: DailyReportRow[];
  privacyLine: string | null;
  tags: string[];
  leaderQuotes: Record<string, string>;
};

const fallbackQuotes = (leaders: DailyReportRow[], seed: string) =>
  Object.fromEntries(
    leaders.map((leader) => [
      leader.PlayerId,
      championQuote("report", seed, leader.PlayerId, []).Text,
    ]),
  );

/** Read only winners' existing profiles; never pull hidden players into the snapshot. */
export async function resolveReportQuotes(
  presentation: ReportPresentation,
  groupId: string,
  loadMotto = async (playerId: string): Promise<string | null> =>
    (
      await api<{ Motto: { Text: string } | null }>(
        `/groups/${groupId}/fun/players/${playerId}`,
      )
    ).Motto?.Text ?? null,
): Promise<ReportPresentation> {
  const quotes = await Promise.all(
    presentation.leaders.map(async (leader) => {
      let motto: string | null = null;
      try {
        motto = await loadMotto(leader.PlayerId);
      } catch {
        /* Existing brand quote remains available offline. */
      }
      return [
        leader.PlayerId,
        motto?.trim() || presentation.leaderQuotes[leader.PlayerId],
      ];
    }),
  );
  return { ...presentation, leaderQuotes: Object.fromEntries(quotes) };
}

export function dailyPresentation(
  report: DailyReport,
  showResults: boolean,
): ReportPresentation {
  return {
    title: "今日戰報",
    subtitle: "最近 24 小時",
    room: report.GroupName,
    heroLabel: report.Leaders.length > 1 ? "今日最大贏家並列" : "今日最大贏家",
    leaders: report.Leaders,
    hands: report.Hands,
    rankings: showResults ? report.Rankings : [],
    privacyLine: showResults
      ? null
      : `今天共擊敗 ${Math.max(0, report.Players - report.Leaders.length)} 位牌咖`,
    tags: [],
    leaderQuotes: fallbackQuotes(
      report.Leaders,
      new Date(report.WindowEnd).toLocaleDateString("en-CA", {
        timeZone: "Asia/Taipei",
      }),
    ),
  };
}

export function sessionPresentation(
  session: MobileSession,
  room: string,
): ReportPresentation {
  const rankings: DailyReportRow[] = [...session.Results]
    .sort(
      (a, b) =>
        b.NetAmount - a.NetAmount || a.PlayerId.localeCompare(b.PlayerId),
    )
    .map((r) => ({ ...r, SessionsPlayed: 1 }));
  const leaders = rankings.filter(
    (r) => r.NetAmount === rankings[0]?.NetAmount,
  );
  const tags = [
    ...new Map(
      Object.values(session.SessionTags || {})
        .flat()
        .map((tag) => [tag.Id, tag]),
    ).values(),
  ];
  return {
    title: "本局戰報",
    subtitle: `${session.RecordDate.replaceAll("-", "/")} · ${session.Name}`,
    room,
    heroLabel: leaders.length > 1 ? "本局第一名並列" : "本局第一名",
    leaders,
    hands: session.HandCount ?? 1,
    rankings,
    privacyLine: null,
    tags: tags.slice(0, 2).map((tag) => `${tag.Icon} ${tag.Name}`),
    leaderQuotes: fallbackQuotes(leaders, session.RecordDate),
  };
}

export function reportShareUrl(
  kind: "daily" | "session",
  groupId: string,
  showResults: boolean,
  sessionId?: string,
) {
  const url = new URL(
    "/",
    typeof location === "undefined" ? "http://localhost" : location.origin,
  );
  url.searchParams.set("report", kind);
  url.searchParams.set("group", groupId);
  url.searchParams.set("results", showResults ? "show" : "hide");
  if (sessionId) url.searchParams.set("session", sessionId);
  return url.toString();
}

async function shareSnapshot(presentation: ReportPresentation, blob: Blob) {
  const file = new File([blob], "mahjong-report.png", { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title: presentation.title, files: [file] });
      return "已開啟圖片分享";
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      // Browsers can reject a native share after async image generation; keep PNG download available.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "戰報圖片已下載，可以傳給朋友了。";
}

function ReportRankings({ rows }: { rows: DailyReportRow[] }) {
  return (
    <ol className="report-rankings">
      {rows.map((row, i) => (
        <li key={row.PlayerId}>
          <span className="report-rank-number">{i + 1}</span>
          <span className="report-rank-name">{row.DisplayName}</span>
          <Amount value={row.NetAmount} />
        </li>
      ))}
    </ol>
  );
}

export function DailyReportAction({
  report,
  onClick,
}: {
  report: DailyReport | null;
  onClick: () => void;
}) {
  if (!report?.Sessions || !report.Leaders.length) return null;
  const names = report.Leaders.map((r) => r.DisplayName).join("、");
  const tied = report.Leaders.length > 1;
  return (
    <button
      className="daily-report-action"
      aria-label={`開啟今日戰報，${names}${tied ? "並列" : "今天贏了"}`}
      onClick={onClick}
    >
      <strong>今日戰報</strong>
      <span className="daily-report-leader">
        <span className="report-trophy" aria-hidden="true">
          🏆
        </span>{" "}
        <span className="daily-report-names">
          {names}
          {tied ? "並列" : ""}
        </span>
        <span className="daily-report-won">{tied ? "" : "今天贏了"}</span>{" "}
        <Amount value={report.Leaders[0].NetAmount} />
      </span>
      <Icon name="chevron" size={17} />
    </button>
  );
}

export function ReportHero({
  presentation: p,
}: {
  presentation: ReportPresentation;
}) {
  return (
    <>
      <p className="report-period">{p.subtitle}</p>
      <BrandIllustration size="small" className="report-brand" />
      <p className="report-room-name">{p.room}</p>
      <section className="report-hero" aria-label={p.heroLabel}>
        <p className="report-hero-label">{p.heroLabel}</p>
        <div className="report-winners">
          {p.leaders.map((leader) => (
            <div className="report-winner" key={leader.PlayerId}>
              <Avatar
                name={leader.DisplayName}
                url={leader.AvatarImageUrl}
                size={58}
              />
              <strong>{leader.DisplayName}</strong>
              <Amount value={leader.NetAmount} />
            </div>
          ))}
        </div>
      </section>
      <p className="report-hands">
        {p.hands} <span>將</span>
      </p>
    </>
  );
}

export function ReportResults({
  presentation: p,
}: {
  presentation: ReportPresentation;
}) {
  return p.privacyLine ? (
    <p className="report-privacy">{p.privacyLine}</p>
  ) : (
    <ReportRankings rows={p.rankings} />
  );
}

function ShareActions({
  presentation,
  url,
  groupId,
}: {
  presentation: ReportPresentation;
  url: string;
  groupId: string;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl],
  );
  const share = async () => {
    setBusy(true);
    try {
      const snapshot = await resolveReportQuotes(presentation, groupId);
      const blob = await createReportImage(snapshot);
      setImageUrl(URL.createObjectURL(blob));
      setMessage("圖片已產生");
      setMessage(await shareSnapshot(presentation, blob));
    } catch (error) {
      if ((error as Error).name !== "AbortError")
        setMessage("圖片暫時無法產生，請再試一次。");
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("戰報連結已複製；房間成員可開啟查看。");
    } catch {
      setMessage("無法自動複製，請使用瀏覽器分享功能。");
    }
  };
  return (
    <>
      {imageUrl && (
        <details className="report-image-preview">
          <summary>查看戰報圖片</summary>
          <img src={imageUrl} alt={`${presentation.title}分享圖片`} />
          <a
            className="text-button full"
            href={imageUrl}
            download="mahjong-report.png"
          >
            下載戰報圖片
          </a>
        </details>
      )}
      <button
        className="primary full"
        disabled={busy}
        onClick={() => void share()}
      >
        {busy ? "正在整理戰報…" : `分享${presentation.title}`}
      </button>
      <button
        className="text-button full report-copy"
        onClick={() => void copy()}
      >
        <Icon name="link" size={17} /> 複製戰報連結
      </button>
      {message && (
        <p className="report-status" role="status">
          {message}
        </p>
      )}
    </>
  );
}

export function DailyReportModal({
  report,
  groupId,
  onClose,
  initiallyShowResults = false,
}: {
  report: DailyReport;
  groupId: string;
  onClose: () => void;
  initiallyShowResults?: boolean;
}) {
  const [showResults, setShowResults] = useState(initiallyShowResults);
  const p = dailyPresentation(report, showResults);
  return (
    <Modal title="今日戰報" onClose={onClose}>
      <div className="report-sheet">
        <ReportHero presentation={p} />
        <button
          className="report-expand text-button"
          aria-label={showResults ? "隱藏完整戰績" : "顯示完整戰績"}
          aria-expanded={showResults}
          aria-controls="daily-report-results"
          onClick={() => setShowResults((show) => !show)}
        >
          <span>完整戰績</span>
          <Icon name={showResults ? "eye-slash" : "eye"} />
        </button>
        <div id="daily-report-results">
          <ReportResults presentation={p} />
        </div>
        <ShareActions
          key={showResults ? "shown" : "hidden"}
          presentation={p}
          groupId={groupId}
          url={reportShareUrl("daily", groupId, showResults)}
        />
      </div>
    </Modal>
  );
}

export function SessionReportModal({
  session,
  groupName,
  onClose,
}: {
  session: MobileSession;
  groupName: string;
  onClose: () => void;
}) {
  const p = sessionPresentation(session, groupName);
  return (
    <Modal title="本局戰報預覽" onClose={onClose}>
      <div className="report-sheet">
        <ReportHero presentation={p} />
        {!!p.tags.length && (
          <div className="report-tags">
            {p.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        )}
        <h3 className="report-results-heading">完整本局戰績</h3>
        <ReportResults presentation={p} />
        <ShareActions
          presentation={p}
          groupId={session.GroupId}
          url={reportShareUrl("session", session.GroupId, true, session.Id)}
        />
      </div>
    </Modal>
  );
}
