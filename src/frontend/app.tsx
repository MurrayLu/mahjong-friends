import { SessionCard, ResultList } from "./session-history";
import { RatePresetEditor, ManageRatePresets } from "./rate-preset-editor";
import { defaultRateSettings } from "../domain/rate-presets";
import "./rate-presets.css";
import { SiteAdminApp, SiteAdminMenuEntry, PrivacyPage } from "./site-admin";
import { HighlightActions, HighlightManagement } from "./highlight-actions";
import { KOBoardEmptyState } from "./ko-empty-state";
import { lastRoom, rememberRoom, selectRoom } from "./room-preference";
import { RoomDeletionDialog } from "./room-deletion";
import {
  EntertainmentNavigation,
  type EntertainmentSection,
} from "./collections";
import { BrandLanding } from "./brand-landing";
import {
  BrandMark,
  BrandIllustration,
  BrandWordmark,
  BrandLoading,
  BrandedEmptyState,
  CompletionBrandHero,
} from "./brand";
import { PublicTingPage, isTingRoute, TING_PATH } from "./ting-calculator";
import { PlayerAnalysisPage } from "./player-analysis";
import { HistoryActionToolbar } from "./homepage-polish";
import { AppealChip } from "./table-appeal";
import { HomeActivitySection } from "./home-activity";
import type {
  AppealSnapshot,
  AppealReaction,
} from "../application/table-appeal";
import type { FunActivity } from "../application/fun-engine";
import type { AppealEvent } from "../api/group-realtime";
import {
  TitleBadges,
  ChampionQuote,
  PlayerFunSection,
  PlayerFunProvider,
  CompletionFun,
  EntertainmentPage,
  DailyPhilosophySection,
  MottoPicker,
  RepresentativeAchievementBadge,
  rarityText,
  type FunHome,
} from "./fun-pages";
import type { PlayerAnalysis } from "../application/player-analysis";
import { QUOTE_CATALOG } from "../fun/catalog";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  AccountView,
  GroupView as Group,
  LeaderboardRow,
  PlayerView,
  RoomMemberView,
} from "../domain/model";
import type {
  DailyReport,
  HighlightFeed,
  MetricLeader,
  MobileSession,
  Page,
  PlayerStatistics,
} from "../application/mobile-queries";
import { api } from "./mobile-api";
import { Avatar, Amount, Empty, Icon, Modal, Skeleton } from "./ui";
import { SessionWizard, HighlightForm, typeNames } from "./flows";
import {
  ScrollMemory,
  swipeDirection,
  playerIdentity,
  currentPlayerId,
  pagerGuardHeight,
} from "./mobile-logic";
import { uploadProcessedImage } from "./image-processing";
import "./style.css";
import "./fun.css";
import "./activity.css";
import "./ting.css";
import "./brand.css";
import "./reports.css";
import "./site-admin.css";
import { RangePicker, InviteSheet, InviteLanding } from "./polish";
import { BecomePlayer } from "./membership";
import { confirmedDelete } from "./polish-logic";
import {
  DailyReportAction,
  DailyReportModal,
  SessionReportModal,
} from "./reports";
type Statistics = {
  Players: PlayerStatistics[];
  CurrentStreakLeader: MetricLeader;
  WinRateLeader: MetricLeader;
  RecentFiveLeader: MetricLeader;
};
type Overlay =
  | "become"
  | "claim"
  | "invite"
  | "drawer"
  | "switch"
  | "create-room"
  | "join-room"
  | "session"
  | "highlight"
  | null;
