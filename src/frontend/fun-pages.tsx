import React, { useEffect, useState } from "react";
import { BrandIllustration, BrandedEmptyState } from "./brand";
import type {
  FunEngineService,
  FunProjection,
  FunActivity,
} from "../application/fun-engine";
import { currentTitle, type TitleDefinition, type Quote } from "../fun/catalog";
import { SENIORITY_LEVELS, type SeniorityTitle } from "../fun/title-system";
import { api } from "./mobile-api";
import { AppealCard } from "./table-appeal";
import type {
  AppealSnapshot,
  AppealReaction,
} from "../application/table-appeal";
import { Modal, Skeleton, Icon } from "./ui";
import {
  CollectionGrid,
  CollectionTile,
  DetailSheet,
  type EntertainmentSection,
} from "./collections";
export type FunHome = Awaited<ReturnType<FunEngineService["home"]>>;
type FunPlayer = Awaited<ReturnType<FunEngineService["player"]>>;
type Achievement = FunPlayer["Achievements"][number];
export type RepresentativeAchievement = {
  Id: string;
  Icon: string;
  Name: string;
};
export function RepresentativeAchievementBadge({
  achievement,
  onClick,
}: {
  achievement: RepresentativeAchievement | null | undefined;
  onClick?: () => void;
}) {
  if (!achievement) return null;
  const props = {
    className: "representative-badge",
    "aria-label": `代表成就，${achievement.Name}`,
  };
  return onClick ? (
    <button type="button" {...props} onClick={onClick}>
      {achievement.Icon} {achievement.Name}
    </button>
  ) : (
    <span {...props}>
      {achievement.Icon} {achievement.Name}
    </span>
  );
}
type Completion = Awaited<ReturnType<FunEngineService["completion"]>>;
const date = (s: string) =>
  new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(s));
const titleText = (t: TitleDefinition) => `${t.Icon} ${t.Name}`;
export function DynamicTitle({ title }: { title?: TitleDefinition }) {
  return title ? <small className="fun-title">{titleText(title)}</small> : null;
}
export const profileCurrentTitles = (titles: TitleDefinition[]) =>
  titles.length ? titles : [currentTitle([])];
export function TitleBadges({
  titles,
  seniority,
  profile = false,
  showTitles = true,
  showSeniority = true,
}: {
  titles: TitleDefinition[];
  seniority?: SeniorityTitle;
  profile?: boolean;
  showTitles?: boolean;
  showSeniority?: boolean;
}) {
  const [selected, setSelected] = useState<TitleDefinition | null>(null);
  const [seniorityOpen, setSeniorityOpen] = useState(false);
  return (
    <div
      className={
        profile ? "title-surfaces profile-title-surfaces" : "title-surfaces"
      }
      onClick={(e) => e.stopPropagation()}
    >
      {showTitles && (
        <span className="title-badges">
          {titles.slice(0, 2).map((t) => (
            <button
              key={t.Id}
              className="fun-title title-badge"
              aria-label={profile ? `目前稱號，${t.Name}` : undefined}
              onClick={(e) => {
                e.stopPropagation();
                setSelected(t);
              }}
            >
              {titleText(t)}
            </button>
          ))}
        </span>
      )}
      {showSeniority && seniority && (
        <span className={profile ? "profile-seniority" : undefined}>
          <button
            className="seniority-badge"
            aria-label={
              profile
                ? `資歷稱號，${seniority.Name}，${seniority.Hands}將`
                : undefined
            }
            onClick={(e) => {
              e.stopPropagation();
              setSeniorityOpen(true);
            }}
          >
            {seniority.Icon}{" "}
            {profile
              ? seniority.Name
              : `這桌資歷 · ${seniority.Name} · ${seniority.Hands}將`}
          </button>
          {profile && (
            <small className="profile-hands">{seniority.Hands}將</small>
          )}
        </span>
      )}
      {selected && (
        <DetailSheet
          title={titleText(selected)}
          onClose={() => setSelected(null)}
        >
          <p>目前符合</p>
          <h3>條件</h3>
          <p>{selected.UserDescription}</p>
          <h3>目前</h3>
          <p>{selected.Current}</p>
        </DetailSheet>
      )}
      {seniority && seniorityOpen && (
        <DetailSheet
          title={seniority.Icon + " " + seniority.Name}
          onClose={() => setSeniorityOpen(false)}
        >
          <h3>累積參與</h3>
          <p>{seniority.Hands} 將</p>
          <h3>下一階</h3>
          <p>
            {seniority.Next
              ? `${seniority.Next.Name} · ${seniority.Next.Threshold} 將`
              : "已達最高階"}
          </p>
        </DetailSheet>
      )}
    </div>
  );
}
export function ChampionQuote({ text }: { text: string }) {
  return <p className="champion-quote">「{text}」</p>;
}

