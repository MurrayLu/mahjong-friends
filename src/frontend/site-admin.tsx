import React, { useEffect, useState } from "react";
import type {
  AdminGroup,
  AdminGroupPage,
  AdminPeoplePage,
  AdminPreview,
  SiteDashboard,
} from "../application/site-admin";
import type {
  MobileSession,
  HighlightFeed,
  Page,
} from "../application/mobile-queries";
import { api } from "./mobile-api";
import { BrandIllustration, BrandWordmark } from "./brand";
import { Avatar, Amount } from "./ui";
import { SessionCard } from "./session-history";

export function PublicUsageStats() {
  const [counts, setCounts] = useState<{
    RecordedPlayers: number;
    Groups: number;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    // New cache key avoids reusing the previous Google-registration-only response.
    void api<{ RecordedPlayers: number; Groups: number }>(
      "/public/stats?version=2",
    )
      .then((v) => {
        if (
          alive &&
          Number.isSafeInteger(v.RecordedPlayers) &&
          v.RecordedPlayers >= 0 &&
          Number.isSafeInteger(v.Groups) &&
          v.Groups >= 0
        )
          setCounts(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return counts ? <PublicUsageStatsText {...counts} /> : null;
}
export function PublicUsageStatsText({
  RecordedPlayers,
  Groups,
}: {
  RecordedPlayers: number;
  Groups: number;
}) {
  return (
    <p className="public-usage-stats">
      已有 {RecordedPlayers.toLocaleString()} 位牌咖留下戰績 ·{" "}
      {Groups.toLocaleString()} 個麻吉局成立
    </p>
  );
}
export function SiteAdminMenuEntry({ userId }: { userId?: string }) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let alive = true;
    setAllowed(false);
    if (userId)
      void api<{ Allowed: boolean }>("/admin-access")
        .then((v) => {
          if (alive) setAllowed(v.Allowed);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId]);
  return allowed ? (
    <a className="ting-tool-link" href="/admin">
      ▦ 管理後台
    </a>
  ) : null;
}
export function PrivacyPage() {
  return (
    <main className="site-admin-shell">
      <BrandWordmark />
      <h1>隱私與資料使用說明</h1>
      <p>
        麻吉局、成員、戰局與結算的個別資料不會透過公開統計提供。公開統計僅包含有牌局結果的牌咖總數及有效麻吉局總數。牌咖包含訪客與未連結
        Google
        的帳號；同帳號跨麻吉局去重，未連結帳號的訪客依各牌咖紀錄計算，不依姓名合併。
      </p>
      <p>
        網站管理者可能基於平台維護、問題排查與安全管理目的，以獨立的唯讀監看模式查看麻吉局資料。每次監看均保留最小必要的身分、麻吉局、時間與結果稽核紀錄，不記錄
        Token 或完整牌局內容。
      </p>
      <p>
        管理後台不授予跨麻吉局修改權限。網站會記錄已連結 Google
        帳號的成功首頁載入與業務操作時間，用於去重的活躍使用統計，不使用第三方
        Analytics SDK。
      </p>
      <p>Google 身分驗證資料僅供登入及權限核對，不會出現在公開統計。</p>
      <a className="text-button" href="/">
        返回這桌
      </a>
    </main>
  );
}
function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError("");
    if (path)
      void api<T>(path)
        .then((v) => {
          if (alive) setData(v);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [path, revision]);
  return { data, error, retry: () => setRevision((v) => v + 1) };
}
function LoadState({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="admin-state" role="status">
      {error || "整理資料中…"}
      {error && (
        <button className="secondary" onClick={retry}>
          重試
        </button>
      )}
    </div>
  );
}
const stamp = (s: string) =>
  new Date(s).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });
function Metric({
  label,
  value,
  href,
  note,
}: {
  label: string;
  value: number | null;
  href?: string;
  note?: string;
}) {
  const body = (
    <>
      <span>{label}</span>
      <strong>{value === null ? "—" : value.toLocaleString()}</strong>
      {note && <small>{note}</small>}
    </>
  );
  return href ? (
    <a className="admin-metric" href={href}>
      {body}
    </a>
  ) : (
    <div className="admin-metric">{body}</div>
  );
}
export function AdminDashboardView({ data: d }: { data: SiteDashboard }) {
  return (
    <>
      <div className="admin-metrics">
        <Metric label="累積註冊牌咖" value={d.RegisteredUsers} />
        <Metric label="有效麻吉局" value={d.Groups} href="/admin/groups" />
        <Metric label="不重複建立者" value={d.Creators} />
        <Metric label="累積完成結算" value={d.SettledSessions} />
        <Metric
          label="近 7 天活躍牌咖"
          value={d.Active7Reliable ? d.ActiveUsers7 : null}
          note={
            d.Active7Reliable
              ? undefined
              : `尚無完整統計；已觀測 ${d.ActiveUsers7} 人`
          }
        />
        <Metric
          label="近 30 天活躍牌咖"
          value={d.Active30Reliable ? d.ActiveUsers30 : null}
          note={
            d.Active30Reliable
              ? undefined
              : `尚無完整統計；已觀測 ${d.ActiveUsers30} 人`
          }
        />
        <Metric
          label="近 30 天活躍麻吉局"
          value={d.ActiveGroups30Reliable ? d.ActiveGroups30 : null}
          note={
            d.ActiveGroups30Reliable
              ? undefined
              : `舊結算時間未知；已確認 ${d.ActiveGroups30} 局`
          }
        />
        <Metric
          label="近 30 天新增牌咖"
          value={d.Registration30Reliable ? d.NewUsers30 : null}
          note={
            d.Registration30Reliable
              ? undefined
              : `尚無完整統計；已觀測 ${d.NewUsers30} 人`
          }
        />
        <Metric label="近 30 天新建麻吉局" value={d.NewGroups30} />
      </div>
      <p className="small muted">
        7／30 天指標採滾動時間窗，顯示時區 Asia/Taipei。活動觀測自{" "}
        {stamp(d.ObservationStartedAt)}{" "}
        起；舊資料不補造。現存麻吉局及結算為目前資料庫快照，已刪除紀錄不計入。
      </p>
      <section className="admin-panel">
        <h2>最近 7 天成長</h2>
        <p className="small muted">
          台北日曆日，今天截至目前；黃色為新增牌咖，綠色為新建麻吉局。—
          代表該日牌咖資料尚不完整。
        </p>
        <div className="admin-growth" aria-label="最近七天成長長條圖">
          {d.Daily.map((day) => {
            const max = Math.max(
              1,
              ...d.Daily.flatMap((v) => [
                v.UsersReliable ? v.Users : 0,
                v.Groups,
              ]),
            );
            return (
              <div className="admin-growth-day" key={day.Date}>
                <div className="admin-growth-bars" aria-hidden="true">
                  <i
                    style={{
                      height: `${day.UsersReliable ? (day.Users / max) * 100 : 0}%`,
                    }}
                  />
                  <i style={{ height: `${(day.Groups / max) * 100}%` }} />
                </div>
                <b>
                  {day.UsersReliable ? day.Users : "—"} / {day.Groups}
                </b>
                <small>{day.Date.slice(5)}</small>
              </div>
            );
          })}
        </div>
      </section>
      <section className="admin-panel">
        <h2>建立者分布 · 前 10 名</h2>
        {d.CreatorsTop.length ? (
          d.CreatorsTop.map((c) => (
            <a
              className="admin-creator"
              href={"/admin/groups?creator=" + encodeURIComponent(c.UserId)}
              key={c.UserId}
            >
              <span>{c.DisplayName}</span>
              <b>建立 {c.Groups} 局 ›</b>
            </a>
          ))
        ) : (
          <p className="muted">尚無麻吉局。</p>
        )}
      </section>
    </>
  );
}
function GroupRow({
  group: g,
  returnTo,
}: {
  group: AdminGroup;
  returnTo: string;
}) {
  return (
    <article className="admin-group-row">
      <div>
        <h3>{g.Name}</h3>
        <small className="admin-id">{g.Id}</small>
      </div>
      <dl>
        <div>
          <dt>建立者</dt>
          <dd>{g.CreatorName ?? "未知建立者"}</dd>
        </div>
        <div>
          <dt>目前管理員</dt>
          <dd>{g.Admins.map((a) => a.DisplayName).join("、") || "未知"}</dd>
        </div>
        <div>
          <dt>成員／結算</dt>
          <dd>
            {g.MemberCount} 人 · {g.SettledCount} 場
          </dd>
        </div>
        <div>
          <dt>建立日期</dt>
          <dd>{stamp(g.CreatedAt)}</dd>
        </div>
        <div>
          <dt>最近資料異動</dt>
          <dd>{stamp(g.LastActivityAt)}</dd>
        </div>
      </dl>
      <a
        className="secondary admin-view-link"
        href={`/admin/groups/${encodeURIComponent(g.Id)}?return=${encodeURIComponent(returnTo)}`}
      >
        查看 ›
      </a>
    </article>
  );
}
function Paging({
  offset,
  hasMore,
  total,
  onPage,
}: {
  offset: number;
  hasMore: boolean;
  total: number;
  onPage: (n: number) => void;
}) {
  return (
    <div className="admin-paging">
      <button
        className="secondary"
        disabled={!offset}
        onClick={() => onPage(Math.max(0, offset - 20))}
      >
        上一頁
      </button>
      <small>
        {total} 筆 · 第 {Math.floor(offset / 20) + 1} 頁
      </small>
      <button
        className="secondary"
        disabled={!hasMore}
        onClick={() => onPage(offset + 20)}
      >
        下一頁
      </button>
    </div>
  );
}
function AdminRooms({
  userId,
  returnTo,
}: {
  userId: string;
  returnTo: string;
}) {
  const [offset, setOffset] = useState(0);
  const r = useResource<AdminGroupPage>(
    `/admin/groups?admin=${encodeURIComponent(userId)}&offset=${offset}`,
  );
  return !r.data ? (
    <LoadState error={r.error} retry={r.retry} />
  ) : (
    <>
      <div>
        {r.data.Items.map((g) => (
          <GroupRow group={g} returnTo={returnTo} key={g.Id} />
        ))}
      </div>
      <Paging
        offset={offset}
        hasMore={r.data.HasMore}
        total={r.data.Total}
        onPage={setOffset}
      />
    </>
  );
}
export function AdminGroupsPage() {
  const [params, setParams] = useState(
    () => new URLSearchParams(location.search),
  );
  const [search, setSearch] = useState(params.get("q") ?? "");
  const mode = params.get("mode") === "admins" ? "admins" : "groups",
    offset = Number(params.get("offset") ?? 0) || 0;
  const path = "/admin/" + mode + "?" + params.toString();
  const r = useResource<AdminGroupPage | AdminPeoplePage>(path),
    summary = useResource<SiteDashboard>("/admin/dashboard");
  const [expanded, setExpanded] = useState<string | null>(null);
  function update(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    next.delete("offset");
    for (const [k, v] of Object.entries(values)) {
      v ? next.set(k, v) : next.delete(k);
    }
    history.replaceState(null, "", "/admin/groups?" + next);
    setParams(next);
    setExpanded(null);
  }
  useEffect(() => {
    const pop = () => {
      const next = new URLSearchParams(location.search);
      setParams(next);
      setSearch(next.get("q") ?? "");
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const returnTo = "/admin/groups?" + params.toString();
  return (
    <>
      {summary.data && (
        <div className="admin-metrics">
          <Metric label="有效麻吉局" value={summary.data.Groups} />
          <Metric label="建立者" value={summary.data.Creators} />
          <Metric label="目前管理員" value={summary.data.Admins} />
          <Metric
            label="近 30 天活躍局"
            value={
              summary.data.ActiveGroups30Reliable
                ? summary.data.ActiveGroups30
                : null
            }
            note={
              summary.data.ActiveGroups30Reliable ? undefined : "尚無完整統計"
            }
          />
        </div>
      )}
      <div className="admin-segments" role="group" aria-label="清單模式">
        <button
          aria-pressed={mode === "groups"}
          onClick={() => update({ mode: "groups" })}
        >
          依麻吉局
        </button>
        <button
          aria-pressed={mode === "admins"}
          onClick={() => update({ mode: "admins", creator: "", admin: "" })}
        >
          依管理員
        </button>
      </div>
      <form
        className="admin-filters"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: search });
        }}
      >
        <input
          aria-label="搜尋名稱、建立者、管理員"
          placeholder="名稱、建立者、管理員"
          value={search}
          maxLength={200}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="secondary" type="submit">
          搜尋
        </button>
        {mode === "groups" && (
          <select
            aria-label="排序"
            value={params.get("sort") ?? "activity"}
            onChange={(e) => update({ sort: e.target.value })}
          >
            <option value="activity">最近資料異動</option>
            <option value="created">建立時間（新到舊）</option>
            <option value="oldest">建立時間（舊到新）</option>
            <option value="settlements">結算數量</option>
          </select>
        )}
      </form>
      {(params.get("creator") || params.get("admin")) && (
        <button
          className="text-button"
          onClick={() => update({ creator: "", admin: "" })}
        >
          清除人物篩選 ×
        </button>
      )}
      {!r.data ? (
        <LoadState error={r.error} retry={r.retry} />
      ) : (
        <>
          {!r.data.Items.length && (
            <p className="admin-state">沒有符合條件的麻吉局或管理員。</p>
          )}
          {mode === "groups"
            ? (r.data as AdminGroupPage).Items.map((g) => (
                <GroupRow key={g.Id} group={g} returnTo={returnTo} />
              ))
            : (r.data as AdminPeoplePage).Items.map((a) => (
                <section className="admin-panel" key={a.UserId}>
                  <button
                    className="admin-person-toggle"
                    aria-expanded={expanded === a.UserId}
                    onClick={() =>
                      setExpanded(expanded === a.UserId ? null : a.UserId)
                    }
                  >
                    <span>
                      <b>{a.DisplayName}</b>
                      <small>{a.Email ?? "未連結 Google"}</small>
                    </span>
                    <span>
                      管理 {a.Groups} 局
                      <small>本人建立 {a.CreatedGroups} 局</small>
                    </span>
                  </button>
                  {expanded === a.UserId && (
                    <AdminRooms userId={a.UserId} returnTo={returnTo} />
                  )}
                </section>
              ))}
          <Paging
            offset={offset}
            hasMore={r.data.HasMore}
            total={r.data.Total}
            onPage={(n) => update({ offset: String(n) })}
          />
        </>
      )}
    </>
  );
}
export function safeAdminReturn(value: string | null) {
  // Only a same-site fixed list path; query state is carried without granting rights.
  return value && /^\/admin\/groups(?:\?[^#]*)?$/.test(value)
    ? value
    : "/admin/groups";
}
export function AdminPreviewContent({ data: d }: { data: AdminPreview }) {
  const [tab, setTab] = useState("overview");
  const [sessions, setSessions] = useState(d.Sessions),
    [highlights, setHighlights] = useState(d.Highlights),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setSessions(d.Sessions);
    setHighlights(d.Highlights);
  }, [d]);
  const avatar = (_id: string, fallback?: string | null) => fallback;
  async function more(kind: "sessions" | "highlights") {
    setBusy(true);
    setError("");
    try {
      if (kind === "sessions") {
        const next = await api<Page<MobileSession>>(
          `/admin/groups/${encodeURIComponent(d.Group.Id)}/sessions?offset=${sessions.NextOffset}`,
        );
        setSessions((v) => ({ ...next, Items: [...v.Items, ...next.Items] }));
      } else {
        const next = await api<Page<HighlightFeed>>(
          `/admin/groups/${encodeURIComponent(d.Group.Id)}/highlights?offset=${highlights.NextOffset}`,
        );
        setHighlights((v) => ({ ...next, Items: [...v.Items, ...next.Items] }));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>{d.Group.Name}</h1>
      <p className="small muted">建立於 {stamp(d.Group.CreatedAt)}</p>
      <div
        className="admin-segments admin-preview-tabs"
        role="group"
        aria-label="監看內容"
      >
        {[
          ["overview", "統計"],
          ["history", "對戰紀錄"],
          ["members", "成員"],
          ["highlights", "精華"],
        ].map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <>
          <h2>排行榜與輸贏</h2>
          <div className="admin-panel">
            {d.Ranking.length ? (
              d.Ranking.map((p, i) => (
                <div className="admin-ranking-row" key={p.PlayerId}>
                  <span>{i + 1}</span>
                  <Avatar
                    name={p.DisplayName}
                    url={p.AvatarImageUrl}
                    size={30}
                  />
                  <span>
                    <b>{p.DisplayName}</b>
                    <small>
                      {p.SessionsPlayed} 場 · 均額{" "}
                      {p.AveragePerSession.toFixed(0)}
                    </small>
                  </span>
                  <Amount value={p.NetAmount} />
                </div>
              ))
            ) : (
              <p className="muted">尚無戰績。</p>
            )}
          </div>
          <h2>今日戰報</h2>
          <p className="muted">
            最近 24 小時 · {d.DailyReport.Sessions} 局 / {d.DailyReport.Hands}{" "}
            將 / {d.DailyReport.Players} 位牌咖
          </p>
          {d.DailyReport.Leader && (
            <p>
              {d.DailyReport.Leader.DisplayName}{" "}
              <Amount value={d.DailyReport.Leader.NetAmount} />
            </p>
          )}
          <h2>成員統計</h2>
          {d.Statistics.Players.map((p) => (
            <div className="admin-creator" key={p.PlayerId}>
              <span>
                {p.DisplayName}
                <small>
                  {p.Sessions} 場 · {p.Wins} 勝 / {p.Losses} 敗 / {p.Draws} 和 ·
                  勝率 {(p.WinRate * 100).toFixed(0)}%
                </small>
              </span>
              <Amount value={p.Total} />
            </div>
          ))}
        </>
      )}
      {tab === "history" && (
        <>
          {sessions.Items.length ? (
            sessions.Items.map((s) => (
              <div key={s.Id}>
                <p className="small muted">
                  {s.RecordDate} · {s.IsSettled ? "已結算" : "未結算"}
                </p>
                <SessionCard
                  session={s}
                  writable={false}
                  avatar={avatar}
                  onEdit={() => {}}
                  onAppeal={() => {}}
                />
              </div>
            ))
          ) : (
            <p className="admin-state">尚無戰局。</p>
          )}
          {sessions.HasMore && (
            <button
              className="secondary full"
              disabled={busy}
              onClick={() => void more("sessions")}
            >
              載入更多紀錄
            </button>
          )}
        </>
      )}
      {tab === "members" && (
        <section className="admin-panel">
          {d.Members.map((m) => (
            <div className="admin-member" key={m.UserId}>
              <Avatar name={m.DisplayName} url={m.AvatarImageUrl} size={32} />
              <div>
                <b>{m.DisplayName}</b>
                <small>
                  {m.AccessLevel === "Viewer" ? "旁觀者" : "牌咖"}
                  {m.IsAdmin ? " · 管理員" : ""}
                </small>
              </div>
            </div>
          ))}
        </section>
      )}
      {tab === "highlights" && (
        <>
          {highlights.Items.length ? (
            highlights.Items.map((h) => (
              <article className="highlight-card" key={h.Id}>
                <header>
                  <Avatar
                    name={h.CreatorName}
                    url={h.CreatorAvatar}
                    size={30}
                  />
                  <div>
                    <b>{h.CreatorName}</b>
                    <small>{h.RecordDate}</small>
                  </div>
                </header>
                <div className="highlight-copy">
                  <h3>{h.Title}</h3>
                </div>
                {h.ImageUrl && (
                  <img
                    className="admin-highlight-image"
                    src={h.ImageUrl}
                    alt={h.Title ?? "精華照片"}
                  />
                )}
                <div className="highlight-bottom">
                  {h.PlayerName && <p>{h.PlayerName}</p>}
                  {h.Amount !== null && <Amount value={h.Amount} />}
                  <p>{h.Note}</p>
                </div>
              </article>
            ))
          ) : (
            <p className="admin-state">尚無精華。</p>
          )}
          {highlights.HasMore && (
            <button
              className="secondary full"
              disabled={busy}
              onClick={() => void more("highlights")}
            >
              載入更多精華
            </button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
function PreviewPage({ groupId }: { groupId: string }) {
  const [period, setPeriod] = useState("all");
  const r = useResource<AdminPreview>(
    `/admin/groups/${encodeURIComponent(groupId)}/preview?period=${period}`,
  );
  return (
    <>
      <p className="admin-readonly">管理員監看模式 · 唯讀</p>
      <a
        className="text-button"
        href={safeAdminReturn(
          new URLSearchParams(location.search).get("return"),
        )}
      >
        ‹ 返回麻吉局清單
      </a>
      <label className="admin-period">
        統計期間
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="all">全部</option>
          <option value="current-month">本月</option>
          <option value="previous-month">上月</option>
          <option value="year">今年</option>
        </select>
      </label>
      {r.data ? (
        <AdminPreviewContent data={r.data} />
      ) : (
        <LoadState error={r.error} retry={r.retry} />
      )}
    </>
  );
}
export function SiteAdminApp() {
  const access = useResource<{ Allowed: boolean }>("/admin-access");
  const dashboard = useResource<SiteDashboard>(
    access.data?.Allowed && /^\/admin\/?$/.test(location.pathname)
      ? "/admin/dashboard"
      : null,
  );
  const route = location.pathname.match(/^\/admin\/groups\/([^/]+)\/?$/);
  return (
    <main className="site-admin-shell">
      <header className="admin-shell-header">
        <BrandWordmark />
        <a className="text-button" href="/">
          返回這桌
        </a>
      </header>
      {!access.data ? (
        <>
          <LoadState error={access.error} retry={access.retry} />
          {access.error && (
            <a className="secondary" href="/api/auth/google">
              使用 Google 重新登入
            </a>
          )}
        </>
      ) : !access.data.Allowed ? (
        <div className="admin-state">
          <BrandIllustration />
          <h1>無法進入管理後台</h1>
          <p>
            需要指定 Google 管理員身分。若剛啟用權限，請重新以 Google 登入。
          </p>
          <a className="secondary" href="/api/auth/google">
            Google 登入
          </a>
        </div>
      ) : (
        <>
          <nav className="admin-nav">
            <a href="/admin">營運總覽</a>
            <a href="/admin/groups">麻吉局總覽</a>
            <span>唯讀管理</span>
          </nav>
          {route ? (
            <PreviewPage groupId={decodeURIComponent(route[1])} />
          ) : location.pathname.replace(/\/$/, "") === "/admin/groups" ? (
            <>
              <h1>麻吉局總覽</h1>
              <AdminGroupsPage />
            </>
          ) : (
            <>
              <h1>網站營運總覽</h1>
              {dashboard.data && "Groups" in dashboard.data ? (
                <AdminDashboardView data={dashboard.data} />
              ) : (
                <LoadState error={dashboard.error} retry={dashboard.retry} />
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
