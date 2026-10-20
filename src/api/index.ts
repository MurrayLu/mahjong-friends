import { Hono } from "hono";
import adminRouter, { siteAdminAccess } from "./site-admin";
import {
  SiteAdminQueries,
  recordSiteActivity,
} from "../application/site-admin";
import { HighlightSocialService } from "../application/highlight-social";
import {
  TableAppealService,
  type AppealReaction,
} from "../application/table-appeal";
import {
  GroupRealtime,
  type AppealEvent,
  type AppealEventType,
} from "./group-realtime";
import { LedgerService } from "../application/service";
import { MobileQueries } from "../application/mobile-queries";
import {
  FunEngineService,
  FunEngineBackfillService,
} from "../application/fun-engine";
import { TITLES } from "../fun/catalog";
import { deriveSessionTags } from "../fun/session-tags";
import { DomainError, ensure } from "../domain/rules";
import type {
  HighlightInput,
  ResultInput,
  SessionInput,
  SessionUpdate,
} from "../domain/model";
import { Repository } from "../persistence/repository";
import { KvImageStorage } from "../storage/images";
import { MediaService } from "../application/media";
import { isQuotaError, storageError } from "../storage/errors";
import { imageByteLimit, type ImagePurpose } from "../storage/validation";
import { accountView } from "../domain/model";
import {
  authenticate,
  devLogin,
  googleCallback,
  googleStart,
  logout,
  anonymousSession,
  sessionStatus,
  type AppEnv,
} from "./auth";
const app = new Hono<AppEnv>();
export { GroupRealtime };
const realtime = (env: AppEnv["Bindings"], groupId: string) =>
  env.GROUP_REALTIME.get(env.GROUP_REALTIME.idFromName(groupId));
