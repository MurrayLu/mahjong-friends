import { LedgerService } from "../application/service";
import { TableAppealService } from "../application/table-appeal";
import { Repository } from "../persistence/repository";
import type { Env } from "./auth";

export type AppealEventType =
  | "appeal.created"
  | "appeal.reaction.changed"
  | "appeal.ready"
  | "appeal.finalized";
export interface AppealEvent {
  version: 1;
  eventId: string;
  groupId: string;
  type: AppealEventType;
  occurredAt: string;
  payload: { appealId: string; actorUserId?: string };
}
interface SocketAttachment {
  groupId: string;
  userId: string;
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });

/** One SQLite-backed, hibernatable instance per group. D1 owns all domain state. */
export class GroupRealtime {
  constructor(public ctx: DurableObjectState, public env: Env) {}
  private groupId = "";
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const groupId = request.headers.get("X-Group-Id") || "";
    if (!groupId) return new Response("Missing group", { status: 400 });
    this.groupId = groupId;
    if (url.pathname === "/connect") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
        return new Response("Upgrade required", { status: 426 });
      const userId = request.headers.get("X-User-Id") || "";
      if (!userId) return new Response("Missing user", { status: 403 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({
        groupId,
        userId,
      } satisfies SocketAttachment);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === "/broadcast") {
      const event = await request.json<AppealEvent>();
      if (event.version !== 1 || event.groupId !== groupId)
        return new Response("Wrong group", { status: 403 });
      await this.broadcast(event);
      return json({ ok: true });
    }
    if (url.pathname === "/schedule") {
      const { appealId, expiresAt } = await request.json<{
        appealId: string;
        expiresAt: string;
      }>();
      await this.ctx.storage.put("expiry", { groupId, appealId });
      await this.ctx.storage.setAlarm(Date.parse(expiresAt));
      return json({ ok: true });
    }
    if (url.pathname === "/revoke") {
      const { userId } = await request.json<{ userId: string }>();
      const membership = await new Repository(this.env.DB).one(
        "SELECT 1 FROM GroupMember WHERE GroupId=? AND UserId=?",
        groupId,
        userId,
      );
      if (!membership)
        for (const socket of this.ctx.getWebSockets()) {
          const attachment =
            socket.deserializeAttachment() as SocketAttachment | null;
          if (attachment?.groupId === groupId && attachment.userId === userId)
            socket.close(1008, "Room access removed");
        }
      return json({ ok: true });
    }
    return new Response("Not found", { status: 404 });
  }
  private async broadcast(event: AppealEvent) {
    const repo = new Repository(this.env.DB);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment || attachment.groupId !== event.groupId) continue;
      const member = await repo.one(
        "SELECT 1 FROM GroupMember WHERE GroupId=? AND UserId=?",
        event.groupId,
        attachment.userId,
      );
      if (!member) {
        socket.close(1008, "Room access removed");
        continue;
      }
      try {
        socket.send(JSON.stringify(event));
      } catch {
        socket.close(1011, "Connection lost");
      }
    }
  }
  webSocketMessage(_socket: WebSocket, _message: string | ArrayBuffer) {
    // Realtime is receive-only. Mutations require authenticated REST endpoints.
  }
  webSocketClose(socket: WebSocket) {
    try {
      socket.close(1000, "Closed");
    } catch {}
  }
  webSocketError(socket: WebSocket) {
    try {
      socket.close(1011, "Connection error");
    } catch {}
  }
  async alarm() {
    const expiry = await this.ctx.storage.get<{
      groupId: string;
      appealId: string;
    }>("expiry");
    if (!expiry) return;
    const appeal = new TableAppealService(
      new LedgerService(new Repository(this.env.DB)),
    );
    const outcome = await appeal.finalize(expiry.appealId);
    if (outcome.Changed) {
      await this.broadcast({
        version: 1,
        eventId: crypto.randomUUID(),
        groupId: expiry.groupId,
        type: "appeal.finalized",
        occurredAt: new Date().toISOString(),
        payload: { appealId: expiry.appealId },
      });
    }
    await this.ctx.storage.delete("expiry");
  }
}
