import React, { useEffect, useState } from "react";
import { api } from "./mobile-api";
import { Avatar, Modal, Skeleton } from "./ui";
export type JoinMode = "view" | "claim" | "member";
export function JoinChoices({
  busy,
  onChoose,
}: {
  busy: boolean;
  onChoose: (mode: JoinMode) => void;
}) {
  return (
    <div className="join-choices">
      <button
        className="secondary join-choice"
        disabled={busy}
        onClick={() => onChoose("view")}
      >
        <b>👀 路人湊熱鬧</b>
        <small>只看看，不新增也不修改紀錄</small>
      </button>
      <button
        className="secondary join-choice"
        disabled={busy}
        onClick={() => onChoose("claim")}
      >
        <b>🀄 認領身份</b>
        <small>以前有人幫你記過牌局？把你的牌咖身份認領回來</small>
      </button>
      <button
        className="secondary join-choice"
        disabled={busy}
        onClick={() => onChoose("member")}
      >
        <b>＋ 我是新牌咖</b>
        <small>建立新的牌咖身份，不需要 Google</small>
      </button>
    </div>
  );
}
type Candidate = {
  PlayerId: string;
  DisplayName: string;
  AvatarImageUrl: string | null;
  SessionsPlayed: number;
};
export function BecomePlayer({
  groupId,
  initialMode,
  onClose,
  onDone,
}: {
  groupId: string;
  initialMode?: "claim" | "member";
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [mode, setMode] = useState(initialMode),
    [candidates, setCandidates] = useState<Candidate[]>([]),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Candidate | null>(null),
    [name, setName] = useState("");
  useEffect(() => {
    if (mode !== "claim") return;
    let active = true;
    setLoading(true);
    api<Candidate[]>(`/groups/${groupId}/claimable-players`)
      .then((rows) => {
        if (active) setCandidates(rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, groupId]);
  async function submit(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, "POST", body);
      await onDone();
    } catch (e) {
      setError((e as Error).message);
      if (mode === "claim")
        setCandidates(
          await api<Candidate[]>(`/groups/${groupId}/claimable-players`).catch(
            () => [],
          ),
        );
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        selected
          ? `認領「${selected.DisplayName}」？`
          : mode === "claim"
            ? "這裡面哪一個是你？"
            : mode === "member"
              ? "建立新牌咖"
              : "成為牌咖"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!mode ? (
        <div className="join-choices">
          <button className="secondary full" onClick={() => setMode("claim")}>
            認領已有牌咖
          </button>
          <button className="primary full" onClick={() => setMode("member")}>
            建立新牌咖
          </button>
        </div>
      ) : mode === "member" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(`/groups/${groupId}/join`, { DisplayName: name });
          }}
        >
          <label>
            你的暱稱
            <input
              aria-label="你的暱稱"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={1000}
              placeholder="Amy"
              disabled={busy}
            />
          </label>
          <p className="small muted">不需要 Google、Email 或密碼。</p>
          <button className="primary full" disabled={busy}>
            {busy ? "加入中…" : "加入麻吉局"}
          </button>
        </form>
      ) : selected ? (
        <>
          <p>認領後，這位牌咖過去的牌局紀錄會成為你在這個麻吉局的歷史。</p>
          <div className="flow-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              取消
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void submit(`/groups/${groupId}/claim-player`, {
                  PlayerId: selected.PlayerId,
                })
              }
            >
              {busy ? "認領中…" : "確認認領"}
            </button>
          </div>
        </>
      ) : loading ? (
        <Skeleton />
      ) : (
        <>
          <div className="member-list">
            {candidates.map((p) => (
              <button
                className="member-row"
                key={p.PlayerId}
                onClick={() => setSelected(p)}
              >
                <Avatar name={p.DisplayName} url={p.AvatarImageUrl} size={44} />
                <div>
                  <b>{p.DisplayName}</b>
                  <small>過去 {p.SessionsPlayed} 場</small>
                </div>
              </button>
            ))}
          </div>
          {!candidates.length && (
            <p className="muted">
              目前沒有未認領牌咖。你可以建立新的牌咖身份。
            </p>
          )}
          <button
            className="text-button full"
            onClick={() => setMode("member")}
          >
            建立新牌咖
          </button>
        </>
      )}
    </Modal>
  );
}