async function realtimeCall(
  env: AppEnv["Bindings"],
  groupId: string,
  action: string,
  body: unknown,
) {
  try {
    const response = await realtime(env, groupId).fetch(
      new Request(`https://group-realtime.internal/${action}`, {
        method: "POST",
        headers: { "X-Group-Id": groupId, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    if (!response.ok)
      throw new Error(`Realtime ${action} returned ${response.status}`);
  } catch (error) {
    console.error("Realtime coordination failed", String(error));
  }
}
async function broadcast(
  env: AppEnv["Bindings"],
  groupId: string,
  type: AppealEventType,
  appealId: string,
  actorUserId?: string,
) {
  const event: AppealEvent = {
    version: 1,
    eventId: crypto.randomUUID(),
    groupId,
    type,
    occurredAt: new Date().toISOString(),
    payload: { appealId, actorUserId },
  };
  await realtimeCall(env, groupId, "broadcast", event);
}
app.onError((error, c) => {
  if (isQuotaError(error))
    return c.json({ error: "FREE_TIER_LIMIT_REACHED" }, 503);
  if (error instanceof DomainError)
    return c.json({ error: error.code, ...error.details }, error.status as 400);
  if (error instanceof SyntaxError)
    return c.json({ error: "InvalidJson" }, 400);
  console.error(
    JSON.stringify({
      requestId: crypto.randomUUID(),
      operation: c.req.method + " " + c.req.path,
      errorCategory: "InternalServerError",
    }),
  );
  return c.json({ error: "InternalServerError" }, 500);
});
app.use("*", async (c, next) => {
  c.set("service", new LedgerService(new Repository(c.env.DB)));
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    ensure(origin === c.env.APP_ORIGIN, "InvalidOrigin", 403);
  }
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  if (!c.res.headers.has("Cache-Control"))
    c.header("Cache-Control", "no-store");
});
app.get("/api/health", (c) => c.json({ ok: true }));
app.get("/api/public/stats", async (c) => {
  // Short shared cache only for these two anonymous aggregate counts.
  c.header("Cache-Control", "public, max-age=300");
  try {
    return c.json(
      await new SiteAdminQueries(new Repository(c.env.DB)).publicStats(),
    );
  } catch (error) {
    c.header("Cache-Control", "no-store");
    throw error;
  }
});
app.route("/api/admin", adminRouter);
app.get("/api/auth/config", (c) =>
  c.json({
    google: !!(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
    dev:
      c.env.DEV_AUTH === "true" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(new URL(c.req.url).hostname),
  }),
);
app.get("/api/auth/google", googleStart);
app.get("/api/auth/session", sessionStatus);
app.post("/api/auth/anonymous", anonymousSession);
app.get("/api/auth/google/callback", googleCallback);
app.post("/api/auth/dev", devLogin);
app.post("/api/auth/logout", logout);
app.get("/api/invites/:code", async (c) =>
  c.json(
    await new MobileQueries(c.get("service")).invitePreview(
      c.req.param("code"),
    ),
  ),
);
app.use("/api/*", async (c, next) => {
  c.set("userId", await authenticate(c));
  await next();
});
app.get("/api/admin-access", async (c) =>
  c.json({ Allowed: await siteAdminAccess(c) }),
);
app.use("/api/*", async (c, next) => {
  await next();
  if (
    c.res.ok &&
    (c.req.path === "/api/me" ||
      (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
        /^\/api\/(groups|sessions|players|highlights)\//.test(c.req.path)))
  ) {
    try {
      await recordSiteActivity(new Repository(c.env.DB), c.get("userId"));
    } catch {
      console.error("Site activity observation unavailable");
    }
  }
});
app.use("/api/*", async (c, next) => {
  if (
    ["POST", "PATCH", "PUT"].includes(c.req.method) &&
    !c.req.path.endsWith("/images")
  ) {
    const body = await c.req.json();
    ensure(
      body && typeof body === "object" && !Array.isArray(body),
      "InvalidRequestBody",
    );
  }
  await next();
});
app.use("/images/*", async (c, next) => {
  c.set("userId", await authenticate(c));
  await next();
});
// Fun failures cannot turn a committed ledger mutation into a retryable failure.
app.use("/api/*", async (c, next) => {
  if (
    !["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method) ||
    c.req.path.includes("/fun") ||
    c.req.path.includes("/quotes/") ||
    c.req.path.endsWith("/rate-presets") ||
    /\/highlights\/[^/]+\/(social|comments)(\/|$)/.test(c.req.path)
  )
    return next();
  const ledger = c.get("service"),
    engine = new FunEngineService(ledger),
    user = c.get("userId");
  let groupId: string | null = null;
  let initialized = false;
  const group = c.req.path.match(/^\/api\/groups\/([^/]+)/);
  const scoped = c.req.path.match(
    /^\/api\/(sessions|players|highlights|media)\/([^/]+)/,
  );
  try {
    if (group) groupId = group[1];
    else if (scoped) {
      const table = {
        sessions: "Session",
        players: "Player",
        highlights: "Highlight",
        media: "MediaImage",
      }[scoped[1]]!;
      const sql =
        table === "Session" || table === "Highlight"
          ? `SELECT d.GroupId FROM ${table} s JOIN DayRecord d ON d.Id=s.DayRecordId WHERE s.Id=?`
          : `SELECT GroupId FROM ${table} WHERE Id=?`;
      groupId =
        (await ledger.repo.one<{ GroupId: string }>(sql, scoped[2]))?.GroupId ||
        null;
    }
    if (groupId)
      initialized = await engine.prepareMutation(
        user,
        groupId,
        c.req.path.endsWith("/settlement"),
      );
  } catch {
    console.error("FunEngine: pre-mutation projection unavailable");
  }
  await next();
  if (groupId && c.res.ok) {
    try {
      let highlightId: string | undefined;
      if (c.req.method === "POST" && c.req.path.endsWith("/highlights"))
        highlightId = ((await c.res.clone().json()) as { Id?: string }).Id;
      if (c.req.path.endsWith("/settlement")) {
        await engine.mutation(user, groupId);
        const body = (await c.res.clone().json()) as { Id: string };
        const source = engine.latestSource!;
        c.res = c.json({
          ...body,
          SessionTags: deriveSessionTags(source.Sessions)[body.Id] || {},
        });
      } else if (initialized) await engine.dirty(groupId);
      else await engine.mutation(user, groupId, highlightId);
    } catch {
      console.error("FunEngine: ledger saved; projection rebuild pending");
      try {
        await engine.dirty(groupId);
      } catch {
        /* next query detects source signature */
      }
    }
  }
});
app.get("/api/groups/:id/fun", async (c) =>
  c.json(
    await new FunEngineService(c.get("service")).home(
      c.get("userId"),
      c.req.param("id"),
    ),
  ),
);
app.get("/api/groups/:id/fun/players/:playerId", async (c) =>
  c.json(
    await new FunEngineService(c.get("service")).player(
      c.get("userId"),
      c.req.param("id"),
      c.req.param("playerId"),
    ),
  ),
);
app.get("/api/groups/:id/fun/group-achievements", async (c) => {
  const f = new FunEngineService(c.get("service"));
  const projection = await f.ensure(c.get("userId"), c.req.param("id"));
  return c.json({
    Items: await f.achievements(c.req.param("id"), null),
    Progress: projection.GroupProgress,
  });
});
app.get("/api/groups/:id/fun/titles", async (c) => {
  const f = new FunEngineService(c.get("service"));
  await f.ensure(c.get("userId"), c.req.param("id"));
  return c.json(TITLES);
});
app.get("/api/groups/:id/fun/activity", async (c) =>
  c.json(
    await new FunEngineService(c.get("service")).activities(
      c.get("userId"),
      c.req.param("id"),
      Number(c.req.query("offset") || 0),
    ),
  ),
);
app.post("/api/groups/:id/fun/activity/seen", async (c) =>
  c.json(
    await new FunEngineService(c.get("service")).seen(
      c.get("userId"),
      c.req.param("id"),
    ),
  ),
);
app.post("/api/groups/:id/fun/rebuild", async (c) =>
  c.json(
    await new FunEngineBackfillService(
      new FunEngineService(c.get("service")),
    ).rebuild(c.get("userId"), c.req.param("id")),
  ),
);
app.patch("/api/groups/:id/fun/players/:playerId/motto", async (c) =>
  c.json(
    await new FunEngineService(c.get("service")).motto(
      c.get("userId"),
      c.req.param("id"),
      c.req.param("playerId"),
      (await c.req.json()).QuoteId,
    ),
  ),
);
app.patch("/api/me/motto", async (c) =>
  c.json(
    await new FunEngineService(c.get("service")).setAccountMotto(
      c.get("userId"),
      (await c.req.json()).QuoteId,
    ),
  ),
);
app.patch("/api/groups/:id/fun/players/:playerId/representative", async (c) =>
  c.json(
    await new FunEngineService(c.get("service")).representative(
      c.get("userId"),
      c.req.param("id"),
      c.req.param("playerId"),
      (await c.req.json()).AchievementId,
    ),
  ),
);
app.get("/api/groups/:id/fun/sessions/:sessionId", async (c) =>
  c.json(
    await new FunEngineService(c.get("service")).completion(
      c.get("userId"),
      c.req.param("id"),
      c.req.param("sessionId"),
    ),
  ),
);
app.get("/api/quotes/library", async (c) =>
  c.json(await new FunEngineService(c.get("service")).library(c.get("userId"))),
);
app.put("/api/quotes/:id/favorite", async (c) => {
  const body = await c.req.json();
  ensure(typeof body.Favorite === "boolean", "InvalidFavorite");
  return c.json(
    await new FunEngineService(c.get("service")).favorite(
      c.get("userId"),
      c.req.param("id"),
      body.Favorite,
    ),
  );
});
app.get("/api/me", async (c) =>
  c.json(accountView(await c.get("service").user(c.get("userId")))),
);
app.patch("/api/me", async (c) =>
  c.json(
    accountView(
      await c
        .get("service")
        .updateUser(c.get("userId"), (await c.req.json()).DisplayName),
    ),
  ),
);
app.get("/api/groups", async (c) =>
  c.json(await c.get("service").groups(c.get("userId"))),
);
app.post("/api/groups", async (c) => {
  const body = await c.req.json();
  const settings =
    body.SelectedRates === undefined && body.CustomRates === undefined
      ? undefined
      : { SelectedRates: body.SelectedRates, CustomRates: body.CustomRates };
  return c.json(
    await c.get("service").createGroup(c.get("userId"), body.Name, settings),
    201,
  );
});
app.put("/api/groups/:id/rate-presets", async (c) =>
  c.json(
    await c
      .get("service")
      .updateRatePresets(
        c.get("userId"),
        c.req.param("id"),
        await c.req.json(),
      ),
  ),
);
app.patch("/api/groups/:id", async (c) =>
  c.json(
    await c
      .get("service")
      .updateGroup(
        c.get("userId"),
        c.req.param("id"),
        (await c.req.json()).Name,
      ),
  ),
);
app.delete("/api/groups/:id", async (c) => {
  const body = await c.req.json().catch(() => null);
  ensure(
    body && typeof body.ConfirmationName === "string",
    "RoomDeletionNameMismatch",
    409,
  );
  await media(c).deleteGroup(
    c.get("userId"),
    c.req.param("id"),
    body.ConfirmationName,
  );
  return c.json({ ok: true });
});
app.post("/api/invites/:code/join", async (c) =>
  c.json(
    await c
      .get("service")
      .join(
        c.get("userId"),
        c.req.param("code"),
        (await c.req.json()).DisplayName,
      ),
  ),
);
app.post("/api/invites/:code/view", async (c) =>
  c.json(
    await c.get("service").viewInvite(c.get("userId"), c.req.param("code")),
  ),
);
app.post("/api/groups/:id/join", async (c) =>
  c.json(
    await c
      .get("service")
      .becomeMember(
        c.get("userId"),
        c.req.param("id"),
        (await c.req.json()).DisplayName,
      ),
  ),
);
app.get("/api/groups/:id/claimable-players", async (c) =>
  c.json(
    await c.get("service").claimablePlayers(c.get("userId"), c.req.param("id")),
  ),
);
app.post("/api/groups/:id/claim-player", async (c) =>
  c.json(
    await c
      .get("service")
      .claimGuest(
        c.get("userId"),
        c.req.param("id"),
        (await c.req.json()).PlayerId,
      ),
  ),
);
app.get("/api/groups/:id/members", async (c) =>
  c.json(
    await c.get("service").roomMembers(c.get("userId"), c.req.param("id")),
  ),
);
app.patch("/api/groups/:id/members/:userId/name", async (c) =>
  c.json(
    await c
      .get("service")
      .renameMember(
        c.get("userId"),
        c.req.param("id"),
        c.req.param("userId"),
        (await c.req.json()).DisplayName,
      ),
  ),
);
app.post("/api/groups/:id/admins", async (c) => {
  await c
    .get("service")
    .appointAdmin(
      c.get("userId"),
      c.req.param("id"),
      (await c.req.json()).UserId,
    );
  return c.json({ ok: true });
});
app.delete("/api/groups/:id/admins/:userId", async (c) => {
  await c
    .get("service")
    .demoteAdmin(c.get("userId"), c.req.param("id"), c.req.param("userId"));
  return c.json({ ok: true });
});
app.delete("/api/groups/:id/members/:userId", async (c) => {
  await c
    .get("service")
    .removeMember(c.get("userId"), c.req.param("id"), c.req.param("userId"));
  await realtimeCall(c.env, c.req.param("id"), "revoke", {
    userId: c.req.param("userId"),
  });
  return c.json({ ok: true });
});
app.get("/api/groups/:id/appeals/active", async (c) =>
  c.json(
    await new TableAppealService(c.get("service")).active(
      c.get("userId"),
      c.req.param("id"),
    ),
  ),
);
app.get("/api/groups/:id/appeals/:appealId", async (c) => {
  const appeal = await new TableAppealService(c.get("service")).get(
    c.get("userId"),
    c.req.param("appealId"),
  );
  ensure(appeal.GroupId === c.req.param("id"), "AppealNotFound", 404);
  return c.json(appeal);
});
app.post("/api/groups/:id/appeals", async (c) => {
  const groupId = c.req.param("id"),
    userId = c.get("userId");
  const appeal = await new TableAppealService(c.get("service")).create(
    userId,
    groupId,
    (await c.req.json()).SourceSessionId,
  );
  await realtimeCall(c.env, groupId, "schedule", {
    appealId: appeal.Id,
    expiresAt: appeal.ExpiresAt,
  });
  await broadcast(c.env, groupId, "appeal.created", appeal.Id, userId);
  return c.json(appeal, 201);
});
app.put("/api/groups/:id/appeals/:appealId/reaction", async (c) => {
  const groupId = c.req.param("id"),
    userId = c.get("userId"),
    id = c.req.param("appealId");
  const service = new TableAppealService(c.get("service"));
  const current = await service.get(userId, id);
  ensure(current.GroupId === groupId, "AppealNotFound", 404);
  const result = await service.react(
    userId,
    id,
    (await c.req.json()).Reaction as AppealReaction,
  );
  if (result.Changed)
    await broadcast(c.env, groupId, "appeal.reaction.changed", id, userId);
  if (result.ReadyChanged)
    await broadcast(c.env, groupId, "appeal.ready", id, userId);
  return c.json(result.Appeal);
});
app.get("/api/groups/:id/realtime", async (c) => {
  ensure(c.req.header("Origin") === c.env.APP_ORIGIN, "InvalidOrigin", 403);
  ensure(
    c.req.header("Upgrade")?.toLowerCase() === "websocket",
    "WebSocketUpgradeRequired",
    426,
  );
  const groupId = c.req.param("id"),
    userId = c.get("userId");
  await c.get("service").requireRoomRead(userId, groupId);
  return realtime(c.env, groupId).fetch(
    new Request("https://group-realtime.internal/connect", {
      headers: {
        "X-Group-Id": groupId,
        "X-User-Id": userId,
        Upgrade: "websocket",
      },
    }),
  );
});
app.post("/api/groups/:id/unclaim", async (c) => {
  await c.get("service").selfUnclaim(c.get("userId"), c.req.param("id"));
  return c.json({ ok: true });
});
app.get("/api/groups/:id/players", async (c) => {
  const players = await c
    .get("service")
    .players(c.get("userId"), c.req.param("id"));
  const avatars = await c
    .get("service")
    .repo.many<{ OwnerUserId: string; Id: string }>(
      "SELECT m.OwnerUserId,m.Id FROM MediaImage m JOIN Player p ON p.UserId=m.OwnerUserId WHERE p.GroupId=? AND m.Purpose='Avatar' AND m.GroupId IS NULL AND m.DeletedAt IS NULL",
      c.req.param("id"),
    );
  return c.json(
    players.map((p) => ({
      ...p,
      AvatarImageUrl:
        p.AvatarImageUrl ||
        (avatars.find((a) => a.OwnerUserId === p.UserId)
          ? `/images/${p.GroupId}/${avatars.find((a) => a.OwnerUserId === p.UserId)!.Id}`
          : null),
    })),
  );
});
app.post("/api/groups/:id/players", async (c) =>
  c.json(
    await c
      .get("service")
      .createGuest(
        c.get("userId"),
        c.req.param("id"),
        (await c.req.json()).DisplayName,
      ),
    201,
  ),
);
app.patch("/api/players/:id", async (c) =>
  c.json(
    await c
      .get("service")
      .updatePlayer(
        c.get("userId"),
        c.req.param("id"),
        (await c.req.json()).DisplayName,
      ),
  ),
);
app.post("/api/groups/:id/sessions", async (c) => {
  const body = await c.req.json<
      SessionInput & { AppealOfSessionId?: string }
    >(),
    ledger = c.get("service"),
    user = c.get("userId"),
    group = c.req.param("id");
  ensure(body.AppealOfSessionId === undefined, "LegacyAppealRetired", 409);
  const session = await ledger.createSession(user, group, body);
  return c.json(session, 201);
});
app.patch("/api/players/:id/avatar", async (c) => {
  return c.json(
    await c
      .get("service")
      .updatePlayerAvatar(
        c.get("userId"),
        c.req.param("id"),
        (await c.req.json()).AvatarImageUrl,
      ),
  );
});
app.get("/api/sessions/:id", async (c) =>
  c.json(await c.get("service").getSession(c.get("userId"), c.req.param("id"))),
);
app.patch("/api/sessions/:id", async (c) =>
  c.json(
    await c
      .get("service")
      .updateSession(
        c.get("userId"),
        c.req.param("id"),
        await c.req.json<SessionUpdate>(),
      ),
  ),
);
app.delete("/api/sessions/:id", async (c) => {
  await c.get("service").deleteSession(c.get("userId"), c.req.param("id"));
  return c.json({ ok: true });
});
app.put("/api/sessions/:id/settlement", async (c) =>
  c.json(
    await c
      .get("service")
      .settle(
        c.get("userId"),
        c.req.param("id"),
        (await c.req.json<{ Results: ResultInput[] }>()).Results,
      ),
  ),
);
app.get("/api/groups/:id/days", async (c) =>
  c.json(await c.get("service").days(c.get("userId"), c.req.param("id"))),
);
app.get("/api/groups/:id/days/:date", async (c) =>
  c.json(
    await c
      .get("service")
      .day(c.get("userId"), c.req.param("id"), c.req.param("date")),
  ),
);
app.get("/api/groups/:id/leaderboard", async (c) => {
  const service = c.get("service"),
    id = c.req.param("id"),
    user = c.get("userId");
  return c.json(
    c.req.query("from") !== undefined || c.req.query("to") !== undefined
      ? await new MobileQueries(service).rangeLeaderboard(
          user,
          id,
          c.req.query("from"),
          c.req.query("to"),
        )
      : await service.leaderboard(
          user,
          id,
          c.req.query("period") || "current-month",
        ),
  );
});
app.get("/api/groups/:id/players/:playerId/analysis", async (c) =>
  c.json(
    await new MobileQueries(c.get("service")).playerAnalysis(
      c.get("userId"),
      c.req.param("id"),
      c.req.param("playerId"),
      c.req.query("period") || "current-month",
      c.req.query("from"),
      c.req.query("to"),
    ),
  ),
);
app.get("/api/groups/:id/session-dates", async (c) =>
  c.json(
    await new MobileQueries(c.get("service")).sessionDates(
      c.get("userId"),
      c.req.param("id"),
    ),
  ),
);
app.get("/api/groups/:id/statistics", async (c) =>
  c.json(
    await new MobileQueries(c.get("service")).statistics(
      c.get("userId"),
      c.req.param("id"),
      c.req.query("period") || "all",
      c.req.query("from"),
      c.req.query("to"),
    ),
  ),
);
app.get("/api/groups/:id/sessions", async (c) =>
  c.json(
    await new MobileQueries(c.get("service")).sessions(
      c.get("userId"),
      c.req.param("id"),
      Number(c.req.query("limit") ?? 3),
      Number(c.req.query("offset") ?? 0),
      c.req.query("date"),
    ),
  ),
);
app.get("/api/groups/:id/daily-report", async (c) =>
  c.json(
    await new MobileQueries(c.get("service")).dailyReport(
      c.get("userId"),
      c.req.param("id"),
    ),
  ),
);
app.get("/api/groups/:id/highlights", async (c) =>
  c.json(
    await new MobileQueries(c.get("service")).highlights(
      c.get("userId"),
      c.req.param("id"),
      Number(c.req.query("limit") ?? 5),
      Number(c.req.query("offset") ?? 0),
    ),
  ),
);
const media = (c: import("hono").Context<AppEnv>) =>
  new MediaService(c.get("service"), new KvImageStorage(c.env.IMAGES));
app.post("/api/groups/:id/highlights", async (c) => {
  const input = await c.req.json<HighlightInput>(),
    storage = media(c);
  await storage.validateLink(
    c.get("userId"),
    c.req.param("id"),
    input.ImageUrl,
  );
  const h = await c
    .get("service")
    .createHighlight(c.get("userId"), c.req.param("id"), input);
  try {
    await storage.link(c.get("userId"), h!.Id, h!.ImageUrl);
  } catch (error) {
    await c.get("service").deleteHighlight(c.get("userId"), h!.Id);
    throw storageError(error);
  }
  return c.json(h, 201);
});
app.get("/api/highlights/:id/social", async (c) =>
  c.json(
    await new HighlightSocialService(c.get("service")).snapshot(
      c.get("userId"),
      c.req.param("id"),
    ),
  ),
);
app.put("/api/highlights/:id/social", async (c) => {
  const body = await c.req.json().catch(() => null);
  return c.json(
    await new HighlightSocialService(c.get("service")).react(
      c.get("userId"),
      c.req.param("id"),
      body?.Reaction,
    ),
  );
});
app.get("/api/highlights/:id/comments", async (c) =>
  c.json(
    await new HighlightSocialService(c.get("service")).comments(
      c.get("userId"),
      c.req.param("id"),
      Number(c.req.query("offset") || 0),
    ),
  ),
);
app.post("/api/highlights/:id/comments", async (c) => {
  const body = await c.req.json().catch(() => null);
  return c.json(
    await new HighlightSocialService(c.get("service")).comment(
      c.get("userId"),
      c.req.param("id"),
      body?.Body,
    ),
    201,
  );
});
app.delete("/api/highlights/:id/comments/:commentId", async (c) =>
  c.json(
    await new HighlightSocialService(c.get("service")).deleteComment(
      c.get("userId"),
      c.req.param("id"),
      c.req.param("commentId"),
    ),
  ),
);
app.patch("/api/highlights/:id", async (c) => {
  const input = await c.req.json<Partial<HighlightInput>>(),
    storage = media(c),
    h = await c
      .get("service")
      .scopedHighlight(c.get("userId"), c.req.param("id"), true);
  if (input.ImageUrl)
    await storage.validateLink(c.get("userId"), h.GroupId, input.ImageUrl);
  // Bind before updating the aggregate so a rejected fifth image cannot corrupt its primary URL.
  if (input.ImageUrl) await storage.link(c.get("userId"), h.Id, input.ImageUrl);
  const result = await c
    .get("service")
    .updateHighlight(c.get("userId"), h.Id, input);
  if (
    input.ImageUrl !== undefined &&
    h.ImageUrl &&
    input.ImageUrl !== h.ImageUrl
  ) {
    const old = await c
      .get("service")
      .repo.one<{ Id: string }>(
        "SELECT Id FROM MediaImage WHERE Id=? AND HighlightId=? AND DeletedAt IS NULL",
        h.ImageUrl.split("/").pop(),
        h.Id,
      );
    if (old) await storage.remove(c.get("userId"), old.Id);
  }
  return c.json(result);
});
app.delete("/api/highlights/:id", async (c) => {
  await media(c).deleteHighlight(c.get("userId"), c.req.param("id"));
  return c.json({ ok: true });
});
async function uploadBody(
  c: import("hono").Context<AppEnv>,
  purpose: ImagePurpose = "Highlight",
) {
  const maximum = imageByteLimit(purpose);
  const length = c.req.header("Content-Length");
  if (length !== undefined)
    ensure(
      Number.isSafeInteger(Number(length)) &&
        Number(length) > 0 &&
        Number(length) <= maximum,
      "IMAGE_TOO_LARGE",
      413,
    );
  ensure(
    ["image/jpeg", "image/png", "image/webp"].includes(
      c.req.header("Content-Type") || "",
    ),
    "IMAGE_UNSUPPORTED",
    415,
  );
  const reader = c.req.raw.body?.getReader();
  ensure(reader, "IMAGE_TOO_LARGE", 413);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      ensure(false, "IMAGE_TOO_LARGE", 413);
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}
app.get("/api/me/avatar", async (c) =>
  c.json(await media(c).avatar(c.get("userId"))),
);
app.post("/api/me/avatar/images", async (c) =>
  c.json(
    await media(c).upload(
      c.get("userId"),
      "Avatar",
      await uploadBody(c, "Avatar"),
      c.req.header("Content-Type")!,
    ),
    201,
  ),
);
app.delete("/api/me/avatar", async (c) => {
  await media(c).removeAvatar(c.get("userId"));
  return c.json({ ok: true });
});
app.post("/api/groups/:id/images", async (c) => {
  await c.get("service").requireRoomWrite(c.get("userId"), c.req.param("id"));
  return c.json(
    await media(c).upload(
      c.get("userId"),
      "Highlight",
      await uploadBody(c),
      c.req.header("Content-Type")!,
      c.req.param("id"),
    ),
    201,
  );
});
app.get("/api/highlights/:id/images", async (c) =>
  c.json(await media(c).list(c.get("userId"), c.req.param("id"))),
);
app.post("/api/highlights/:id/images", async (c) => {
  const h = await c
    .get("service")
    .scopedHighlight(c.get("userId"), c.req.param("id"), true);
  return c.json(
    await media(c).upload(
      c.get("userId"),
      "Highlight",
      await uploadBody(c),
      c.req.header("Content-Type")!,
      h.GroupId,
      h.Id,
    ),
    201,
  );
});
app.delete("/api/media/:id", async (c) => {
  await media(c).remove(c.get("userId"), c.req.param("id"));
  return c.json({ ok: true });
});
async function readImage(c: import("hono").Context<AppEnv>, groupId?: string) {
  const { object, row } = await media(c).read(
    c.get("userId"),
    (c.req.param("id") || c.req.param("key"))!,
    groupId,
  );
  return new Response(object.body, {
    headers: {
      "Content-Type": row.MimeType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
app.get("/api/media/:id", (c) => readImage(c));
app.get("/images/:group/:key", (c) => readImage(c, c.req.param("group")));
app.notFound((c) => c.json({ error: "NotFound" }, 404));
export default app;