export function PersonalMotto({
  motto,
}: {
  motto: Quote | null;
  editable?: boolean;
  onOpen?: () => void;
}) {
  return (
    <div className="personal-motto">
      <p className={motto ? "fun-motto" : "fun-motto motto-fallback"}>
        「{motto?.Text || "還沒想好要說什麼，先留下戰績。"}」
      </p>
    </div>
  );
}
export function MottoPicker({
  currentId,
  onSelect,
  onClose,
}: {
  currentId: string | null;
  onSelect: (quote: Quote) => Promise<void>;
  onClose: () => void;
}) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const touch = React.useRef<number | null>(null);
  useEffect(() => {
    let active = true;
    void api<Quote[]>("/quotes/library")
      .then((rows) => {
        if (active)
          setQuotes(
            shufflePersonalQuotes(
              rows.filter((q) => q.MottoEligible),
              currentId,
            ),
          );
      })
      .catch(() => {
        if (active) setError("金句載入失敗，請稍後再試。");
      });
    return () => {
      active = false;
    };
  }, [currentId]);
  const move = (direction: number) =>
    setIndex((i) => (i + direction + quotes.length) % quotes.length);
  return (
    <DetailSheet title="選金句" onClose={onClose}>
      {quotes.length ? (
        <>
          <div
            className="motto-picker"
            onTouchStart={(e) => {
              touch.current = e.changedTouches[0].clientX;
            }}
            onTouchEnd={(e) => {
              if (
                touch.current !== null &&
                Math.abs(e.changedTouches[0].clientX - touch.current) > 40
              )
                move(e.changedTouches[0].clientX < touch.current ? 1 : -1);
              touch.current = null;
            }}
          >
            <blockquote key={quotes[index].Id}>
              「{quotes[index].Text}」
            </blockquote>
            <div className="motto-picker-controls">
              <button
                className="text-button"
                aria-label="上一句"
                onClick={() => move(-1)}
              >
                ‹
              </button>
              <button
                className="text-button"
                aria-label="下一句"
                onClick={() => move(1)}
              >
                ›
              </button>
            </div>
          </div>
          <p className="muted">左右滑換一句</p>
          {error && <p className="error">{error}</p>}
          <button
            className="primary full"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onSelect(quotes[index])
                .then(onClose)
                .catch(() => setError("金句儲存失敗，請再試一次。"))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "儲存中…" : "就這句"}
          </button>
        </>
      ) : (
        <p className="muted">{error || "載入金句中…"}</p>
      )}
    </DetailSheet>
  );
}
export function DailyPhilosophySection({ quotes }: { quotes: Quote[] }) {
  const [index, setIndex] = useState(0),
    [copied, setCopied] = useState(false);
  const touch = React.useRef<number | null>(null);
  const move = (direction: number) => {
    if (quotes.length > 1)
      setIndex((i) => (i + direction + quotes.length) % quotes.length);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(quotes[index].Text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard may be unavailable outside a secure browser context. */
    }
  };
  if (!quotes.length) return null;
  return (
    <section
      className="daily-philosophy"
      aria-label="今日牌桌哲學"
      onTouchStart={(e) => {
        touch.current = e.changedTouches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touch.current !== null) {
          const delta = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(delta) > 40) move(delta < 0 ? 1 : -1);
        }
        touch.current = null;
      }}
    >
      <div className="daily-philosophy-heading">
        <h2>今日牌桌哲學</h2>
        <button
          className="icon-button"
          aria-label="複製今日牌桌哲學"
          onClick={() => void copy()}
        >
          <Icon name="copy" size={16} />
        </button>
      </div>
      <div className="daily-philosophy-body">
        <button
          className="text-button"
          aria-label="上一句"
          onClick={() => move(-1)}
        >
          ‹
        </button>
        <blockquote key={quotes[index].Id}>「{quotes[index].Text}」</blockquote>
        <button
          className="text-button"
          aria-label="下一句"
          onClick={() => move(1)}
        >
          ›
        </button>
      </div>
      {copied && (
        <div className="toast" role="status">
          已複製
        </div>
      )}
    </section>
  );
}
export const shufflePersonalQuotes = <T extends { Id: string }>(
  rows: T[],
  currentId?: string | null,
  random = Math.random,
) => {
  const result = [...rows];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  if (result.length > 1 && result[0].Id === currentId)
    [result[0], result[1]] = [result[1], result[0]];
  return result;
};
export const rarityText = (rarity: string) =>
  ({ Common: "一般", Rare: "稀有", Epic: "史詩", Legendary: "傳說" })[rarity] ||
  rarity;