const dateLabel = (date: string) => date.slice(5).replace("-", "/");
const relative = (stamp: string) => {
  const days = Math.floor((Date.now() - Date.parse(stamp)) / 86400000);
  return days < 1 ? "今天" : days === 1 ? "昨天" : `${days} 天前`;
};
function App() {
  const [createRates, setCreateRates] = useState(defaultRateSettings);
  const [funPage, setFunPage] = useState<EntertainmentSection>("index");
  const [achievementTarget, setAchievementTarget] = useState<{
    Id: string;
    DisplayName: string;
  } | null>(null);
  const [funHome, setFunHome] = useState<FunHome | null>(null);
  const [deletingRoom, setDeletingRoom] = useState<{
    Id: string;
    Name: string;
  } | null>(null);
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [dailyReportOpen, setDailyReportOpen] = useState(false);
  const [reportShowResults, setReportShowResults] = useState(false);
  const [sessionReport, setSessionReport] = useState<MobileSession | null>(
    null,
  );
  const [activeAppeal, setActiveAppeal] = useState<AppealSnapshot | null>(null);
  const [appealPast, setAppealPast] = useState(false);
  const [activityPreview, setActivityPreview] = useState<FunActivity[]>([]);
  const [socialRevision, setSocialRevision] = useState(0);
  const [appealBanner, setAppealBanner] = useState<{
    kind: "created" | "ready";
    appeal: AppealSnapshot;
  } | null>(null);
  const seenAppealEvents = useRef(new Set<string>());
  const [inviteCode, setInviteCode] = useState(
      location.pathname.startsWith("/join/") ? location.pathname.slice(6) : "",
    ),
    [dates, setDates] = useState<string[]>([]),
    [homePeriod, setHomePeriod] = useState("current-month"),
    [homeRange, setHomeRange] = useState(""),
    [statsRange, setStatsRange] = useState(""),
    [filteredStats, setFilteredStats] = useState<Statistics | null>(null),
    [statsLoading, setStatsLoading] = useState(false);
  const periodLabel = (p: string, r: string) =>
    p === "custom"
      ? r
          .split("&")
          .map((v) => dateLabel(v.split("=")[1]))
          .join(" – ")
      : {
          "current-month": "本月",
          "previous-month": "上月",
          year: "今年",
          all: "全部",
        }[p] || "本月";
  const pendingScroll = useRef<number | null>(null);
  const pagerRef = useRef<HTMLElement>(null);
  const releaseFrame = useRef<number | null>(null);
  const [ready, setReady] = useState(false),
    [user, setUser] = useState<AccountView | null>(null),
    [auth, setAuth] = useState({ google: false, dev: false }),
    [groups, setGroups] = useState<Group[]>([]),
    [groupId, setGroupId] = useState(""),
    [roster, setRoster] = useState<RoomMemberView[]>([]),
    [confirmation, setConfirmation] = useState<{
      kind: "remove" | "unclaim";
      userId: string;
      name: string;
    } | null>(null),
    [players, setPlayers] = useState<PlayerView[]>([]),
    [rank, setRank] = useState<LeaderboardRow[]>([]),
    [stats, setStats] = useState<Statistics | null>(null),
    [history, setHistory] = useState<Page<MobileSession>>({
      Items: [],
      HasMore: false,
      NextOffset: 0,
    }),
    [feed, setFeed] = useState<Page<HighlightFeed>>({
      Items: [],
      HasMore: false,
      NextOffset: 0,
    }),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [screen, setScreen] = useState<
      | "home"
      | "stats"
      | "members"
      | "account"
      | "manage"
      | "detail"
      | "analysis"
      | "completion"
      | "fun"
    >("home"),
    [tab, setTab] = useState<"history" | "highlights">("history"),
    [overlay, setOverlay] = useState<Overlay>(null),
    [detail, setDetail] = useState<MobileSession | null>(null),
    [source, setSource] = useState<MobileSession | undefined>(),
    [editing, setEditing] = useState(false),
    [period, setPeriod] = useState("current-month"),
    [fullRank, setFullRank] = useState<LeaderboardRow[]>([]),
    [member, setMember] = useState<PlayerView | null>(null),
    [viewerEdit, setViewerEdit] = useState<RoomMemberView | null>(null);
  useEffect(() => {
    if (overlay === "create-room") setCreateRates(defaultRateSettings());
  }, [overlay]);
  const group = groups.find((g) => g.Id === groupId),
    provision = useRef<Promise<AccountView> | null>(null),
    memory = useRef(new ScrollMemory()),
    tabsRef = useRef<HTMLDivElement>(null),
    pagerAnchor = useRef<HTMLDivElement>(null),
    gesture = useRef<{ x: number; y: number } | null>(null),
    generation = useRef(0);
  const [analysisTarget, setAnalysisTarget] = useState<{
    playerId: string;
    period: string;
    range: string;
  } | null>(null);
  const [analysis, setAnalysis] = useState<PlayerAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const analysisOrigin = useRef<{
    screen: "home" | "stats";
    scroll: number;
  } | null>(null);
  function openAnalysis(playerId: string) {
    analysisOrigin.current = {
      screen: screen === "stats" ? "stats" : "home",
      scroll: window.scrollY,
    };
    const p = screen === "stats" ? period : homePeriod;
    const range = screen === "stats" ? statsRange : homeRange;
    const target = { playerId, period: p, range };
    window.history.pushState(
      { analysis: target },
      "",
      `/groups/${groupId}/players/${playerId}?${p === "custom" ? range : `period=${p}`}`,
    );
    setAnalysisTarget(target);
    navigate("analysis");
  }
  function openPlayerAchievements(playerId: string, displayName: string) {
    setAchievementTarget(
      playerId === myPlayerId
        ? null
        : { Id: playerId, DisplayName: displayName },
    );
    setFunPage("achievements");
    navigate("fun");
  }
  function backFromAnalysis() {
    if (analysisOrigin.current) window.history.back();
    else {
      window.history.replaceState(null, "", "/");
      setAnalysisTarget(null);
      home();
    }
  }
  useEffect(() => {
    const handleRoute = () => {
      const match = location.pathname.match(
        /^\/groups\/([^/]+)\/players\/([^/]+)$/,
      );
      if (match) {
        const query = new URLSearchParams(location.search);
        setGroupId(match[1]);
        setAnalysisTarget({
          playerId: match[2],
          period: query.has("from")
            ? "custom"
            : query.get("period") || "current-month",
          range: query.has("from")
            ? `from=${query.get("from")}&to=${query.get("to")}`
            : "",
        });
        setScreen("analysis");
        window.scrollTo(0, 0);
      } else if (analysisOrigin.current) {
        pendingScroll.current = analysisOrigin.current.scroll;
        setScreen(analysisOrigin.current.screen);
        setAnalysisTarget(null);
      }
    };
    window.addEventListener("popstate", handleRoute);
    return () => window.removeEventListener("popstate", handleRoute);
  }, []);
  useEffect(() => {
    if (screen !== "analysis" || !analysisTarget || !groupId) return;
    let active = true;
    setAnalysisLoading(true);
    setAnalysis(null);
    const query =
      analysisTarget.period === "custom"
        ? analysisTarget.range
        : `period=${analysisTarget.period}`;
    api<PlayerAnalysis>(
      `/groups/${groupId}/players/${analysisTarget.playerId}/analysis?${query}`,
    )
      .then((data) => {
        if (active) setAnalysis(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setAnalysisLoading(false);
      });
    return () => {
      active = false;
    };
  }, [screen, analysisTarget, groupId]);
  const writable = group?.AccessLevel === "Member";
  const isAdmin = writable && !!group?.IsAdmin;
  const canEditPlayer = (p: PlayerView) =>
    writable &&
    (isAdmin || (!p.IsGuest && !p.IsArchived && p.UserId === user?.Id));
  const myPlayerId = currentPlayerId(players, user?.Id);
  const myPlayer = players.find((p) => p.Id === myPlayerId);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  function resetRanges() {
    setHomePeriod("current-month");
    setHomeRange("");
    setPeriod("current-month");
    setStatsRange("");
  }
  async function work(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function ensureIdentity(name?: string) {
    if (user) return user;
    if (!provision.current)
      provision.current = api<AccountView>("/auth/anonymous", "POST", {
        DisplayName: name?.trim() || "玩家",
      })
        .then((u) => {
          setUser(u);
          return u;
        })
        .finally(() => {
          provision.current = null;
        });
    return provision.current;
  }
  async function refreshGroups() {
    const list = await api<Group[]>("/groups");
    setGroups(list);
    setGroupId((id) => selectRoom(list, id, user ? lastRoom(user.Id) : null));
    return list;
  }
  async function refreshPlayers() {
    if (groupId)
      setPlayers(await api<PlayerView[]>(`/groups/${groupId}/players`));
  }
  async function loadRoom() {
    if (!groupId || inviteCode) return;
    statisticsCache.current = "";
    const current = ++generation.current;
    setLoading(true);
    try {
      const [p, r, s, h, f, ds, members, dr] = await Promise.all([
        api<PlayerView[]>(`/groups/${groupId}/players`),
        api<LeaderboardRow[]>(
          `/groups/${groupId}/leaderboard?${homePeriod === "custom" ? homeRange : `period=${homePeriod}`}`,
        ),
        api<Statistics>(`/groups/${groupId}/statistics`),
        api<Page<MobileSession>>(`/groups/${groupId}/sessions?limit=3`),
        api<Page<HighlightFeed>>(`/groups/${groupId}/highlights?limit=5`),
        api<string[]>(`/groups/${groupId}/session-dates`),
        api<RoomMemberView[]>(`/groups/${groupId}/members`),
        api<DailyReport>(`/groups/${groupId}/daily-report`),
      ]);
      if (current !== generation.current) return;
      setRoster(members);
      setDates(ds);
      setPlayers(p);
      setRank(r);
      setStats(s);
      setHistory(h);
      setFeed(f);
      setDailyReport(dr);
      void api<FunHome>(`/groups/${groupId}/fun`)
        .then((data) => {
          if (current === generation.current) setFunHome(data);
        })
        .catch(() => {
          if (current === generation.current) setFunHome(null);
        });
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<typeof auth>("/auth/config"),
      api<{ hasSession: boolean }>("/auth/session"),
    ])
      .then(async ([a, status]) => {
        const u = status.hasSession ? await api<AccountView>("/me") : null;
        const g = u ? await api<Group[]>("/groups") : [];
        if (!cancelled) {
          setAuth(a);
          setUser(u);
          setGroups(g);
          const route = location.pathname.match(
            /^\/groups\/([^/]+)\/players\/([^/]+)$/,
          );
          const reportGroup = new URLSearchParams(location.search).get("group");
          setGroupId(
            route?.[1] || selectRoom(g, reportGroup, u ? lastRoom(u.Id) : null),
          );
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (user && groups.some((room) => room.Id === groupId))
      rememberRoom(user.Id, groupId);
    setDeletingRoom(null);
  }, [user?.Id, groupId, groups]);
  useEffect(() => {
    memory.current = new ScrollMemory();
    setFunHome(null);
    setDailyReport(null);
    setDailyReportOpen(false);
    setSessionReport(null);
    setActiveAppeal(null);
    setAppealPast(false);
    setActivityPreview([]);
    setAppealBanner(null);
    seenAppealEvents.current.clear();
    setTab("history");
    const route = location.pathname.match(
      /^\/groups\/([^/]+)\/players\/([^/]+)$/,
    );
    if (route && route[1] === groupId) {
      const query = new URLSearchParams(location.search);
      setAnalysisTarget({
        playerId: route[2],
        period: query.has("from")
          ? "custom"
          : query.get("period") || "current-month",
        range: query.has("from")
          ? `from=${query.get("from")}&to=${query.get("to")}`
          : "",
      });
      setScreen("analysis");
    } else setScreen("home");
    window.scrollTo(0, 0);
    void loadRoom();
  }, [groupId, inviteCode]);
  useEffect(() => {
    if (!groupId || !user || inviteCode) return;
    let current = true;
    Promise.all([
      api<AppealSnapshot | null>(`/groups/${groupId}/appeals/active`),
      api<{ Items: FunActivity[] }>(`/groups/${groupId}/fun/activity`),
    ])
      .then(([appeal, activity]) => {
        if (!current) return;
        setActiveAppeal(appeal);
        setActivityPreview(
          activity.Items.filter((a) => a.Type !== "TABLE_APPEAL").slice(0, 2),
        );
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [groupId, user?.Id, inviteCode, socialRevision]);
  useEffect(() => {
    if (!activeAppeal || screen !== "home") {
      setAppealPast(false);
      return;
    }
    const target = document.getElementById("active-appeal");
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setAppealPast(entry.boundingClientRect.bottom <= 0),
      { threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [activeAppeal?.Id, screen]);
  useEffect(() => {
    if (!groupId || !user || inviteCode) return;
    let stopped = false,
      socket: WebSocket | null = null,
      retry: number | null = null,
      attempt = 0;
    const connect = () => {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(
        `${protocol}//${location.host}/api/groups/${encodeURIComponent(groupId)}/realtime`,
      );
      socket.onopen = () => {
        attempt = 0;
        setSocialRevision((n) => n + 1);
      };
      socket.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as AppealEvent;
          if (
            event.version !== 1 ||
            event.groupId !== groupId ||
            seenAppealEvents.current.has(event.eventId)
          )
            return;
          seenAppealEvents.current.add(event.eventId);
          setSocialRevision((n) => n + 1);
          if (event.type === "appeal.finalized") {
            void api<Statistics>(`/groups/${groupId}/statistics`)
              .then((snapshot) => {
                if (!stopped) setStats(snapshot);
              })
              .catch(() => {});
          }
          if (
            (event.type === "appeal.created" &&
              event.payload.actorUserId !== user.Id) ||
            event.type === "appeal.ready"
          ) {
            void api<AppealSnapshot>(
              `/groups/${groupId}/appeals/${event.payload.appealId}`,
            )
              .then((appeal) => {
                if (stopped || appeal.CreatedByUserId === user.Id) return;
                setActiveAppeal(appeal.Status === "ACTIVE" ? appeal : null);
                setAppealBanner({
                  kind: event.type === "appeal.created" ? "created" : "ready",
                  appeal,
                });
              })
              .catch(() => {});
          }
        } catch {
          /* Ignore malformed realtime envelopes. REST remains authoritative. */
        }
      };
      socket.onclose = () => {
        if (stopped) return;
        const delay =
          Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)) +
          Math.floor(Math.random() * 500);
        retry = window.setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      stopped = true;
      if (retry !== null) window.clearTimeout(retry);
      socket?.close();
    };
  }, [groupId, user?.Id, inviteCode]);
  useEffect(() => {
    const foreground = () => {
      if (document.visibilityState === "visible" && groupId && !inviteCode)
        void api<FunHome>(`/groups/${groupId}/fun`)
          .then(setFunHome)
          .catch(() => {});
    };
    document.addEventListener("visibilitychange", foreground);
    return () => document.removeEventListener("visibilitychange", foreground);
  }, [groupId, inviteCode]);
  useEffect(() => {
    if (groupId && !inviteCode)
      void work(async () =>
        setRank(
          await api<LeaderboardRow[]>(
            `/groups/${groupId}/leaderboard?${homePeriod === "custom" ? homeRange : `period=${homePeriod}`}`,
          ),
        ),
      );
  }, [homePeriod, homeRange]);
  const statisticsCache = useRef("");
  useEffect(() => {
    if (!groupId || inviteCode) return;
    let active = true;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void api<DailyReport>(`/groups/${groupId}/daily-report`)
        .then((report) => {
          if (active) setDailyReport(report);
        })
        .catch(() => {});
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [groupId, inviteCode]);
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    if (
      !ready ||
      !groupId ||
      query.get("group") !== groupId ||
      !query.has("report")
    )
      return;
    let active = true;
    if (query.get("report") === "daily") {
      void api<DailyReport>(`/groups/${groupId}/daily-report`)
        .then((report) => {
          if (!active) return;
          setDailyReport(report);
          setReportShowResults(query.get("results") === "show");
          setDailyReportOpen(true);
        })
        .catch((error) => {
          if (active) setError(error.message);
        });
    } else if (query.get("report") === "session" && query.get("session")) {
      void loadSessionReport(query.get("session")!)
        .then((session) => {
          if (active && session.GroupId === groupId) setSessionReport(session);
        })
        .catch((error) => {
          if (active) setError(error.message);
        });
    }
    return () => {
      active = false;
    };
  }, [groupId, ready]);
  useEffect(() => {
    if (screen !== "stats" || !groupId || inviteCode) return;
    const query = period === "custom" ? statsRange : `period=${period}`;
    const cacheKey = `${groupId}?${query}`;
    if (statisticsCache.current === cacheKey) return;
    let active = true;
    setStatsLoading(true);
    Promise.all([
      api<LeaderboardRow[]>(`/groups/${groupId}/leaderboard?${query}`),
      api<Statistics>(`/groups/${groupId}/statistics?${query}`),
    ])
      .then(([r, s]) => {
        if (active) {
          statisticsCache.current = cacheKey;
          setFullRank(r);
          setFilteredStats(s);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setStatsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [screen, period, statsRange, groupId, inviteCode]);
  function navigate(next: typeof screen) {
    memory.current.save(tab, window.scrollY);
    setScreen(next);
    window.scrollTo(0, 0);
  }
  function home() {
    pendingScroll.current = memory.current.restore(tab, 0);
    setScreen("home");
  }
  function switchTab(next: typeof tab) {
    if (next === tab) return;
    memory.current.save(tab, window.scrollY);
    const sticky = pagerAnchor.current
      ? pagerAnchor.current.getBoundingClientRect().top + window.scrollY
      : 0;
    const position = memory.current.restore(
      next,
      Math.min(window.scrollY, sticky),
    );
    if (releaseFrame.current !== null)
      cancelAnimationFrame(releaseFrame.current);
    if (pagerRef.current)
      pagerRef.current.style.minHeight = `${pagerGuardHeight(pagerRef.current.getBoundingClientRect().height, position, sticky, window.innerHeight)}px`;
    pendingScroll.current = position;
    setTab(next);
  }
  useLayoutEffect(() => {
    if (pendingScroll.current !== null) {
      window.scrollTo(0, pendingScroll.current);
      releaseFrame.current = requestAnimationFrame(() => {
        if (pagerRef.current) pagerRef.current.style.minHeight = "";
        releaseFrame.current = null;
      });
      pendingScroll.current = null;
    }
  }, [tab, screen]);
  async function openSession(id: string) {
    await work(async () => {
      setDetail(await api<MobileSession>(`/sessions/${id}`));
      navigate("detail");
    });
  }
  async function openSessionReport(session: MobileSession) {
    await work(async () =>
      setSessionReport(await loadSessionReport(session.Id)),
    );
  }
  async function loadSessionReport(id: string) {
    const [session, fun] = await Promise.all([
      api<MobileSession>(`/sessions/${encodeURIComponent(id)}`),
      api<
        Awaited<
          ReturnType<
            import("../application/fun-engine").FunEngineService["completion"]
          >
        >
      >(`/groups/${groupId}/fun/sessions/${encodeURIComponent(id)}`).catch(
        () => null,
      ),
    ]);
    if (fun) {
      session.SessionTags = {};
      for (const { PlayerId, Tag } of fun.SessionTags) {
        (session.SessionTags[PlayerId] ||= []).push(Tag);
      }
    }
    return session;
  }
  async function openDailyReport() {
    await work(async () => {
      setDailyReport(await api<DailyReport>(`/groups/${groupId}/daily-report`));
      setReportShowResults(false);
      setDailyReportOpen(true);
    });
  }
  function startSession(s?: MobileSession, edit = false) {
    if (!writable) return;
    setSource(s);
    setEditing(edit);
    setOverlay("session");
    setError("");
  }
  function goToAppeal() {
    setAppealPast(false);
    setScreen("home");
    window.setTimeout(() => {
      document
        .getElementById("active-appeal")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }
  async function startAppeal(source: MobileSession) {
    if (!writable || !source.IsSettled) return;
    if (activeAppeal) {
      goToAppeal();
      return;
    }
    await work(async () => {
      try {
        const appeal = await api<AppealSnapshot>(
          `/groups/${groupId}/appeals`,
          "POST",
          { SourceSessionId: source.Id },
        );
        setActiveAppeal(appeal);
        setSocialRevision((n) => n + 1);
        goToAppeal();
      } catch (error) {
        const existing = await api<AppealSnapshot | null>(
          `/groups/${groupId}/appeals/active`,
        );
        if (!existing) throw error;
        setActiveAppeal(existing);
        goToAppeal();
      }
    });
  }
  async function reactAppeal(reaction: AppealReaction) {
    if (!activeAppeal) return;
    await work(async () => {
      const appeal = await api<AppealSnapshot>(
        `/groups/${groupId}/appeals/${activeAppeal.Id}/reaction`,
        "PUT",
        { Reaction: reaction },
      );
      setActiveAppeal(appeal);
      setAppealBanner(null);
      setSocialRevision((n) => n + 1);
    });
  }
  const avatar = (id: string, fallback?: string | null) =>
    players.find((p) => p.Id === id)?.AvatarImageUrl || fallback;
  if (!ready)
    return (
      <main className="app-shell">
        <BrandLoading />
      </main>
    );
  return (
    <main
      className={`app-shell${activeAppeal && screen === "home" ? " has-appeal-shortcut" : ""}${screen === "completion" ? " settlement-compact-shell" : ""}`}
    >
      {inviteCode ? (
        <InviteLanding
          code={inviteCode}
          busy={busy}
          onBack={() => {
            setInviteCode("");
            historyReplace();
          }}
          onJoin={async (code, name, mode) => {
            setBusy(true);
            try {
              await ensureIdentity(name);
              const g = await api<Group>(
                `/invites/${code}/${mode === "member" ? "join" : "view"}`,
                "POST",
                mode === "member" ? { DisplayName: name } : {},
              );
              await refreshGroups();
              resetRanges();
              setGroupId(g.Id);
              setInviteCode("");
              setScreen("home");
              historyReplace();
              if (mode === "claim" && g.AccessLevel === "Viewer")
                setOverlay("claim");
              else if (mode === "claim")
                setNotice("你已經是這個麻吉局的牌咖。");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : !group && screen === "account" && user ? (
        <>
          <header className="app-header">
            <div className="page-title">
              <button
                className="icon-button"
                aria-label="回到首頁"
                onClick={home}
              >
                <Icon name="back" />
              </button>
              <BrandMark size="compact" className="app-header-brand" />
              <h1>我的帳號</h1>
            </div>
          </header>
          <AccountPanel
            user={user}
            groupId={null}
            groupName={null}
            playerId={null}
            google={auth.google}
            busy={busy}
            work={work}
            onUser={setUser}
            onAvatar={async () => setUser(await api<AccountView>("/me"))}
            onRepresentativeChange={async () => {}}
            onLogout={async () => {
              await api("/auth/logout", "POST", {});
              setUser(null);
              setScreen("home");
            }}
          />
        </>
      ) : !group ? (
        <BrandLanding
          showMenu={!!user}
          showRecovery={!user && auth.google}
          onMenu={() => setOverlay("drawer")}
          onCreate={() => {
            setError("");
            setOverlay("create-room");
          }}
          onJoin={() => {
            setError("");
            setOverlay("join-room");
          }}
        />
      ) : (
        <>
          <header className="app-header">
            {screen === "home" ? (
              <>
                <BrandMark className="app-header-brand" />
                <button
                  className="room-title"
                  onClick={() => setOverlay("switch")}
                >
                  <span className="eyebrow">麻吉局</span>
                  <strong>{group.Name}</strong>
                  <span className="room-chevron">⌄</span>
                </button>
              </>
            ) : (
              <div className="page-title">
                <button
                  className="icon-button"
                  aria-label="回到麻吉局首頁"
                  onClick={
                    screen === "analysis"
                      ? backFromAnalysis
                      : screen === "detail" && analysisTarget
                        ? () => navigate("analysis")
                        : home
                  }
                >
                  <Icon name="back" />
                </button>
                <BrandMark size="compact" className="app-header-brand" />
                <h1>
                  {
                    {
                      analysis: "牌咖分析",
                      stats: "K.O.榜與統計",
                      members: "牌咖",
                      account: "我的帳號",
                      manage: "麻吉局管理",
                      detail: "完整紀錄",
                      completion: "結算完成",
                      fun: "牌桌娛樂",
                    }[screen]
                  }
                </h1>
              </div>
            )}
            {group && writable && (
              <button
                className="icon-button"
                aria-label="邀請牌咖加入"
                onClick={() => setOverlay("invite")}
              >
                <Icon name="qr" />
              </button>
            )}
            <button
              className="icon-button"
              aria-label="開啟選單"
              onClick={() => setOverlay("drawer")}
            >
              <Icon name="menu" />
            </button>
          </header>
          {screen === "home" &&
            (loading ? (
              <Skeleton />
            ) : (
              <>
                {funHome && (
                  <section className="room-overview" aria-label="麻吉局概況">
                    {(
                      [
                        ["局數", funHome.GroupProgress.Sessions, "局"],
                        ["將數", funHome.GroupProgress.Hands, "將"],
                        ["牌咖", funHome.GroupProgress.Players, "人"],
                      ] as const
                    ).map(([label, value, unit]) => (
                      <div key={label}>
                        <strong>
                          {value}
                          <small>{unit}</small>
                        </strong>
                        <span>{label}</span>
                      </div>
                    ))}
                  </section>
                )}
                <DailyReportAction
                  report={dailyReport}
                  onClick={() => void openDailyReport()}
                />
                <section className="ranking-section">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">A LITTLE FRIENDLY COMPETITION</p>
                      <h1>
                        {homePeriod === "custom"
                          ? "K.O.榜"
                          : `${periodLabel(homePeriod, homeRange)} K.O.榜`}
                      </h1>
                      <RangePicker
                        dates={dates}
                        value={periodLabel(homePeriod, homeRange)}
                        onApply={(p, f, t) => {
                          setHomePeriod(p);
                          setHomeRange(f && t ? `from=${f}&to=${t}` : "");
                        }}
                      />
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("stats")}
                    >
                      全部 <Icon name="chevron" size={16} />
                    </button>
                  </div>
                  {rank.length ? (
                    <>
                      <div
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (
                            e.target === e.currentTarget &&
                            (e.key === "Enter" || e.key === " ")
                          ) {
                            e.preventDefault();
                            openAnalysis(rank[0].PlayerId);
                          }
                        }}
                        className="rank-hero ranking-action"
                        aria-label={`查看 ${rank[0].DisplayName} 個人分析`}
                        onClick={() => openAnalysis(rank[0].PlayerId)}
                      >
                        <span className="crown">
                          <Icon name="crown" size={26} />
                        </span>
                        <div className="hero-avatar">
                          <Avatar
                            name={rank[0].DisplayName}
                            url={avatar(
                              rank[0].PlayerId,
                              rank[0].AvatarImageUrl,
                            )}
                            size={76}
                          />
                          <span className="rank-one">1</span>
                        </div>
                        <h2 className="ranking-name">
                          {rank[0].DisplayName}
                          <RepresentativeAchievementBadge
                            achievement={
                              funHome?.RepresentativeAchievements[
                                rank[0].PlayerId
                              ]
                            }
                          />
                        </h2>
                        <TitleBadges
                          titles={
                            funHome?.Players.find(
                              (p) => p.PlayerId === rank[0].PlayerId,
                            )?.Titles || []
                          }
                        />
                        <Amount
                          className="hero-amount"
                          value={rank[0].NetAmount}
                        />
                        <ChampionQuote
                          text={
                            funHome?.ChampionQuotes[rank[0].PlayerId] ||
                            "今晚的贏家，明天的傳說。"
                          }
                        />
                      </div>
                      <ol className="compact-ranking" start={2}>
                        {rank.slice(1).map((p, i) => (
                          <li key={p.PlayerId}>
                            <div
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (
                                  e.target === e.currentTarget &&
                                  (e.key === "Enter" || e.key === " ")
                                ) {
                                  e.preventDefault();
                                  openAnalysis(p.PlayerId);
                                }
                              }}
                              className="ranking-action"
                              aria-label={`查看 ${p.DisplayName} 個人分析`}
                              onClick={() => openAnalysis(p.PlayerId)}
                            >
                              <span className={`rank-number rank-${i + 2}`}>
                                {i + 2}
                              </span>
                              <Avatar
                                name={p.DisplayName}
                                url={avatar(p.PlayerId, p.AvatarImageUrl)}
                                size={36}
                              />
                              <span className="fun-ranking-name">
                                <span className="ranking-name">
                                  <b>{p.DisplayName}</b>
                                  <RepresentativeAchievementBadge
                                    achievement={
                                      funHome?.RepresentativeAchievements[
                                        p.PlayerId
                                      ]
                                    }
                                  />
                                </span>
                                <TitleBadges
                                  titles={
                                    funHome?.Players.find(
                                      (f) => f.PlayerId === p.PlayerId,
                                    )?.Titles || []
                                  }
                                />
                              </span>
                              <Amount value={p.NetAmount} />
                            </div>
                          </li>
                        ))}
                      </ol>
                    </>
                  ) : (
                    <KOBoardEmptyState
                      lifetimeSettledSessions={funHome?.GroupProgress.Sessions}
                    />
                  )}
                </section>
                <HomeActivitySection
                  appeal={activeAppeal}
                  activities={activityPreview}
                  stats={stats}
                  busy={busy}
                  onReact={reactAppeal}
                  onViewAll={() => {
                    setFunPage("activity");
                    navigate("fun");
                  }}
                  onStats={() => navigate("stats")}
                />{" "}
                <div ref={pagerAnchor} aria-hidden="true" />
                <div
                  ref={tabsRef}
                  className="sticky-tabs"
                  data-mode={tab}
                  role="tablist"
                  aria-label="麻吉局紀錄"
                >
                  <button
                    role="tab"
                    id="history-tab"
                    aria-controls="history-panel"
                    aria-selected={tab === "history"}
                    onClick={() => switchTab("history")}
                    className={tab === "history" ? "active" : ""}
                  >
                    對戰紀錄
                  </button>
                  <button
                    role="tab"
                    id="highlights-tab"
                    aria-controls="highlights-panel"
                    aria-selected={tab === "highlights"}
                    onClick={() => switchTab("highlights")}
                    className={tab === "highlights" ? "active" : ""}
                  >
                    精華
                  </button>
                  <i
                    style={{
                      transform: `translateX(${tab === "history" ? 0 : 100}%)`,
                    }}
                  />
                </div>
                <section
                  className="pager-content"
                  ref={pagerRef}
                  role="tabpanel"
                  id={`${tab === "history" ? "history" : "highlights"}-panel`}
                  aria-labelledby={`${tab === "history" ? "history" : "highlights"}-tab`}
                  tabIndex={0}
                  onPointerDown={(e) => {
                    if (
                      e.pointerType !== "mouse" ||
                      (e.target as HTMLElement).closest(
                        "input,textarea,select,button,a",
                      )
                    )
                      return;
                    gesture.current = { x: e.clientX, y: e.clientY };
                  }}
                  onPointerUp={(e) => {
                    if (e.pointerType !== "mouse" || !gesture.current) return;
                    const direction = swipeDirection(
                      e.clientX - gesture.current.x,
                      e.clientY - gesture.current.y,
                    );
                    gesture.current = null;
                    if (direction) switchTab(direction);
                  }}
                  onPointerCancel={() => {
                    gesture.current = null;
                  }}
                  onTouchStart={(e) => {
                    if (
                      (e.target as HTMLElement).closest(
                        "input,textarea,select,button,a",
                      )
                    )
                      return;
                    const p = e.touches[0];
                    gesture.current = { x: p.clientX, y: p.clientY };
                  }}
                  onTouchEnd={(e) => {
                    if (!gesture.current) return;
                    const p = e.changedTouches[0],
                      direction = swipeDirection(
                        p.clientX - gesture.current.x,
                        p.clientY - gesture.current.y,
                      );
                    gesture.current = null;
                    if (direction) switchTab(direction);
                  }}
                  onTouchCancel={() => {
                    gesture.current = null;
                  }}
                >
                  <div hidden={tab !== "history"}>
                    {writable && (
                      <HistoryActionToolbar
                        mode="history"
                        onAction={() => startSession()}
                      />
                    )}
                    {history.Items.length ? (
                      history.Items.map((s, i) => (
                        <React.Fragment key={s.Id}>
                          {(i === 0 ||
                            history.Items[i - 1].RecordDate !==
                              s.RecordDate) && (
                            <h3 className="date-heading">
                              {s.RecordDate ===
                              new Date().toLocaleDateString("en-CA", {
                                timeZone: "Asia/Taipei",
                              })
                                ? "今天 · "
                                : ""}
                              {dateLabel(s.RecordDate)}
                            </h3>
                          )}
                          <SessionCard
                            session={s}
                            writable={writable}
                            currentPlayerId={myPlayerId}
                            onEdit={() => startSession(s, true)}
                            onAppeal={() => void startAppeal(s)}
                            onShare={() => void openSessionReport(s)}
                            avatar={avatar}
                          />
                        </React.Fragment>
                      ))
                    ) : (
                      <BrandedEmptyState
                        title="還沒有對戰紀錄"
                        note="第一場誰要先破產？"
                      />
                    )}{" "}
                    {history.HasMore && (
                      <button
                        className="load-more secondary full"
                        disabled={busy}
                        onClick={() =>
                          void work(async () => {
                            const page = await api<Page<MobileSession>>(
                              `/groups/${group.Id}/sessions?limit=5&offset=${history.NextOffset}`,
                            );
                            setHistory((v) => ({
                              ...page,
                              Items: [
                                ...v.Items,
                                ...page.Items.filter(
                                  (s) => !v.Items.some((o) => o.Id === s.Id),
                                ),
                              ],
                            }));
                          })
                        }
                      >
                        {busy ? "載入中…" : "查看更多紀錄"}
                      </button>
                    )}
                  </div>
                  <div hidden={tab !== "highlights"}>
                    {writable && (
                      <HistoryActionToolbar
                        mode="highlights"
                        onAction={() => {
                          setSource(undefined);
                          setOverlay("highlight");
                        }}
                      />
                    )}
                    {feed.Items.length ? (
                      feed.Items.map((h) => (
                        <article className="highlight-card" key={h.Id}>
                          <header>
                            <Avatar
                              name={h.CreatorName}
                              url={h.CreatorAvatar}
                              size={34}
                            />
                            <div>
                              <b>{h.CreatorName}</b>
                              <small>{relative(h.CreatedAt)}</small>
                            </div>
                            {user && (
                              <HighlightManagement
                                highlight={h}
                                group={group}
                                userId={user.Id}
                                players={players}
                                onChanged={() => void loadRoom()}
                              />
                            )}
                          </header>
                          <div className="highlight-copy">
                            {h.Title && <h3>{h.Title}</h3>}
                            <div className="highlight-context">
                              <span>{dateLabel(h.RecordDate)}</span>
                              {h.SessionId && (
                                <button
                                  className="text-button"
                                  onClick={() => void openSession(h.SessionId!)}
                                >
                                  {h.SessionName}{" "}
                                  <Icon name="chevron" size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                          {h.ImageUrl && /^\/images\//.test(h.ImageUrl) && (
                            <img
                              className="feed-photo"
                              draggable={false}
                              src={h.ImageUrl}
                              alt={h.Title || "牌桌精華"}
                              loading="lazy"
                            />
                          )}
                          {(h.PlayerName || h.Amount !== null || h.Note) && (
                            <div className="highlight-bottom">
                              {(h.PlayerName || h.Amount !== null) && (
                                <div className="highlight-subject">
                                  {h.PlayerName && (
                                    <>
                                      <Avatar
                                        name={h.PlayerName}
                                        url={h.PlayerAvatar}
                                        size={28}
                                      />
                                      <b>
                                        {h.PlayerName}
                                        {!!h.PlayerIsArchived && (
                                          <span className="left-badge">
                                            已離開
                                          </span>
                                        )}
                                      </b>
                                    </>
                                  )}
                                  {h.Amount !== null && (
                                    <Amount value={h.Amount} />
                                  )}
                                </div>
                              )}
                              {h.Note && <p>{h.Note}</p>}
                            </div>
                          )}
                          {user && (
                            <HighlightActions
                              key={`${group.Id}:${user.Id}:${h.Id}`}
                              highlight={h}
                              group={group}
                              userId={user.Id}
                              players={players}
                              onChanged={() => void loadRoom()}
                            />
                          )}
                        </article>
                      ))
                    ) : (
                      <BrandedEmptyState
                        title="還沒有精華"
                        note="下次有人自摸大的記得拍照 😏"
                      />
                    )}
                    {feed.HasMore && (
                      <button
                        className="secondary full load-more"
                        disabled={busy}
                        onClick={() =>
                          void work(async () => {
                            const page = await api<Page<HighlightFeed>>(
                              `/groups/${group.Id}/highlights?limit=5&offset=${feed.NextOffset}`,
                            );
                            setFeed((v) => ({
                              ...page,
                              Items: [
                                ...v.Items,
                                ...page.Items.filter(
                                  (h) => !v.Items.some((o) => o.Id === h.Id),
                                ),
                              ],
                            }));
                          })
                        }
                      >
                        查看更多精華
                      </button>
                    )}
                  </div>
                </section>
                {funHome?.DailyPhilosophyPool && (
                  <DailyPhilosophySection
                    key={`${groupId}:${funHome.LocalDate}`}
                    quotes={funHome.DailyPhilosophyPool}
                  />
                )}
                {activeAppeal && (
                  <AppealChip
                    expiresAt={activeAppeal.ExpiresAt}
                    onClick={goToAppeal}
                    visible={appealPast}
                  />
                )}
              </>
            ))}
          {screen === "analysis" &&
            (analysisLoading ? (
              <Skeleton />
            ) : analysis && analysisTarget ? (
              <PlayerFunProvider
                key={`${groupId}:${analysis.Player.PlayerId}`}
                groupId={groupId}
                playerId={analysis.Player.PlayerId}
              >
                <PlayerAnalysisPage
                  data={analysis}
                  dates={dates}
                  label={periodLabel(
                    analysisTarget.period,
                    analysisTarget.range,
                  )}
                  isMe={analysis.Player.PlayerId === myPlayerId}
                  onPeriod={(p, f, t) => {
                    const target = {
                      ...analysisTarget,
                      period: p,
                      range: f && t ? `from=${f}&to=${t}` : "",
                    };
                    window.history.replaceState(
                      { analysis: target },
                      "",
                      `/groups/${groupId}/players/${target.playerId}?${p === "custom" ? target.range : `period=${p}`}`,
                    );
                    setAnalysisTarget(target);
                  }}
                  onSession={openSession}
                  onPersonalize={
                    analysis.Player.PlayerId === myPlayerId
                      ? () => {
                          navigate("account");
                          window.setTimeout(
                            () =>
                              document
                                .getElementById("account-personalization")
                                ?.scrollIntoView({ block: "start" }),
                            0,
                          );
                        }
                      : undefined
                  }
                  funRepresentative={
                    <PlayerFunSection
                      representativeOnly
                      groupId={groupId}
                      playerId={analysis.Player.PlayerId}
                      playerName={analysis.Player.DisplayName}
                      onFun={() => {
                        openPlayerAchievements(
                          analysis.Player.PlayerId,
                          analysis.Player.DisplayName,
                        );
                      }}
                    />
                  }
                  funSeniority={
                    <PlayerFunSection
                      seniorityOnly
                      groupId={groupId}
                      playerId={analysis.Player.PlayerId}
                      onFun={() => {}}
                    />
                  }
                  funMotto={
                    <PlayerFunSection
                      mottoOnly
                      groupId={groupId}
                      playerId={analysis.Player.PlayerId}
                      onFun={() => {}}
                    />
                  }
                  funTitle={
                    <PlayerFunSection
                      titleOnly
                      groupId={groupId}
                      playerId={analysis.Player.PlayerId}
                      onFun={() => {}}
                    />
                  }
                  funSection={
                    <PlayerFunSection
                      groupId={groupId}
                      playerId={analysis.Player.PlayerId}
                      playerName={analysis.Player.DisplayName}
                      onFun={() => {
                        openPlayerAchievements(
                          analysis.Player.PlayerId,
                          analysis.Player.DisplayName,
                        );
                      }}
                    />
                  }
                  funInsights={
                    <PlayerFunSection
                      insightsOnly
                      groupId={groupId}
                      playerId={analysis.Player.PlayerId}
                      onFun={() => {
                        openPlayerAchievements(
                          analysis.Player.PlayerId,
                          analysis.Player.DisplayName,
                        );
                      }}
                    />
                  }
                />
              </PlayerFunProvider>
            ) : null)}
          {screen === "stats" && (
            <section className="page-content">
              <RangePicker
                dates={dates}
                value={periodLabel(period, statsRange)}
                onApply={(p, f, t) => {
                  setPeriod(p);
                  setStatsRange(f && t ? `from=${f}&to=${t}` : "");
                }}
              />
              {statsLoading ? (
                <Skeleton />
              ) : (
                <>
                  {fullRank.length ? (
                    <ol className="compact-ranking full-ranking">
                      {fullRank.map((p, i) => (
                        <li key={p.PlayerId}>
                          <button
                            className="ranking-action"
                            aria-label={`查看 ${p.DisplayName} 個人分析`}
                            onClick={() => openAnalysis(p.PlayerId)}
                          >
                            <span className="rank-number">{i + 1}</span>
                            <Avatar
                              name={p.DisplayName}
                              url={avatar(p.PlayerId, p.AvatarImageUrl)}
                            />
                            <div>
                              <span className="ranking-name">
                                <b>{p.DisplayName}</b>
                                <RepresentativeAchievementBadge
                                  achievement={
                                    funHome?.RepresentativeAchievements[
                                      p.PlayerId
                                    ]
                                  }
                                />
                              </span>
                              <small>{p.SessionsPlayed} 場</small>
                            </div>
                            <Amount value={p.NetAmount} />
                          </button>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <Empty
                      title="這段時間還沒開桌"
                      note="完成一場結算，K.O.榜就會更新。"
                    />
                  )}
                  <h2 className="subheading">
                    個人統計 <small>{periodLabel(period, statsRange)}</small>
                  </h2>
                  {filteredStats?.Players.map((p) => (
                    <details className="stat-player" key={p.PlayerId}>
                      <summary>
                        <Avatar
                          name={p.DisplayName}
                          url={avatar(p.PlayerId, p.AvatarImageUrl)}
                        />
                        <span className="ranking-name">
                          <b>{p.DisplayName}</b>
                          <RepresentativeAchievementBadge
                            achievement={
                              funHome?.RepresentativeAchievements[p.PlayerId]
                            }
                          />
                        </span>
                        <span>
                          {p.Wins} 勝 / {p.Sessions} 場
                        </span>
                        <Icon name="chevron" size={16} />
                      </summary>
                      <div className="stat-grid">
                        {[
                          ["總損益", <Amount value={p.Total} />],
                          ["本月損益", <Amount value={p.MonthTotal} />],
                          ["勝率", `${Math.round(p.WinRate * 100)}%`],
                          [
                            "勝 / 敗 / 平",
                            `${p.Wins} / ${p.Losses} / ${p.Draws}`,
                          ],
                          ["目前連勝", `${p.CurrentStreak} 場`],
                          ["最長連勝", `${p.LongestStreak} 場`],
                          ["最長連敗", `${p.LongestLossStreak} 場`],
                          ["最佳單場", <Amount value={p.Best} />],
                          ["最差單場", <Amount value={p.Worst} />],
                          ["平均每場", <Amount value={p.Average} />],
                        ].map(([label, value], i) => (
                          <div key={i}>
                            <small>{label}</small>
                            <strong>{value}</strong>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </>
              )}
            </section>
          )}
          {screen === "fun" && group && (
            <EntertainmentPage
              key={`${groupId}:${funPage}:${achievementTarget?.Id || "self"}`}
              initialPage={funPage}
              onPageChange={setFunPage}
              groupId={groupId}
              myPlayerId={myPlayerId || null}
              achievementTarget={achievementTarget}
              onAchievementTargetChange={setAchievementTarget}
              players={players.map((p) => ({
                Id: p.Id,
                DisplayName: p.DisplayName,
              }))}
              canSetMotto={writable}
              home={funHome}
              onRead={() =>
                setFunHome((f) => (f ? { ...f, UnreadCount: 0 } : f))
              }
              onPlayer={openAnalysis}
              activeAppeal={activeAppeal}
              onReactAppeal={reactAppeal}
              onAppealSource={(id) => void openSession(id)}
              socialRevision={socialRevision}
            />
          )}
          {screen === "members" && (
            <section className="page-content">
              <div className="section-heading">
                <div>
                  <h2>今晚的牌咖</h2>
                  <p className="muted">
                    {players.length} 位牌咖 · 已認領牌咖的名稱與帳號同步
                  </p>
                </div>
              </div>
              {(["管理員", "牌咖", "旁觀者", "未認領牌咖"] as const).map(
                (section) => {
                  const people =
                    section === "未認領牌咖"
                      ? players
                          .filter((p) => p.IsGuest && !p.UserId)
                          .map((p) => ({
                            key: p.Id,
                            name: p.DisplayName,
                            player: p,
                            userId: null,
                            role: section,
                          }))
                      : roster
                          .filter((m) =>
                            section === "旁觀者"
                              ? m.AccessLevel === "Viewer"
                              : m.AccessLevel === "Member" &&
                                !!m.IsAdmin === (section === "管理員"),
                          )
                          .map((m) => ({
                            key: m.UserId,
                            name: m.DisplayName,
                            player: players.find((p) => p.Id === m.PlayerId),
                            userId: m.UserId,
                            role: section,
                          }));
                  return (
                    <section className="roster-section" key={section}>
                      <h3>
                        {section}{" "}
                        <small className="muted">{people.length}</small>
                      </h3>
                      {!people.length && (
                        <p className="muted">目前沒有{section}</p>
                      )}
                      <div className="member-list">
                        {people.map((person) => {
                          const p = person.player,
                            editable = p ? canEditPlayer(p) : isAdmin;
                          return (
                            <button
                              className="member-row"
                              disabled={!editable}
                              key={person.key}
                              onClick={() => {
                                setError("");
                                if (p) setMember(p);
                                else if (person.userId)
                                  setViewerEdit(
                                    roster.find(
                                      (m) => m.UserId === person.userId,
                                    ) || null,
                                  );
                              }}
                            >
                              <Avatar
                                name={person.name}
                                url={p?.AvatarImageUrl}
                                size={48}
                              />
                              <div>
                                <span className="ranking-name">
                                  <b>{person.name}</b>
                                  <RepresentativeAchievementBadge
                                    achievement={
                                      p
                                        ? funHome?.RepresentativeAchievements[
                                            p.Id
                                          ]
                                        : null
                                    }
                                  />
                                </span>
                                <small>
                                  {p
                                    ? writable
                                      ? playerIdentity(p)
                                      : p.IsGuest
                                        ? "未認領牌咖"
                                        : "牌咖"
                                    : "旁觀者"}
                                </small>
                              </div>
                              {editable && <Icon name="chevron" size={18} />}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                },
              )}
              {writable && (
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const name = String(new FormData(form).get("name"));
                    void work(async () => {
                      await api(`/groups/${group.Id}/players`, "POST", {
                        DisplayName: name,
                      });
                      await refreshPlayers();
                      form.reset();
                    });
                  }}
                >
                  <input
                    aria-label="新增牌咖暱稱"
                    name="name"
                    placeholder="朋友的暱稱"
                    required
                  />
                  <button className="secondary" disabled={busy}>
                    ＋ 新增牌咖
                  </button>
                </form>
              )}
            </section>
          )}
          {screen === "account" && user && (
            <AccountPanel
              user={user}
              groupName={group?.Name || null}
              groupId={group?.Id || null}
              playerId={myPlayer?.Id || null}
              google={auth.google}
              busy={busy}
              work={work}
              onUser={async (updated) => {
                setUser(updated);
                await loadRoom();
              }}
              onAvatar={async () => {
                setUser(await api<AccountView>("/me"));
                await refreshPlayers();
                await loadRoom();
              }}
              onRepresentativeChange={async () => {
                setFunHome(await api<FunHome>(`/groups/${groupId}/fun`));
              }}
              onLogout={async () => {
                await api("/auth/logout", "POST", {});
                setUser(null);
                setGroups([]);
                setGroupId("");
                setScreen("home");
              }}
            />
          )}
          {screen === "manage" && isAdmin && (
            <section className="page-content">
              <BrandIllustration
                size="small"
                className="room-management-brand"
              />
              <h2>你的牌桌，你來命名。</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = String(
                    new FormData(e.currentTarget).get("name"),
                  );
                  void work(async () => {
                    await api(`/groups/${group.Id}`, "PATCH", { Name: name });
                    await refreshGroups();
                    setNotice("麻吉局名稱已更新");
                  });
                }}
              >
                <label>
                  麻吉局名稱
                  <input name="name" defaultValue={group.Name} required />
                </label>
                <button className="primary full" disabled={busy}>
                  儲存名稱
                </button>
              </form>
              <ManageRatePresets
                key={`${group.Id}:${JSON.stringify(group.RatePresets)}`}
                rates={group.RatePresets}
                disabled={busy}
                onSave={(settings) =>
                  work(async () => {
                    await api(
                      `/groups/${group.Id}/rate-presets`,
                      "PUT",
                      settings,
                    );
                    await refreshGroups();
                    setNotice("常用底台已更新");
                  })
                }
              />
              <h3 className="subheading">邀請朋友</h3>
              <p className="muted">朋友確認加入後，就能一起記錄牌局。</p>
              <div className="invite-link">
                {location.origin}/join/{group.InviteCode}
              </div>
              <button
                className="secondary full"
                onClick={() =>
                  void work(async () => {
                    await navigator.clipboard.writeText(
                      `${location.origin}/join/${group.InviteCode}`,
                    );
                    setNotice("邀請連結已複製");
                  })
                }
              >
                <Icon name="link" size={18} />
                複製邀請連結
              </button>
              <h3 className="subheading">刪除麻吉局</h3>
              <p className="muted room-deletion-warning">
                刪除後，這桌的所有紀錄都會永久移除，無法復原。
              </p>
              <button
                className="destructive full"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setDeletingRoom({ Id: group.Id, Name: group.Name });
                }}
              >
                刪除麻吉局
              </button>
            </section>
          )}
          {(screen === "detail" || screen === "completion") && detail && (
            <section
              className={`page-content detail-page${screen === "completion" ? " settlement-complete-page" : ""}`}
            >
              {screen === "completion" ? (
                <CompletionBrandHero
                  sessionName={detail.Name}
                  recordDate={detail.RecordDate.replaceAll("-", "/")}
                  sessionMeta={[
                    typeNames[detail.MahjongType],
                    `${detail.RateMajor}/${detail.RateMinor}`,
                    detail.HandCount !== null ? `${detail.HandCount} 將` : null,
                    `${detail.Results.length} 人`,
                  ]
                    .filter(Boolean)
                    .join("・")}
                />
              ) : (
                <div className="detail-title">
                  <h2>{detail.Name}</h2>
                  <p>{detail.RecordDate.replaceAll("-", "/")}</p>
                  <div className="session-meta">
                    {typeNames[detail.MahjongType]} · {detail.RateMajor}/
                    {detail.RateMinor}
                    {detail.HandCount !== null && (
                      <> · {detail.HandCount} 將</>
                    )}{" "}
                    · {detail.Results.length} 人
                  </div>
                </div>
              )}
              {!detail.IsSettled && (
                <p className="muted">這一場還沒完成結算。</p>
              )}
              {screen === "completion" && detail.IsSettled && (
                <CompletionFun groupId={groupId} sessionId={detail.Id} />
              )}
              <ResultList
                results={detail.Results}
                avatar={avatar}
                currentPlayerId={myPlayerId}
                compact={screen === "completion"}
              />
              <div
                className={`detail-actions${screen === "completion" ? " settlement-actions" : ""}`}
              >
                {writable && (
                  <>
                    <button
                      className="primary full"
                      onClick={() => {
                        setSource(detail);
                        setOverlay("highlight");
                      }}
                    >
                      <Icon name="photo" size={19} />
                      新增精華
                    </button>
                    {detail.IsSettled && (
                      <button
                        className="secondary full"
                        onClick={() => void openSessionReport(detail)}
                      >
                        分享本局戰報
                      </button>
                    )}
                    <button
                      className="appeal-button secondary full"
                      onClick={() => void startAppeal(detail)}
                    >
                      我要上訴 <Icon name="chevron" size={18} />
                    </button>
                    {screen === "detail" && (
                      <button
                        className="text-button full"
                        onClick={() => startSession(detail, true)}
                      >
                        {detail.IsSettled ? "編輯紀錄" : "完成結算"}
                      </button>
                    )}
                  </>
                )}
                <button className="text-button full" onClick={home}>
                  回到首頁
                </button>
              </div>
            </section>
          )}
        </>
      )}
      {appealBanner && (
        <aside className="appeal-banner" role="status">
          <button
            className="appeal-banner-close"
            aria-label="關閉上訴通知"
            onClick={() => setAppealBanner(null)}
          >
            ×
          </button>
          <strong>
            {appealBanner.kind === "ready"
              ? "🀄 人到齊了"
              : `⚖️ ${appealBanner.appeal.CreatedByDisplayName}不服`}
          </strong>
          <p>
            {appealBanner.kind === "ready"
              ? "這桌看來還沒結束。"
              : "兩小時內看看有沒有人想再開一桌。"}
          </p>
          {appealBanner.kind === "created" && appealBanner.appeal.CanReact && (
            <div className="appeal-banner-actions">
              {(
                [
                  ["SUPPORT", "我也不服"],
                  ["REJECT", "駁回"],
                  ["WATCH", "看戲"],
                ] as const
              ).map(([reaction, label]) => (
                <button
                  key={reaction}
                  disabled={busy}
                  onClick={() => void reactAppeal(reaction)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </aside>
      )}
      {error && (
        <div className="toast error" role="alert">
          {error}
          <button aria-label="關閉錯誤" onClick={() => setError("")}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button aria-label="關閉提示" onClick={() => setNotice("")}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {overlay === "drawer" && (
        <Modal title="牌桌選單" drawer onClose={() => setOverlay(null)}>
          <div className="drawer-brand">
            <BrandWordmark />
          </div>
          <div className="drawer-room">
            <div>
              <b>{group?.Name || "這桌"}</b>
              <small>GOOD TIMES WITH FRIENDS</small>
            </div>
          </div>
          {group && !writable && (
            <div className="viewer-note">
              <p className="muted">
                目前身份：旁觀者。可以看麻吉局紀錄，但不能修改。
              </p>
              <button
                className="primary full"
                onClick={() => setOverlay("become")}
              >
                成為牌咖
              </button>
            </div>
          )}
          <p className="menu-label">麻吉局</p>
          {group && (
            <>
              {isAdmin && (
                <MenuButton
                  icon="home"
                  label="麻吉局管理"
                  action={() => {
                    setOverlay(null);
                    navigate("manage");
                  }}
                />
              )}
              <MenuButton
                icon="users"
                label="牌咖"
                action={() => {
                  setOverlay(null);
                  navigate("members");
                }}
              />
            </>
          )}
          <MenuButton
            icon="plus"
            label="開一桌"
            action={() => setOverlay("create-room")}
          />
          <MenuButton
            icon="link"
            label="加入麻吉局"
            action={() => setOverlay("join-room")}
          />
          {groups.length > 1 && (
            <MenuButton
              icon="home"
              label="切換麻吉局"
              action={() => setOverlay("switch")}
            />
          )}
          {group && (
            <EntertainmentNavigation
              active={screen === "fun" ? funPage : undefined}
              unread={funHome?.UnreadCount}
              onNavigate={(page) => {
                setFunPage(page);
                if (page === "achievements") setAchievementTarget(null);
                setOverlay(null);
                navigate("fun");
              }}
            />
          )}
          <p className="menu-label">工具</p>
          <a className="ting-tool-link" href={TING_PATH}>
            🀄 聽牌計算機
          </a>
          <p className="menu-label">帳號</p>
          <SiteAdminMenuEntry userId={user?.Id} />
          <a className="ting-tool-link" href="/privacy">
            隱私與資料使用
          </a>
          {user && (
            <MenuButton
              icon="users"
              label="我的帳號"
              action={() => {
                setOverlay(null);
                navigate("account");
              }}
            />
          )}
          <p className="drawer-foot">牌桌上的輸贏，朋友間的回憶。</p>
        </Modal>
      )}
      {(overlay === "become" || overlay === "claim") && group && (
        <BecomePlayer
          groupId={group.Id}
          initialMode={overlay === "claim" ? "claim" : undefined}
          onClose={() => setOverlay(null)}
          onDone={async () => {
            await refreshGroups();
            await loadRoom();
            setOverlay(null);
            setNotice("你已經是這個麻吉局的牌咖！");
          }}
        />
      )}
      {overlay === "switch" && (
        <Modal title="切換麻吉局" onClose={() => setOverlay(null)}>
          {groups.map((g) => (
            <button
              className="room-option"
              key={g.Id}
              onClick={() => {
                resetRanges();
                setGroupId(g.Id);
                setOverlay(null);
                setScreen("home");
              }}
            >
              <BrandMark />
              <b>{g.Name}</b>
              {g.Id === groupId ? (
                <Icon name="check" />
              ) : (
                <Icon name="chevron" />
              )}
            </button>
          ))}
          <button
            className="secondary full"
            onClick={() => setOverlay("create-room")}
          >
            ＋ 開一桌
          </button>
        </Modal>
      )}
      {overlay === "invite" && writable && group?.InviteCode && (
        <InviteSheet
          name={group.Name}
          code={group.InviteCode}
          onClose={() => setOverlay(null)}
        />
      )}
      {(overlay === "create-room" || overlay === "join-room") && (
        <Modal
          title={overlay === "create-room" ? "開一桌" : "加入麻吉局"}
          onClose={() => {
            setOverlay(null);
            setError("");
          }}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void work(async () => {
                let code = "";
                if (overlay === "join-room") {
                  code =
                    String(data.get("invite") || "")
                      .trim()
                      .split("/")
                      .pop() || "";
                  if (!/^[a-f0-9]{64}$/.test(code))
                    throw Error("請貼上完整邀請連結或有效邀請碼。");
                }
                if (overlay === "join-room") {
                  setInviteCode(code);
                  setOverlay(null);
                  return;
                }
                await ensureIdentity(String(data.get("nickname") || "玩家"));
                const g =
                  overlay === "create-room"
                    ? await api<Group>("/groups", "POST", {
                        Name: data.get("name"),
                        ...createRates,
                      })
                    : await api<Group>(`/invites/${code}/join`, "POST", {});
                await refreshGroups();
                resetRanges();
                setGroupId(g.Id);
                setScreen("home");
                setOverlay(null);
                historyReplace();
              });
            }}
          >
            <fieldset disabled={busy}>
              {!user && overlay === "create-room" && (
                <label>
                  你的暱稱 <span className="muted">可略過</span>
                  <input name="nickname" placeholder="朋友怎麼稱呼你？" />
                </label>
              )}
              {overlay === "create-room" ? (
                <>
                  <p className="muted">
                    給這張牌桌一個名字，今晚的紀錄就從這裡開始。
                  </p>
                  <label>
                    麻吉局名稱
                    <input
                      name="name"
                      placeholder="例如：今晚誰先破產"
                      required
                      autoFocus
                    />
                  </label>
                  <RatePresetEditor
                    value={createRates}
                    onChange={setCreateRates}
                  />
                </>
              ) : (
                <>
                  <p className="muted">
                    貼上朋友的邀請連結。確認加入後，才能看到麻吉局紀錄。
                  </p>
                  <label>
                    邀請連結或邀請碼
                    <input
                      name="invite"
                      placeholder="貼上朋友的邀請連結"
                      defaultValue={
                        location.pathname.match(
                          /^\/join\/([a-f0-9]{64})$/,
                        )?.[1] || ""
                      }
                      required
                    />
                  </label>
                </>
              )}
              <button className="primary full">
                {busy
                  ? "處理中…"
                  : overlay === "create-room"
                    ? "開一桌"
                    : "確認加入麻吉局"}
              </button>
              <p className="small muted">不需要 Google 帳號。</p>
            </fieldset>
          </form>
        </Modal>
      )}
      {overlay === "session" && writable && group && (
        <Modal
          title={editing ? "編輯牌局" : "新增牌局"}
          onClose={() => setOverlay(null)}
        >
          <SessionWizard
            group={group}
            players={players}
            source={source}
            editing={editing}
            onPlayers={refreshPlayers}
            onDelete={async () => {
              await confirmedDelete(
                true,
                source!.Id,
                async (id) => {
                  await api(`/sessions/${id}`, "DELETE");
                },
                async () => {
                  setDetail(null);
                  setOverlay(null);
                  setScreen("home");
                  memory.current = new ScrollMemory();
                  window.scrollTo(0, 0);
                  await loadRoom();
                },
              );
              setNotice("牌局已刪除");
            }}
            onDone={(s) => {
              setDetail(s);
              setOverlay(null);
              navigate("completion");
              void loadRoom();
            }}
          />
        </Modal>
      )}
      {overlay === "highlight" && writable && group && (
        <Modal title="新增精華" onClose={() => setOverlay(null)}>
          <HighlightForm
            group={group}
            players={players}
            source={source}
            onDone={() => {
              setOverlay(null);
              setNotice("精華已記下");
              void loadRoom();
            }}
          />
        </Modal>
      )}
      {member && canEditPlayer(member) && group && (
        <Modal title="牌咖資料" onClose={() => setMember(null)}>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="member-edit-avatar">
            <Avatar
              name={member.DisplayName}
              url={member.AvatarImageUrl}
              size={80}
            />
            {!member.UserId && canEditPlayer(member) && (
              <label className="upload-button">
                更換頭貼
                <input
                  disabled={busy}
                  type="file"
                  accept="image/*"
                  aria-label="更換頭貼"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file)
                      void work(async () => {
                        const image = await uploadProcessedImage(
                          file,
                          "Avatar",
                          `/api/groups/${group.Id}/images`,
                        );
                        try {
                          await api(`/players/${member.Id}/avatar`, "PATCH", {
                            AvatarImageUrl: image.ImageUrl,
                          });
                        } catch (e) {
                          await api(`/media/${image.Id}`, "DELETE");
                          throw e;
                        }
                        await loadRoom();
                        setMember({
                          ...member,
                          AvatarImageUrl: image.ImageUrl,
                        });
                      });
                  }}
                />
              </label>
            )}
            <small>{playerIdentity(member)}</small>
          </div>
          {member.UserId && (
            <p className="muted">
              官方牌咖的頭貼由帳號本人管理；管理員可修改暱稱。
            </p>
          )}
          {member.UserId === user?.Id && (
            <button
              className="secondary full"
              onClick={() => {
                setMember(null);
                navigate("account");
              }}
            >
              前往我的帳號調整個人資料
            </button>
          )}
          {(!member.UserId || isAdmin) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = String(new FormData(e.currentTarget).get("name"));
                void work(async () => {
                  await api(`/players/${member.Id}`, "PATCH", {
                    DisplayName: name,
                  });
                  if (member.UserId === user?.Id)
                    setUser(await api<AccountView>("/me"));
                  await loadRoom();
                  setMember(null);
                });
              }}
            >
              <label>
                顯示名稱
                <input name="name" defaultValue={member.DisplayName} required />
              </label>
              <button className="primary full" disabled={busy}>
                儲存名稱
              </button>
            </form>
          )}
          {isAdmin && member.UserId && (
            <div className="governance-actions">
              <button
                className="secondary full"
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    const admin = roster.find(
                      (m) => m.UserId === member.UserId,
                    )?.IsAdmin;
                    await api(
                      `/groups/${group.Id}/admins${admin ? "/" + member.UserId : ""}`,
                      admin ? "DELETE" : "POST",
                      admin ? undefined : { UserId: member.UserId },
                    );
                    await refreshGroups();
                    await loadRoom();
                    setMember(null);
                  })
                }
              >
                {roster.find((m) => m.UserId === member.UserId)?.IsAdmin
                  ? "取消管理員"
                  : "任命管理員"}
              </button>
              <button
                className="secondary full"
                disabled={busy}
                onClick={() => {
                  setMember(null);
                  setConfirmation({
                    kind: "remove",
                    userId: member.UserId!,
                    name: member.DisplayName,
                  });
                }}
              >
                移除牌咖
              </button>
            </div>
          )}
          {member.UserId === user?.Id && (
            <button
              className="secondary full"
              disabled={busy}
              onClick={() => {
                setMember(null);
                setConfirmation({
                  kind: "unclaim",
                  userId: user.Id,
                  name: member.DisplayName,
                });
              }}
            >
              解除我的牌咖身份
            </button>
          )}
        </Modal>
      )}
      {viewerEdit && group && isAdmin && (
        <Modal title="旁觀者資料" onClose={() => setViewerEdit(null)}>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name"));
              void work(async () => {
                await api(
                  `/groups/${group.Id}/members/${viewerEdit.UserId}/name`,
                  "PATCH",
                  { DisplayName: name },
                );
                await loadRoom();
                if (viewerEdit.UserId === user?.Id)
                  setUser(await api<AccountView>("/me"));
                setViewerEdit(null);
              });
            }}
          >
            <label>
              暱稱
              <input
                name="name"
                defaultValue={viewerEdit.DisplayName}
                required
              />
            </label>
            <button className="primary full" disabled={busy}>
              儲存名稱
            </button>
          </form>
          <button
            className="secondary full"
            disabled={busy}
            onClick={() => {
              setViewerEdit(null);
              setConfirmation({
                kind: "remove",
                userId: viewerEdit.UserId,
                name: viewerEdit.DisplayName,
              });
            }}
          >
            移除旁觀者
          </button>
        </Modal>
      )}
      {confirmation && group && (
        <Modal
          title={
            confirmation.kind === "remove"
              ? `移除「${confirmation.name}」？`
              : "解除我的牌咖身份"
          }
          onClose={() => setConfirmation(null)}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {confirmation.kind === "remove" ? (
            <>
              <p>移除後：</p>
              <ul className="confirmation-list">
                <li>對方將無法再存取這個麻吉局</li>
                <li>不會再出現在目前牌咖與 K.O.榜</li>
                <li>過去牌局紀錄仍會完整保留</li>
                <li>歷史紀錄中會標示為「已離開」</li>
              </ul>
              <p className="muted">此操作不會刪除過去牌局。</p>
            </>
          ) : (
            <>
              <p>
                解除帳號與這位牌咖的連結後，你將成為旁觀者，只能查看麻吉局紀錄。
              </p>
              <p className="muted">
                這位牌咖會保留為未認領牌咖，仍在
                K.O.榜、可參與新牌局，歷史完整保留，也可再次認領。
              </p>
            </>
          )}
          <div className="flow-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              取消
            </button>
            <button
              className="destructive"
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  await api(
                    `/groups/${group.Id}/${confirmation.kind === "remove" ? "members/" + confirmation.userId : "unclaim"}`,
                    confirmation.kind === "remove" ? "DELETE" : "POST",
                    confirmation.kind === "remove" ? undefined : {},
                  );
                  const removedSelf =
                    confirmation.kind === "remove" &&
                    confirmation.userId === user?.Id;
                  setConfirmation(null);
                  await refreshGroups();
                  if (!removedSelf) await loadRoom();
                })
              }
            >
              {confirmation.kind === "remove" ? "移除牌咖" : "解除身份"}
            </button>
          </div>
        </Modal>
      )}
      {deletingRoom && isAdmin && (
        <RoomDeletionDialog
          room={deletingRoom}
          busy={busy}
          error={error}
          onClose={() => setDeletingRoom(null)}
          onDelete={(name) =>
            void work(async () => {
              const target = deletingRoom;
              await api(`/groups/${target.Id}`, "DELETE", {
                ConfirmationName: name,
              });
              setDeletingRoom(null);
              setGroups((rooms) =>
                rooms.filter((room) => room.Id !== target.Id),
              );
              setGroupId(
                selectRoom(groups.filter((room) => room.Id !== target.Id)),
              );
              resetRanges();
              historyReplace();
              setScreen("home");
              setNotice("麻吉局已永久刪除");
              await refreshGroups();
            })
          }
        />
      )}
      {dailyReportOpen && dailyReport && (
        <DailyReportModal
          report={dailyReport}
          groupId={groupId}
          initiallyShowResults={reportShowResults}
          onClose={() => setDailyReportOpen(false)}
        />
      )}
      {sessionReport && group && (
        <SessionReportModal
          session={sessionReport}
          groupName={group.Name}
          onClose={() => setSessionReport(null)}
        />
      )}
    </main>
  );
}
function historyReplace() {
  window.history.replaceState(null, "", "/");
}
function MenuButton({
  icon,
  label,
  action,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  action: () => void;
}) {
  return (
    <button className="menu-button" onClick={action}>
      <Icon name={icon} />
      <span>{label}</span>
      <Icon name="chevron" size={16} />
    </button>
  );
}
function AccountPanel({
  user,
  groupId,
  groupName,
  playerId,
  google,
  busy,
  work,
  onUser,
  onAvatar,
  onRepresentativeChange,
  onLogout,
}: {
  user: AccountView;
  groupId: string | null;
  groupName: string | null;
  playerId: string | null;
  google: boolean;
  busy: boolean;
  work: (fn: () => Promise<void>) => Promise<void>;
  onUser: (u: AccountView) => void | Promise<void>;
  onAvatar: () => Promise<void>;
  onRepresentativeChange: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [mottoOpen, setMottoOpen] = useState(false);
  const [representativeOpen, setRepresentativeOpen] = useState(false);
  const [achievements, setAchievements] = useState<{
    Achievements: {
      Id: string;
      Name: string;
      Icon: string;
      Unlocked: boolean;
      Rarity: string;
      UserDescription: string;
    }[];
    RepresentativeAchievement: {
      Id: string;
      Name: string;
      Icon: string;
    } | null;
  } | null>(null);
  useEffect(() => {
    if (!groupId || !playerId) {
      setAchievements(null);
      return;
    }
    let active = true;
    void api<typeof achievements>(`/groups/${groupId}/fun/players/${playerId}`)
      .then((data) => {
        if (active) setAchievements(data);
      })
      .catch(() => {
        if (active) setAchievements(null);
      });
    return () => {
      active = false;
    };
  }, [groupId, playerId]);
  return (
    <section
      className="page-content account-panel"
      id="account-personalization"
    >
      <h2>個人化</h2>
      <div className="account-avatar">
        <Avatar name={user.DisplayName} url={user.AvatarImageUrl} size={80} />
        <div className="account-avatar-actions">
          <label className="upload-button">
            更換頭貼
            <input
              type="file"
              accept="image/*"
              disabled={busy}
              aria-label="更換頭貼"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file)
                  void work(async () => {
                    await uploadProcessedImage(
                      file,
                      "Avatar",
                      "/api/me/avatar/images",
                    );
                    await onAvatar();
                  });
              }}
            />
          </label>
          {user.AvatarImageUrl && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  await api("/me/avatar", "DELETE");
                  await onAvatar();
                })
              }
            >
              移除頭貼
            </button>
          )}
        </div>
      </div>
      <form
        id="account-name-form"
        key={user.DisplayName}
        onSubmit={(e) => {
          e.preventDefault();
          const name = String(new FormData(e.currentTarget).get("name"));
          void work(async () => {
            await onUser(
              await api<AccountView>("/me", "PATCH", { DisplayName: name }),
            );
          });
        }}
      >
        <label>
          暱稱
          <input name="name" defaultValue={user.DisplayName} required />
        </label>
        <p className="small muted">所有麻吉局都會使用這個名稱。</p>
      </form>
      <div className="account-setting-row">
        <div>
          <b>金句</b>
          <p>
            {user.MottoQuoteId
              ? `「${QUOTE_CATALOG.find((q) => q.Id === user.MottoQuoteId)?.Text || ""}」`
              : "尚未選擇"}
          </p>
        </div>
        <button className="secondary" onClick={() => setMottoOpen(true)}>
          {user.MottoQuoteId ? "更換" : "選擇金句"}
        </button>
      </div>
      {mottoOpen && (
        <MottoPicker
          currentId={user.MottoQuoteId || null}
          onClose={() => setMottoOpen(false)}
          onSelect={async (quote) => {
            await api("/me/motto", "PATCH", { QuoteId: quote.Id });
            await onUser(await api<AccountView>("/me"));
          }}
        />
      )}
      {groupId && playerId && (
        <div className="account-setting-row">
          <div>
            <b>代表成就</b>
            <small>{groupName}</small>
            <p>
              {achievements?.RepresentativeAchievement
                ? `${achievements.RepresentativeAchievement.Icon} ${achievements.RepresentativeAchievement.Name}`
                : "尚未選擇"}
            </p>
          </div>
          <button
            className="secondary"
            onClick={() => setRepresentativeOpen(true)}
          >
            {achievements?.RepresentativeAchievement ? "更換" : "選擇代表成就"}
          </button>
        </div>
      )}
      {representativeOpen && groupId && playerId && (
        <Modal
          title="選擇代表成就"
          onClose={() => setRepresentativeOpen(false)}
        >
          <div className="representative-picker">
            {achievements?.Achievements.filter((a) => a.Unlocked).map((a) => (
              <button
                key={a.Id}
                className={`secondary representative-option${achievements.RepresentativeAchievement?.Id === a.Id ? " selected" : ""}`}
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    await api(
                      `/groups/${groupId}/fun/players/${playerId}/representative`,
                      "PATCH",
                      { AchievementId: a.Id },
                    );
                    setAchievements(
                      await api<typeof achievements>(
                        `/groups/${groupId}/fun/players/${playerId}`,
                      ),
                    );
                    await onRepresentativeChange();
                    setRepresentativeOpen(false);
                  })
                }
              >
                <span className="representative-option-heading">
                  <strong>
                    {a.Icon} {a.Name}
                  </strong>
                  <small>{rarityText(a.Rarity)}</small>
                </span>
                <span className="representative-option-description">
                  {a.UserDescription}
                </span>
              </button>
            ))}
            {!achievements?.Achievements.some((a) => a.Unlocked) && (
              <p className="muted">還沒有可選的成就。</p>
            )}
          </div>
        </Modal>
      )}
      <button className="primary full" form="account-name-form" disabled={busy}>
        儲存個人資料
      </button>
      <h2>帳號與復原</h2>
      {user.Email && (
        <div className="account-setting-row">
          <div>
            <b>Email</b>
            <p>{user.Email}</p>
          </div>
        </div>
      )}
      <div className="account-link">
        <Icon name="link" />
        <div>
          <b>Google 帳號</b>
          {user.AccountState === "google-linked" ? (
            <>
              <span className="positive">已連結</span>
              <small>{user.Email}</small>
            </>
          ) : google ? (
            <>
              <span>尚未連結</span>
              <small>連結後換手機也能找回紀錄。</small>
              <a className="secondary" href="/api/auth/google">
                連結 Google
              </a>
            </>
          ) : (
            <small>尚未開放</small>
          )}
        </div>
      </div>
      <h2>裝置身份</h2>
      <p className="small muted">
        未連結 Google
        時，清除瀏覽器資料或此裝置身份後，將無法找回此身份。麻吉局紀錄仍會保留。
      </p>
      <button
        className="text-button full negative"
        disabled={busy}
        onClick={() => void work(onLogout)}
      >
        清除此裝置身份
      </button>
    </section>
  );
}
// The public utility never mounts App's account/group loading effects.
createRoot(document.getElementById("root")!).render(
  /^\/admin(?:\/|$)/.test(location.pathname) ? (
    <SiteAdminApp />
  ) : location.pathname === "/privacy" ? (
    <PrivacyPage />
  ) : isTingRoute(location.pathname) ? (
    <PublicTingPage />
  ) : (
    <App />
  ),
);
