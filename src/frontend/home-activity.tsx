import React from "react";
import type {
  AppealReaction,
  AppealSnapshot,
} from "../application/table-appeal";
import type { FunActivity } from "../application/fun-engine";
import type { MetricLeader } from "../application/mobile-queries";
import { GROUP_DEFINITIONS, PLAYER_ACHIEVEMENTS } from "../fun/catalog";
import { QuickStatCard } from "./homepage-polish";
import { AppealCard } from "./table-appeal";
import { Icon } from "./ui";

export type HomeActivityStats = {
  CurrentStreakLeader: MetricLeader;
  WinRateLeader: MetricLeader;
  RecentFiveLeader: MetricLeader;
};

export function activityPreviewCopy(item: FunActivity) {
  const text = item.Text || "新動態";
  const compose = (
    icon: string,
    player: string,
    verb: string,
    event: string,
    secondary = item.Flavor || "",
  ) => ({
    icon,
    player,
    verb,
    event,
    primary: `${player ? `${player} ` : ""}${verb}${event.startsWith("「") ? "" : " "}${event}`,
    secondary,
  });
  if (item.Type === "HIGHLIGHT_CREATED") {
    const match = text.match(/^(.+) 留下了一則精華。?$/);
    if (match) return compose("📸", match[1], "新增", "一則精華");
  }
  if (item.Type === "PLAYER_RECORD_BROKEN") {
    const match = text.match(/^(.+?) 刷新了個人單場(最高|最低)紀錄：(.+)。$/);
    if (match)
      return compose(
        "👑",
        match[1],
        "刷新",
        `個人單場${match[2]}紀錄`,
        [match[3], item.Flavor].filter(Boolean).join(" · "),
      );
  }
  if (item.Type === "ACHIEVEMENT_BACKFILL_SUMMARY") {
    const match = text.match(/^(.+?) 的老戰績解鎖了 (.+) 個成就。$/);
    if (match)
      return compose("✨", match[1], "解鎖舊戰績", `${match[2]} 個成就`);
  }
  const definition = [...PLAYER_ACHIEVEMENTS, ...GROUP_DEFINITIONS].find(
    (d) => d.Id === item.AchievementId,
  );
  if (definition) {
    const actor = text.includes(" 解鎖了 ")
      ? text.slice(0, text.lastIndexOf(" 解鎖了 "))
      : "";
    const group = item.Type === "GROUP_ACHIEVEMENT_UNLOCKED";
    return compose(
      definition.Icon,
      group ? "" : actor,
      "解鎖",
      `「${definition.Name}」`,
    );
  }
  // Preserve future/uncatalogued achievement names already supplied in activity text.
  const unlock = text.match(/^(.+) 解鎖了 (.+)。$/);
  if (unlock) {
    const [marker, ...name] = unlock[2].split(" ");
    const hasIcon =
      /\p{Extended_Pictographic}/u.test(marker) && name.length > 0;
    return compose(
      hasIcon ? marker : "✨",
      item.Type === "GROUP_ACHIEVEMENT_UNLOCKED" ? "" : unlock[1],
      "解鎖",
      `「${hasIcon ? name.join(" ") : unlock[2]}」`,
    );
  }
  return {
    icon: "✨",
    player: "",
    verb: "",
    event: "",
    primary: text.replace(/^這桌\s+/, ""),
    secondary: item.Flavor || "",
  };
}

export function HomeActivityRow({
  item,
  timestamp = activityAge(item.CreatedAt),
}: {
  item: FunActivity;
  timestamp?: string;
}) {
  const copy = activityPreviewCopy(item);
  return (
    <article
      className="activity-snapshot-row"
      aria-label={item.Text || copy.primary}
    >
      <span className="activity-snapshot-icon" aria-hidden="true">
        {copy.icon}
      </span>
      <div className="activity-snapshot-copy">
        <p className="activity-primary">
          {copy.verb ? (
            <>
              {copy.player && (
                <>
                  <span className="activity-player">{copy.player}</span>{" "}
                </>
              )}
              <span className="activity-verb">{copy.verb}</span>{" "}
              <span className="activity-event">{copy.event}</span>
            </>
          ) : (
            <span className="activity-player">{copy.primary}</span>
          )}
        </p>
        {copy.secondary && (
          <p className="activity-description">{copy.secondary}</p>
        )}
      </div>
      <time dateTime={item.CreatedAt}>{timestamp}</time>
    </article>
  );
}

export function activityAge(stamp: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(stamp)) / 60000));
  return minutes < 1
    ? "剛剛"
    : minutes < 60
      ? `${minutes} 分鐘前`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)} 小時前`
        : "昨天";
}

export function HomeActivitySection({
  appeal,
  activities,
  stats,
  busy,
  onReact,
  onViewAll,
  onStats,
}: {
  appeal: AppealSnapshot | null;
  activities: FunActivity[];
  stats: HomeActivityStats | null;
  busy: boolean;
  onReact: (reaction: AppealReaction) => void;
  onViewAll: () => void;
  onStats: () => void;
}) {
  return (
    <section
      className={`quick-section table-activity-section ${appeal ? "appeal-mode" : "normal-mode"}`}
    >
      <div className="section-heading">
        <h2>這桌動態</h2>
        <button className="text-button" onClick={onViewAll}>
          查看全部 ›
        </button>
      </div>
      {appeal ? (
        <AppealCard appeal={appeal} compact busy={busy} onReact={onReact} />
      ) : (
        <>
          <div className="activity-snapshot">
            {activities
              .filter((item) => item.Type !== "TABLE_APPEAL")
              .slice(0, 2)
              .map((item) => (
                <HomeActivityRow item={item} key={item.Id} />
              ))}
            {!activities.some((item) => item.Type !== "TABLE_APPEAL") && (
              <p className="activity-snapshot-empty">
                這桌還很安靜，下場牌再添一筆。
              </p>
            )}
          </div>
          <small className="activity-stats-label">現在這桌</small>
          <div className="quick-grid">
            {[
              {
                icon: "🔥",
                label: "連勝王",
                accessibleLabel: "目前連勝王",
                leader: stats?.CurrentStreakLeader,
                format: (n: number) => `${n} 連勝`,
              },
              {
                icon: "🎯",
                label: "勝率王",
                accessibleLabel: "勝率王",
                leader: stats?.WinRateLeader,
                format: (n: number) => `${Math.round(n * 100)}%`,
              },
              {
                icon: "🎲",
                label: "手氣王",
                accessibleLabel: "近5場手氣王",
                leader: stats?.RecentFiveLeader,
                format: (n: number) =>
                  `${n > 0 ? "+" : ""}${n.toLocaleString("zh-TW")}`,
              },
            ].map((item) => (
              <QuickStatCard
                key={item.label}
                icon={item.icon}
                label={item.label}
                accessibleLabel={item.accessibleLabel}
                player={item.leader?.DisplayName || "等你上桌"}
                metric={
                  item.leader ? item.format(item.leader.MetricValue) : "—"
                }
              />
            ))}
          </div>
          <button className="stats-link text-button" onClick={onStats}>
            查看所有統計 <Icon name="chevron" size={16} />
          </button>
        </>
      )}
    </section>
  );
}
