import React, { useEffect, useRef, useState } from "react";
import type { HighlightFeed, Page } from "../application/mobile-queries";
import type { GroupView, PlayerView } from "../domain/model";
import type {
  HighlightSocial,
  HighlightPerson,
  HighlightComment,
  HighlightReaction,
} from "../application/highlight-social";
import { api } from "./mobile-api";
import { Avatar, Icon, Modal } from "./ui";
import { HighlightForm } from "./flows";

export function HighlightPeople({
  people,
  label,
  onClick,
}: {
  people: HighlightPerson[];
  label: string;
  onClick: () => void;
}) {
  if (!people.length) return null;
  return (
    <button
      type="button"
      className="highlight-people"
      aria-label={`查看${label}名單，共 ${people.length} 人`}
      onClick={onClick}
    >
      <span className="highlight-avatar-stack" aria-hidden="true">
        {people.slice(0, 3).map((p) => (
          <Avatar
            key={p.UserId}
            name={p.DisplayName}
            url={p.AvatarImageUrl}
            size={18}
          />
        ))}
      </span>
      {people.length > 3 && <span>+{people.length - 3}</span>}
      <span className="highlight-people-label">{label}</span>
    </button>
  );
}
export function canManageHighlight(
  h: Pick<HighlightFeed, "CreatedByUserId">,
  userId: string,
  group: Pick<GroupView, "AccessLevel" | "IsAdmin">,
) {
  return (
    group.AccessLevel === "Member" &&
    (!!group.IsAdmin || h.CreatedByUserId === userId)
  );
}
export function HighlightActions({
  highlight: h,
  group,
  userId,
}: {
  highlight: HighlightFeed;
  group: GroupView;
  userId: string;
  players: PlayerView[];
  onChanged: () => void;
}) {
  const [social, setSocial] = useState<HighlightSocial | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false),
    [comments, setComments] = useState<Page<HighlightComment> | null>(null),
    [body, setBody] = useState("");
  const [panel, setPanel] = useState<"LIKE" | "DISLIKE" | null>(null);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);
  const writable = group.AccessLevel === "Member";
  useEffect(() => {
    let active = true;
    api<HighlightSocial>(`/highlights/${h.Id}/social`)
      .then((s) => {
        if (active) setSocial(s);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [h.Id, h.UpdatedAt, userId]);
  async function work(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function refreshComments() {
    const [page, snapshot] = await Promise.all([
      api<Page<HighlightComment>>(`/highlights/${h.Id}/comments`),
      api<HighlightSocial>(`/highlights/${h.Id}/social`),
    ]);
    setComments(page);
    setSocial(snapshot);
  }
  const reaction = (value: HighlightReaction) =>
    void work(async () =>
      setSocial(
        await api<HighlightSocial>(`/highlights/${h.Id}/social`, "PUT", {
          Reaction: social?.MyReaction === value ? null : value,
        }),
      ),
    );
  return (
    <div className="highlight-interactions">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!social && error && (
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() =>
            void work(async () =>
              setSocial(
                await api<HighlightSocial>(`/highlights/${h.Id}/social`),
              ),
            )
          }
        >
          重新載入互動
        </button>
      )}
      {!!(social?.Likes.length || social?.Dislikes.length) && (
        <div className="highlight-social-proof">
          <HighlightPeople
            people={social?.Likes || []}
            label="按讚"
            onClick={() => setPanel("LIKE")}
          />
          <HighlightPeople
            people={social?.Dislikes || []}
            label="倒讚"
            onClick={() => setPanel("DISLIKE")}
          />
        </div>
      )}
      <div className="highlight-action-bar">
        <button
          type="button"
          className="highlight-action"
          aria-pressed={social?.MyReaction === "LIKE"}
          disabled={!writable || busy || !social}
          onClick={() => reaction("LIKE")}
        >
          <Icon name="thumb-up" size={16} />
          <span>讚</span>
        </button>
        <button
          type="button"
          className="highlight-action"
          aria-pressed={social?.MyReaction === "DISLIKE"}
          disabled={!writable || busy || !social}
          onClick={() => reaction("DISLIKE")}
        >
          <Icon name="thumb-down" size={16} />
          <span>倒讚</span>
        </button>
        <button
          type="button"
          className="highlight-action highlight-comments-toggle"
          aria-expanded={expanded}
          disabled={busy}
          onClick={() => {
            setExpanded(!expanded);
            if (!expanded) void work(refreshComments);
          }}
        >
          <Icon name="comment" size={16} />
          <span>{expanded ? "收合" : "留言"}</span>
          {!!social?.CommentCount && <small>{social.CommentCount}</small>}
        </button>
      </div>
      {expanded && (
        <div className="highlight-comments">
          {comments?.Items.map((c) => (
            <div className="highlight-comment" key={c.Id}>
              <Avatar name={c.DisplayName} url={c.AvatarImageUrl} size={28} />
              <div className="highlight-comment-copy">
                <b>{c.DisplayName}</b>
                <small>
                  {new Date(c.CreatedAt).toLocaleString("zh-TW", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
                <p>{c.Body}</p>
                {c.CanDelete &&
                  writable &&
                  (c.UserId === userId || !!group.IsAdmin) && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => setDeletingComment(c.Id)}
                    >
                      刪除留言
                    </button>
                  )}
              </div>
            </div>
          ))}
          {comments && !comments.Items.length && (
            <p className="muted small">還沒有人留言，來接一句？</p>
          )}
          {comments?.HasMore && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  const next = await api<Page<HighlightComment>>(
                    `/highlights/${h.Id}/comments?offset=${comments.NextOffset}`,
                  );
                  setComments({
                    ...next,
                    Items: [
                      ...comments.Items,
                      ...next.Items.filter(
                        (c) => !comments.Items.some((old) => old.Id === c.Id),
                      ),
                    ],
                  });
                })
              }
            >
              更多留言
            </button>
          )}
          {writable && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void work(async () => {
                  await api(`/highlights/${h.Id}/comments`, "POST", {
                    Body: body,
                  });
                  setBody("");
                  await refreshComments();
                });
              }}
            >
              <label>
                留一句話
                <textarea
                  rows={2}
                  maxLength={500}
                  value={body}
                  disabled={busy}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="這一把，值得說兩句。"
                />
              </label>
              <button className="secondary" disabled={busy || !body.trim()}>
                {busy ? "處理中…" : "送出留言"}
              </button>
            </form>
          )}
        </div>
      )}
      {(panel === "LIKE" || panel === "DISLIKE") && (
        <Modal
          title={panel === "LIKE" ? "誰按了讚" : "誰按了倒讚"}
          onClose={() => setPanel(null)}
        >
          <ul className="highlight-people-list">
            {(panel === "LIKE" ? social?.Likes : social?.Dislikes)?.map((p) => (
              <li key={p.UserId}>
                <Avatar name={p.DisplayName} url={p.AvatarImageUrl} size={32} />
                <span>{p.DisplayName}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {deletingComment && (
        <Modal
          title="刪除這則留言？"
          onClose={() => {
            if (!busy) setDeletingComment(null);
          }}
        >
          <p>留言刪除後無法復原。</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="flow-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setDeletingComment(null)}
            >
              取消
            </button>
            <button
              className="destructive"
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  await api(
                    `/highlights/${h.Id}/comments/${deletingComment}`,
                    "DELETE",
                  );
                  setDeletingComment(null);
                  await refreshComments();
                })
              }
            >
              確認刪除留言
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function HighlightManagement({
  highlight: h,
  group,
  userId,
  players,
  onChanged,
}: Parameters<typeof HighlightActions>[0]) {
  const [menu, setMenu] = useState(false),
    [panel, setPanel] = useState<"edit" | "delete" | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);
  if (!canManageHighlight(h, userId, group)) return null;
  return (
    <div
      className="highlight-management"
      ref={ref}
      onKeyDown={(e) => {
        if (menu && e.key === "Escape") {
          setMenu(false);
          ref.current?.querySelector("button")?.focus();
        }
      }}
    >
      <button
        type="button"
        className="highlight-more"
        aria-label="精華選項"
        aria-expanded={menu}
        disabled={busy}
        onClick={() => setMenu(!menu)}
      >
        <Icon name="more" size={22} />
      </button>
      {menu && (
        <div className="highlight-management-menu">
          <button
            type="button"
            onClick={() => {
              setMenu(false);
              setError("");
              setPanel("edit");
            }}
          >
            編輯精華
          </button>
          <button
            type="button"
            className="highlight-delete-action"
            onClick={() => {
              setMenu(false);
              setError("");
              setPanel("delete");
            }}
          >
            刪除精華
          </button>
        </div>
      )}
      {panel === "edit" && (
        <Modal
          title="編輯精華"
          onClose={() => {
            if (!busy) setPanel(null);
          }}
        >
          <HighlightForm
            group={group}
            players={players}
            existing={h}
            onBusyChange={setBusy}
            onDone={() => {
              setPanel(null);
              onChanged();
            }}
          />
        </Modal>
      )}
      {panel === "delete" && (
        <Modal
          title="刪除這則精華？"
          onClose={() => {
            if (!busy) setPanel(null);
          }}
        >
          <p>
            「{h.Title || "這則精華"}
            」的照片、讚／倒讚與留言也會永久移除，無法復原。牌局與積分不受影響。
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="flow-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setPanel(null)}
            >
              取消
            </button>
            <button
              className="destructive"
              disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                setError("");
                try {
                  await api(`/highlights/${h.Id}`, "DELETE");
                  setPanel(null);
                  onChanged();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "刪除中…" : "確認刪除精華"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