const progressGoals: Record<string, number> = {
  A01: 1,
  A02: 3,
  A03: 5,
  A04: 10,
  A05: 20,
  A06: 10,
  A07: 25,
  A08: 50,
  A09: 100,
  A30: 10,
  A33: 5,
  A34: 10,
};
export function AchievementDetail({
  item: a,
  progress,
  ownerName,
  onClose,
}: {
  item: Achievement;
  progress?: FunProjection["Players"][number]["Progress"];
  ownerName?: string;
  onClose: () => void;
}) {
  const hidden = a.Hidden && !a.Unlocked;
  const current = achievementProgress(a, progress);
  return (
    <DetailSheet
      title={hidden ? "❔ ???" : a.Icon + " " + a.Name}
      onClose={onClose}
    >
      {ownerName && <small>{ownerName}的成就</small>}
      <small>{hidden ? "隱藏成就" : rarityText(a.Rarity)}</small>
      <p>{hidden ? "達成後才會揭曉。" : a.UserDescription}</p>
      {!hidden &&
        (a.UnlockedAt ? (
          <p>解鎖於 {date(a.UnlockedAt)}</p>
        ) : current !== null && progressGoals[a.Id] ? (
          <div>
            <h3>目前進度</h3>
            <progress
              value={Math.min(current, progressGoals[a.Id])}
              max={progressGoals[a.Id]}
            />
            <p>
              {current} / {progressGoals[a.Id]}
            </p>
          </div>
        ) : (
          <p>{a.Unlocked ? "已解鎖" : "尚未解鎖"}</p>
        ))}
    </DetailSheet>
  );
}
function achievementProgress(
  a: Achievement,
  progress?: FunProjection["Players"][number]["Progress"],
) {
  if (!progress) return null;
  return a.ProgressType === "Days"
    ? progress.Days
    : a.ProgressType === "Hands"
      ? progress.Hands
      : a.ProgressType === "Highlights"
        ? progress.Highlights
        : a.ProgressType === "PartnerDays"
          ? progress.PartnerDays
          : null;
}
export function AchievementList({
  items,
  progress,
  ownerName,
  preview = false,
}: {
  items: Achievement[];
  progress?: FunProjection["Players"][number]["Progress"];
  ownerName?: string;
  preview?: boolean;
}) {
  const [selected, setSelected] = useState<Achievement | null>(null);
  return (
    <>
      <CollectionGrid preview={preview}>
        {[...items]
          .sort(
            (a, b) =>
              Number(b.Unlocked) - Number(a.Unlocked) ||
              (b.UnlockedAt || "").localeCompare(a.UnlockedAt || "") ||
              a.Id.localeCompare(b.Id),
          )
          .map((a) => {
            const hidden = a.Hidden && !a.Unlocked,
              current = achievementProgress(a, progress),
              goal = progressGoals[a.Id];
            return (
              <CollectionTile
                key={a.Id}
                className={
                  "fun-achievement " + (a.Unlocked ? "unlocked" : "locked")
                }
                icon={hidden ? "❔" : a.Icon}
                name={hidden ? "???" : a.Name}
                active={a.Unlocked}
                state={
                  hidden
                    ? "隱藏成就"
                    : !a.Unlocked && current !== null && goal
                      ? current + " / " + goal
                      : rarityText(a.Rarity)
                }
                onClick={() => setSelected(a)}
              />
            );
          })}
      </CollectionGrid>
      {selected && (
        <AchievementDetail
          item={selected}
          progress={progress}
          ownerName={ownerName}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
export function TitleCodex({
  titles,
  eligible,
  hasPlayer,
  seniority,
}: {
  titles: TitleDefinition[];
  eligible: string[];
  hasPlayer: boolean;
  seniority?: SeniorityTitle;
}) {
  const [selected, setSelected] = useState<TitleDefinition | null>(null);
  const state = (id: string) =>
    hasPlayer
      ? eligible.includes(id)
        ? "目前符合"
        : "未符合"
      : "尚無牌咖身份";
  return (
    <>
      <h2>資歷</h2>
      {seniority && (
        <>
          <TitleBadges titles={[]} seniority={seniority} />
          <p className="muted">
            累積 {seniority.Hands} 將 ·{" "}
            {seniority.Next
              ? `下一階 ${seniority.Next.Name} ${seniority.Next.Threshold} 將`
              : "已達最高階"}
          </p>
        </>
      )}
      <ol className="seniority-path">
        {SENIORITY_LEVELS.map((l) => (
          <li
            key={l.Id}
            aria-current={seniority?.Id === l.Id ? "step" : undefined}
          >
            <span>
              {l.Icon} {l.Name}
            </span>
            <small>{l.Threshold} 將起</small>
          </li>
        ))}
      </ol>
      <h2>牌桌稱號</h2>
      <CollectionGrid>
        {titles.map((t) => (
          <CollectionTile
            key={t.Id}
            icon={t.Icon}
            name={t.Name}
            state={state(t.Id)}
            active={eligible.includes(t.Id)}
            onClick={() => setSelected(t)}
          />
        ))}
      </CollectionGrid>
      {selected && (
        <DetailSheet
          title={titleText(selected)}
          onClose={() => setSelected(null)}
        >
          <h3>目前狀態</h3>
          <p>{state(selected.Id)}</p>
          <h3>條件</h3>
          <p>{selected.UserDescription}</p>
          {selected.Current && (
            <>
              <h3>目前</h3>
              <p>{selected.Current}</p>
            </>
          )}
        </DetailSheet>
      )}
    </>
  );
}
const PlayerFunContext = React.createContext<{
  data: FunPlayer | null;
  failed: boolean;
  setData: React.Dispatch<React.SetStateAction<FunPlayer | null>>;
} | null>(null);

export function PlayerFunProvider({
  groupId,
  playerId,
  children,
}: {
  groupId: string;
  playerId: string;
  children: React.ReactNode;
}) {
  const [data, setData] = useState<FunPlayer | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setData(null);
    setFailed(false);
    api<FunPlayer>(`/groups/${groupId}/fun/players/${playerId}`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [groupId, playerId]);
  return (
    <PlayerFunContext.Provider value={{ data, failed, setData }}>
      {children}
    </PlayerFunContext.Provider>
  );
}

export function PlayerInsights({
  insights,
}: {
  insights: FunPlayer["Insights"];
}) {
  return (
    <section className="player-insights" aria-label="最近怎麼了？">
      <h3>最近怎麼了？</h3>
      {insights.length ? (
        insights.slice(0, 3).map((i) => (
          <article className="fun-insight" key={i.Id}>
            <span className="insight-icon" aria-hidden="true">
              {i.EventId.startsWith("WIN_STREAK")
                ? "🔥"
                : i.EventId.startsWith("LOSS_STREAK")
                  ? "❄️"
                  : ["MONTH_RANK_1", "RECENT5_LEADER"].includes(i.EventId)
                    ? "👑"
                    : "↗"}
            </span>
            <div>
              <b>{i.Fact}</b>
              <p>{i.Flavor}</p>
            </div>
          </article>
        ))
      ) : (
        <p className="muted">先留下幾場紀錄，讓牌桌慢慢認識你。</p>
      )}
    </section>
  );
}

export function RecentAchievementPreview({
  items,
  progress,
  ownerName,
  onAll,
}: {
  items: Achievement[];
  progress?: FunProjection["Players"][number]["Progress"];
  ownerName?: string;
  onAll: () => void;
}) {
  const [selected, setSelected] = useState<Achievement | null>(null);
  const recent = items
    .filter((a) => a.Unlocked)
    .sort((a, b) => (b.UnlockedAt || "").localeCompare(a.UnlockedAt || ""))
    .slice(0, 3);
  return (
    <section
      className="fun-profile fun-achievements-preview"
      aria-label="最近解鎖成就"
    >
      <div className="section-heading">
        <h3>最近解鎖成就</h3>
        <button className="text-button" onClick={onAll}>
          查看全部 ›
        </button>
      </div>
      {recent.length ? (
        <div className="achievement-preview-strip">
          {recent.map((a) => (
            <button
              className="achievement-preview-chip"
              key={a.Id}
              aria-label={`${a.Name}，查看詳情`}
              onClick={() => setSelected(a)}
            >
              <span aria-hidden="true">{a.Icon}</span>
              <span>{a.Name}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">第一個成就，等下一次上桌。</p>
      )}
      {selected && (
        <AchievementDetail
          item={selected}
          progress={progress}
          ownerName={ownerName}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}

export function PlayerFunSection({
  groupId,
  playerId,
  playerName,
  onFun,
  identityOnly = false,
  titleOnly = false,
  insightsOnly = false,
  representativeOnly = false,
  seniorityOnly = false,
  mottoOnly = false,
}: {
  groupId: string;
  playerId: string;
  playerName?: string;
  onFun: () => void;
  identityOnly?: boolean;
  titleOnly?: boolean;
  insightsOnly?: boolean;
  representativeOnly?: boolean;
  seniorityOnly?: boolean;
  mottoOnly?: boolean;
}) {
  const profile = React.useContext(PlayerFunContext);
  const [representativeOpen, setRepresentativeOpen] = useState(false);
  if (!profile || profile.failed) return null;
  const { data } = profile;
  if (!data) return null;
  if (titleOnly)
    return (
      <TitleBadges
        titles={profileCurrentTitles(data.Titles)}
        profile
        showSeniority={false}
      />
    );
  if (seniorityOnly)
    return (
      <TitleBadges
        titles={[]}
        seniority={data.SeniorityTitle}
        profile
        showTitles={false}
      />
    );
  if (insightsOnly) return <PlayerInsights insights={data.Insights} />;
  if (mottoOnly) return <PersonalMotto motto={data.Motto} />;
  if (representativeOnly && !data.RepresentativeAchievement) return null;
  if (identityOnly || representativeOnly)
    return (
      <div className="fun-identity-accent">
        {identityOnly && <PersonalMotto motto={data.Motto} />}
        {data.RepresentativeAchievement && (
          <RepresentativeAchievementBadge
            achievement={data.RepresentativeAchievement}
            onClick={() => setRepresentativeOpen(true)}
          />
        )}
        {representativeOpen && data.RepresentativeAchievement && (
          <AchievementDetail
            item={data.RepresentativeAchievement}
            ownerName={playerName}
            onClose={() => setRepresentativeOpen(false)}
          />
        )}
      </div>
    );
  return (
    <RecentAchievementPreview
      items={data.Achievements}
      progress={data.Progress}
      ownerName={playerName}
      onAll={onFun}
    />
  );
}
export function CompletionFun({
  groupId,
  sessionId,
}: {
  groupId: string;
  sessionId: string;
}) {
  const [data, setData] = useState<Completion | null>(null),
    [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    api<Completion>(`/groups/${groupId}/fun/sessions/${sessionId}`)
      .then((d) => {
        if (live) setData(d);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [groupId, sessionId]);
  if (!data) return null;
  return (
    <div className="fun-completion">
      <p className="fun-settlement-quote">{data.SettlementQuote}</p>
      {data.SessionTags.length > 0 && (
        <section className="completion-tags">
          <h3>本局標籤</h3>
          <div className="completion-tags-list">
            {data.SessionTags.map(({ PlayerId, PlayerName, Tag }) => (
              <span key={PlayerId + Tag.Id}>
                {Tag.Icon} {PlayerName} · {Tag.Name}
              </span>
            ))}
          </div>
        </section>
      )}
      {data.NewlyUnlocked.length > 0 && (
        <button
          className="secondary full achievement-summary"
          onClick={() => setShow(true)}
        >
          <span aria-hidden="true">🎉</span>
          <span>本次解鎖 {data.NewlyUnlocked.length} 個成就</span>
        </button>
      )}
      {show && (
        <Modal title="這次的牌桌紀念" onClose={() => setShow(false)}>
          <div className="fun-unlocks">
            {data.NewlyUnlocked.map((a) => (
              <article key={`${a.PlayerId}:${a.Id}`}>
                <small>{a.PlayerName}</small>
                <h3>
                  {a.Icon} {a.Name}
                </h3>
                <p>{a.UnlockCopy}</p>
              </article>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
type FunPage = EntertainmentSection;
const pageNames: Record<FunPage, string> = {
  index: "牌桌娛樂",
  activity: "這桌動態",
  titles: "稱號圖鑑",
  achievements: "我的成就",
  hall: "牌桌名人堂",
  group: "群組成就",
};
export function EntertainmentPage({
  groupId,
  myPlayerId,
  achievementTarget = null,
  onAchievementTargetChange = () => {},
  players = [],
  home,
  onRead,
  onPlayer,
  canSetMotto,
  initialPage = "index",
  onPageChange,
  activeAppeal,
  onReactAppeal,
  onAppealSource,
  socialRevision = 0,
}: {
  groupId: string;
  myPlayerId: string | null;
  achievementTarget?: { Id: string; DisplayName: string } | null;
  onAchievementTargetChange?: (
    target: { Id: string; DisplayName: string } | null,
  ) => void;
  players?: { Id: string; DisplayName: string }[];
  home: FunHome | null;
  onRead: () => void;
  onPlayer: (id: string) => void;
  canSetMotto: boolean;
  initialPage?: FunPage;
  onPageChange?: (page: FunPage) => void;
  activeAppeal?: AppealSnapshot | null;
  onReactAppeal?: (reaction: AppealReaction) => void;
  onAppealSource?: (sessionId: string) => void;
  socialRevision?: number;
}) {
  const [page, setPage] = useState<FunPage>(initialPage),
    [data, setData] = useState<FunHome | null>(home),
    [player, setPlayer] = useState<FunPlayer | null>(null),
    [titles, setTitles] = useState<TitleDefinition[]>([]),
    [group, setGroup] = useState<Achievement[]>([]),
    [activity, setActivity] = useState<FunActivity[]>([]),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("all"),
    [category, setCategory] = useState("全部"),
    [busy, setBusy] = useState("");
  const visibleActivity = activity.filter(
    (a) => a.AppealId !== activeAppeal?.Id,
  );
  const base = `/groups/${groupId}/fun`;
  const achievementPlayerId =
    achievementTarget?.Id || myPlayerId || players[0]?.Id || null;
  const achievementPlayerName =
    achievementTarget?.DisplayName ||
    players.find((p) => p.Id === achievementPlayerId)?.DisplayName ||
    "牌咖";
  const ownAchievements = !!myPlayerId && achievementPlayerId === myPlayerId;
  const refresh = async () => {
    setLoading(true);
    setError("");
    setPlayer(null);
    try {
      const h = await api<FunHome>(base);
      setData(h);
      const playerId =
        page === "achievements" ? achievementPlayerId : myPlayerId;
      if (playerId)
        setPlayer(await api<FunPlayer>(base + `/players/${playerId}`));
      if (page === "titles") setTitles(await api(base + "/titles"));
      if (page === "group")
        setGroup(
          (await api<{ Items: Achievement[] }>(base + "/group-achievements"))
            .Items,
        );
      if (page === "activity") {
        const p = await api<{ Items: FunActivity[]; HasMore: boolean }>(
          base + "/activity",
        );
        setActivity(p.Items);
        setMore(p.HasMore);
        await api(base + "/activity/seen", "POST", {});
        onRead();
      }
    } catch {
      setError("娛樂資料暫時載入不了，稍後再試一次。");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, [groupId, myPlayerId, achievementPlayerId, page, socialRevision]);
  useEffect(() => {
    const foreground = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", foreground);
    return () => document.removeEventListener("visibilitychange", foreground);
  }, [groupId, page, myPlayerId, achievementPlayerId]);
  async function action(id: string, fn: () => Promise<void>) {
    setBusy(id);
    setError("");
    try {
      await fn();
    } catch {
      setError("這次沒有儲存成功，請再試一次。");
    } finally {
      setBusy("");
    }
  }
  const back = () => {
    setPage("index");
    onPageChange?.("index");
    window.scrollTo(0, 0);
  };
  const open = (p: FunPage) => {
    if (p === "achievements") onAchievementTargetChange(null);
    setPage(p);
    onPageChange?.(p);
    setCategory("全部");
    setFilter("all");
    window.scrollTo(0, 0);
  };
  const fits = player?.EligibleTitleIds || [];
  return (
    <section className="page-content fun-page">
      {page === "index" && (
        <BrandIllustration size="decoration" className="fun-brand-decoration" />
      )}
      {page !== "index" && (
        <button className="text-button fun-back" onClick={back}>
          ‹ 牌桌娛樂
        </button>
      )}
      <div
        className={`section-heading${page === "achievements" ? " achievement-heading" : ""}`}
      >
        <h2>
          {page === "achievements"
            ? ownAchievements
              ? "我的成就"
              : `${achievementPlayerName}的成就`
            : pageNames[page]}
        </h2>
        {page === "achievements" && achievementPlayerId && (
          <select
            aria-label="切換成就牌咖"
            value={achievementPlayerId}
            onChange={(event) => {
              const selected = players.find((p) => p.Id === event.target.value);
              onAchievementTargetChange(
                event.target.value === myPlayerId
                  ? null
                  : selected || achievementTarget,
              );
            }}
          >
            {myPlayerId && players.some((p) => p.Id === myPlayerId) && (
              <option value={myPlayerId}>我的成就</option>
            )}
            {players
              .filter((p) => p.Id !== myPlayerId)
              .map((p) => (
                <option key={p.Id} value={p.Id}>
                  {p.DisplayName}
                </option>
              ))}
            {achievementTarget &&
              !players.some((p) => p.Id === achievementTarget.Id) && (
                <option value={achievementTarget.Id}>
                  {achievementTarget.DisplayName}
                </option>
              )}
          </select>
        )}
        {page === "activity" && <small>每次載入 20 則</small>}
      </div>
      {error && (
        <div role="alert" className="fun-error">
          <p>{error}</p>
          <button className="secondary" onClick={() => void refresh()}>
            重新載入
          </button>
        </div>
      )}
      {loading ? (
        <>
          <Skeleton />
          <p className="muted" role="status">
            {data?.LoadingQuote.Text}
          </p>
        </>
      ) : (
        <>
          {page === "index" && (
            <>
              {player && player.BackfilledCount > 0 && (
                <p className="fun-backfill">
                  根據歷史紀錄，你已解鎖 {player.BackfilledCount} 個成就。
                  <button
                    className="text-button"
                    onClick={() => open("achievements")}
                  >
                    查看成就 ›
                  </button>
                </p>
              )}
              <div className="fun-menu">
                {(
                  [
                    "activity",
                    "titles",
                    "achievements",
                    "hall",
                    "group",
                  ] as FunPage[]
                ).map((p, i) => (
                  <button
                    key={p}
                    className="fun-menu-item"
                    onClick={() => open(p)}
                  >
                    <span>{["📰", "💬", "🎭", "🏅", "🏆", "🀄"][i]}</span>
                    <b>{pageNames[p]}</b>
                    {p === "activity" && !!data?.UnreadCount && (
                      <small className="fun-unread">
                        {data.UnreadCount} 則新消息
                      </small>
                    )}
                    <span aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {page === "titles" && (
            <>
              <p className="muted">稱號跟著近況改變，成就留下曾經的紀錄。</p>
              <TitleCodex
                titles={titles.map(
                  (t) => player?.EligibleTitles.find((e) => e.Id === t.Id) || t,
                )}
                eligible={fits}
                hasPlayer={!!myPlayerId}
                seniority={player?.SeniorityTitle}
              />
            </>
          )}
          {page === "achievements" && (
            <>
              {player ? (
                <>
                  <p className="fun-count">
                    已解鎖{" "}
                    <b>
                      {player.Achievements.filter((a) => a.Unlocked).length}
                    </b>{" "}
                    / 40
                  </p>
                  <div className="fun-filters" aria-label="成就分類">
                    {[
                      "全部",
                      "麻將人生",
                      "將數",
                      "勝利",
                      "金錢",
                      "恥辱",
                      "社交",
                      "回憶",
                      "隱藏",
                    ].map((c) => (
                      <button
                        key={c}
                        className={category === c ? "selected" : ""}
                        aria-pressed={category === c}
                        onClick={() => setCategory(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <AchievementList
                    key={achievementPlayerId}
                    items={player.Achievements.filter(
                      (a) =>
                        category === "全部" ||
                        ("Category" in a && a.Category === category) ||
                        (a.Hidden && category === "隱藏"),
                    )}
                    progress={player.Progress}
                    ownerName={achievementPlayerName}
                  />
                </>
              ) : (
                <BrandedEmptyState
                  title="目前沒有可查看的牌咖成就"
                  note="請從上方選擇一位牌咖。"
                />
              )}
            </>
          )}
          {page === "group" && (
            <>
              <p className="fun-count">
                這桌一起解鎖了 <b>{group.filter((a) => a.Unlocked).length}</b> /
                7
              </p>
              <AchievementList items={group} />
            </>
          )}
          {page === "hall" && (
            <div className="fun-hall">
              {data?.Hall.map((h) => (
                <article key={h.Id}>
                  <h3>{h.Name}</h3>
                  {h.Players.length ? (
                    <>
                      <strong className="fun-hall-value">
                        {h.Value.toLocaleString("zh-TW")}
                      </strong>
                      <div>
                        {h.Players.map((p) => (
                          <button
                            key={p.Id}
                            className="text-button"
                            onClick={() => onPlayer(p.Id)}
                          >
                            {p.DisplayName}
                            {p.IsArchived ? " · 已離開" : ""}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="muted">王位還空著。</p>
                  )}
                </article>
              ))}
            </div>
          )}
          {page === "activity" && (
            <>
              {activeAppeal && (
                <AppealCard
                  appeal={activeAppeal}
                  onReact={onReactAppeal}
                  onSource={onAppealSource}
                />
              )}
              {activeAppeal && visibleActivity.length > 0 && (
                <h3 className="fun-activity-history-label">過往動態</h3>
              )}
              {visibleActivity.length ? (
                visibleActivity.map((a, i) => (
                  <React.Fragment key={a.Id}>
                    {(i === 0 ||
                      a.LocalDate !== visibleActivity[i - 1].LocalDate) && (
                      <h3 className="fun-day">
                        {a.LocalDate === data?.LocalDate
                          ? "今天"
                          : data &&
                              a.LocalDate ===
                                new Intl.DateTimeFormat("en-CA", {
                                  timeZone: "Asia/Taipei",
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                }).format(
                                  new Date(
                                    Date.parse(
                                      data.LocalDate + "T00:00:00+08:00",
                                    ) - 86400000,
                                  ),
                                )
                            ? "昨天"
                            : a.LocalDate}
                      </h3>
                    )}
                    {a.Appeal ? (
                      <AppealCard
                        appeal={a.Appeal}
                        onReact={onReactAppeal}
                        onSource={onAppealSource}
                      />
                    ) : (
                      <article className="fun-activity">
                        <p>{a.Text}</p>
                        {a.Flavor && (
                          <p className="fun-activity-flavor">{a.Flavor}</p>
                        )}
                        <small>
                          {new Intl.DateTimeFormat("zh-TW", {
                            timeZone: "Asia/Taipei",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(a.CreatedAt))}
                        </small>
                        {a.PlayerId && (
                          <button
                            className="text-button"
                            onClick={() => onPlayer(a.PlayerId!)}
                          >
                            查看牌咖 ›
                          </button>
                        )}
                      </article>
                    )}
                  </React.Fragment>
                ))
              ) : !activeAppeal ? (
                <BrandedEmptyState
                  title="這桌還很安靜"
                  note="新的成就與精華，會留在這裡。"
                />
              ) : null}
              {more && (
                <button
                  className="secondary full"
                  disabled={!!busy}
                  onClick={() =>
                    action("more", async () => {
                      const next = await api<{
                        Items: FunActivity[];
                        HasMore: boolean;
                      }>(base + `/activity?offset=${activity.length}`);
                      setActivity((rows) => [...rows, ...next.Items]);
                      setMore(next.HasMore);
                    })
                  }
                >
                  查看更多動態
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
