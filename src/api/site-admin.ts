import { Hono } from "hono";
import type { AppEnv } from "./auth";
import { authenticate, currentSession } from "./auth";
import { Repository } from "../persistence/repository";
import { matchesSiteAdmin, SiteAdminQueries } from "../application/site-admin";
import { ensure, DomainError } from "../domain/rules";
import { KvImageStorage } from "../storage/images";

export async function siteAdminAccess(c: import("hono").Context<AppEnv>) {
  const session = await currentSession(c);
  if (!session) return false;
  const user = await c.get("service").user(session.UserId);
  return matchesSiteAdmin(c.env.ADMIN_GOOGLE_SUB, user, session);
}
export function previewMediaUrls<T>(data: T, groupId: string): T {
  const value = JSON.parse(JSON.stringify(data));
  const visit = (node: any): void => {
    if (!node || typeof node !== "object") return;
    for (const [key, v] of Object.entries(node)) {
      if (
        typeof v === "string" &&
        [
          "AvatarImageUrl",
          "ImageUrl",
          "CreatorAvatar",
          "PlayerAvatar",
        ].includes(key)
      ) {
        const match = v.match(/^\/(?:api\/media|images\/[^/]+)\/([^/]+)$/);
        if (match)
          node[key] =
            `/api/admin/groups/${encodeURIComponent(groupId)}/media/${encodeURIComponent(match[1])}`;
        else node[key] = null;
      } else visit(v);
    }
  };
  visit(value);
  return value;
}
const admin = new Hono<AppEnv>();
admin.use("*", async (c, next) => {
  // Set before auth so even errors are never publicly cached.
  c.header("Cache-Control", "private, no-store");
  c.header("Vary", "Cookie");
  c.set("userId", await authenticate(c));
  ensure(await siteAdminAccess(c), "SiteAdminRequired", 403);
  ensure(c.req.method === "GET", "AdminReadOnly", 405);
  await next();
});
const query = (c: import("hono").Context<AppEnv>) =>
  new SiteAdminQueries(new Repository(c.env.DB));
admin.get("/dashboard", async (c) => c.json(await query(c).dashboard()));
admin.get("/groups", async (c) =>
  c.json(
    await query(c).groups({
      q: c.req.query("q"),
      sort: c.req.query("sort"),
      creator: c.req.query("creator"),
      admin: c.req.query("admin"),
      offset: Number(c.req.query("offset") ?? 0),
      limit: Number(c.req.query("limit") ?? 20),
    }),
  ),
);
admin.get("/admins", async (c) =>
  c.json(
    await query(c).admins({
      q: c.req.query("q"),
      offset: Number(c.req.query("offset") ?? 0),
      limit: Number(c.req.query("limit") ?? 20),
    }),
  ),
);
admin.use("/groups/:id/*", async (c, next) => {
  const queries = query(c),
    id = c.req.param("id")!;
  let outcome: "allowed" | "not-found" | "failed" = "allowed";
  try {
    await queries.requireGroup(id);
    await next();
    if (!c.res.ok) outcome = c.res.status === 404 ? "not-found" : "failed";
  } catch (error) {
    outcome =
      error instanceof DomainError && error.code === "GroupNotFound"
        ? "not-found"
        : "failed";
    await queries.audit(c.get("userId"), id, outcome);
    throw error;
  }
  // The response has not left the worker. Audit failure refuses private-data access.
  await queries.audit(c.get("userId"), id, outcome);
});
admin.get("/groups/:id/preview", async (c) =>
  c.json(
    previewMediaUrls(
      await query(c).preview(c.req.param("id"), c.req.query("period") ?? "all"),
      c.req.param("id"),
    ),
  ),
);
admin.get("/groups/:id/sessions", async (c) =>
  c.json(
    previewMediaUrls(
      await query(c)
        .readQueries()
        .sessions(
          "",
          c.req.param("id"),
          20,
          Number(c.req.query("offset") ?? 0),
          c.req.query("date"),
        ),
      c.req.param("id"),
    ),
  ),
);
admin.get("/groups/:id/highlights", async (c) =>
  c.json(
    previewMediaUrls(
      await query(c)
        .readQueries()
        .highlights(
          "",
          c.req.param("id"),
          20,
          Number(c.req.query("offset") ?? 0),
        ),
      c.req.param("id"),
    ),
  ),
);
admin.get("/groups/:id/media/:mediaId", async (c) => {
  const groupId = c.req.param("id"),
    id = c.req.param("mediaId");
  const row = await new Repository(c.env.DB).one<{
    StorageKey: string;
    MimeType: string;
  }>(
    `SELECT m.StorageKey,m.MimeType FROM MediaImage m WHERE m.Id=? AND m.DeletedAt IS NULL AND
    (m.GroupId=? OR (m.Purpose='Avatar' AND m.GroupId IS NULL AND
      (EXISTS(SELECT 1 FROM GroupMember gm WHERE gm.GroupId=? AND gm.UserId=m.OwnerUserId)
       OR EXISTS(SELECT 1 FROM Player p WHERE p.GroupId=? AND (p.AvatarImageUrl='/api/media/'||m.Id OR p.AvatarImageUrl='/images/'||p.GroupId||'/'||m.Id)))))`,
    id,
    groupId,
    groupId,
    groupId,
  );
  ensure(row, "IMAGE_NOT_FOUND", 404);
  const object = await new KvImageStorage(c.env.IMAGES).get(row.StorageKey);
  ensure(object, "IMAGE_NOT_FOUND", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": row.MimeType,
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
admin.all("*", (c) => c.json({ error: "NotFound" }, 404));
export default admin;
