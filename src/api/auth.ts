import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context } from "hono";
import { LedgerService } from "../application/service";
import { ensure } from "../domain/rules";
import { Repository } from "../persistence/repository";
import { IdentityService } from "../application/identity";
import { accountView } from "../domain/model";
export interface Env {
  DB: D1Database;
  GROUP_REALTIME: DurableObjectNamespace;
  IMAGES: KVNamespace;
  ASSETS: Fetcher;
  APP_ORIGIN: string;
  DEV_AUTH?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ADMIN_GOOGLE_SUB?: string;
}
export type AppEnv = {
  Bindings: Env;
  Variables: { userId: string; service: LedgerService };
};
export const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
const token = () =>
  crypto.randomUUID().replaceAll("-", "") +
  crypto.randomUUID().replaceAll("-", "");
const cookies = (c: Context<AppEnv>, maxAge: number) => ({
  httpOnly: true,
  secure: new URL(c.env.APP_ORIGIN).protocol === "https:",
  sameSite: "Lax" as const,
  path: "/",
  maxAge,
});
export const SESSION_LIFETIME_SECONDS = 365 * 86400;
export async function currentSession(c: Context<AppEnv>) {
  const cookie = getCookie(c, "ledger_session");
  if (!cookie) return null;
  const sessionHash = await hash(cookie);
  const row = await new Repository(c.env.DB).one<{
    UserId: string;
    VerifiedGoogleSubject: string | null;
    VerifiedGoogleEmail: string | null;
  }>(
    "SELECT s.UserId,p.VerifiedGoogleSubject,p.VerifiedGoogleEmail FROM AuthSession s LEFT JOIN GoogleSessionProof p ON p.TokenHash=s.TokenHash WHERE s.TokenHash=? AND s.ExpiresAt>?",
    sessionHash,
    new Date().toISOString(),
  );
  return row ? { ...row, SessionHash: sessionHash } : null;
}
export async function authenticate(c: Context<AppEnv>) {
  const session = await currentSession(c);
  ensure(session, "Unauthorized", 401);
  return session.UserId;
}
export async function sessionStatus(c: Context<AppEnv>) {
  const session = await currentSession(c);
  if (!session) return c.json({ hasSession: false, accountState: "none" });
  const user = await c.get("service").user(session.UserId);
  return c.json({
    hasSession: true,
    accountState: user.GoogleSubjectId === null ? "anonymous" : "google-linked",
    email: user.Email,
  });
}
export async function anonymousSession(c: Context<AppEnv>) {
  const existing = await currentSession(c);
  if (existing)
    return c.json(accountView(await c.get("service").user(existing.UserId)));
  const body = await c.req.json().catch(() => null);
  ensure(
    body && typeof body === "object" && !Array.isArray(body),
    "InvalidRequestBody",
  );
  const session = token(),
    user = await new IdentityService(new Repository(c.env.DB)).createAnonymous(
      await hash(session),
      new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000).toISOString(),
      body.DisplayName ?? "玩家",
    );
  setCookie(c, "ledger_session", session, cookies(c, SESSION_LIFETIME_SECONDS));
  return c.json(accountView(user));
}
async function login(
  c: Context<AppEnv>,
  userId: string,
  verified?: { subject: string; email: string },
) {
  const session = token(),
    repo = new Repository(c.env.DB),
    now = new Date().toISOString();
  await repo.batch([
    repo.statement("DELETE FROM AuthSession WHERE ExpiresAt<?", now),
    repo.statement("DELETE FROM OAuthState WHERE ExpiresAt<?", now),
    repo.statement(
      "INSERT INTO AuthSession (TokenHash,UserId,ExpiresAt) VALUES (?,?,?)",
      await hash(session),
      userId,
      new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000).toISOString(),
    ),
    ...(verified
      ? [
          repo.statement(
            "INSERT INTO GoogleSessionProof VALUES (?,?,?)",
            await hash(session),
            verified.subject,
            verified.email,
          ),
        ]
      : []),
  ]);
  setCookie(c, "ledger_session", session, cookies(c, SESSION_LIFETIME_SECONDS));
}
export async function devLogin(c: Context<AppEnv>) {
  ensure(
    c.env.DEV_AUTH === "true" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(new URL(c.req.url).hostname),
    "DevAuthDisabled",
    403,
  );
  const user = await c
    .get("service")
    .upsertGoogleUser("dev-local-user", "dev@localhost", "本機測試會員");
  await login(c, user.Id);
  return c.json(accountView(user));
}
export async function logout(c: Context<AppEnv>) {
  const cookie = getCookie(c, "ledger_session");
  if (cookie)
    await new Repository(c.env.DB).run(
      "DELETE FROM AuthSession WHERE TokenHash=?",
      await hash(cookie),
    );
  deleteCookie(c, "ledger_session", { path: "/" });
  return c.json({ ok: true });
}
export async function googleStart(c: Context<AppEnv>) { return c.json({ error: "OfflineDemoGoogleDisabled" }, 403); }
export async function googleCallback(c: Context<AppEnv>) { return c.json({ error: "OfflineDemoGoogleDisabled" }, 403); }
