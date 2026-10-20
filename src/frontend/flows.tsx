import React, { useEffect, useRef, useState } from "react";
import { sessionRateChoices } from "../domain/rate-presets";
import type {
  GroupView as Group,
  Highlight,
  HighlightInput,
  MahjongType,
  PlayerView,
  SessionInput,
} from "../domain/model";
import type { MobileSession, Page } from "../application/mobile-queries";
import { autoBalance, localToday } from "../domain/rules";
import { api } from "./mobile-api";
import { slotQuote } from "../fun/catalog";
import { delayedLoading } from "./delayed-loading";
import { signedInteger, toggleSign } from "./mobile-logic";
import {
  uploadProcessedImage,
  imageStageLabel,
  type ImageStage,
} from "./image-processing";
import { Amount, Avatar, Icon, Modal } from "./ui";
export const typeNames = {
  Traditional: "一般麻將",
  American: "美國麻將",
  Mixed: "一般 + 美麻",
};
export function SessionWizard({
  group,
  players: activePlayers,
  onPlayers,
  onDone,
  source,
  editing = false,
  onDelete,
}: {
  group: Group;
  players: PlayerView[];
  onPlayers: () => Promise<void>;
  onDone: (s: MobileSession) => void;
  source?: MobileSession;
  editing?: boolean;
  onDelete: () => Promise<void>;
}) {
  // Only an edit may retain archived historical participants; new sessions use active roster.
  const rateChoices = sessionRateChoices(group.RatePresets);
  const firstRate = rateChoices[0];
  const players: PlayerView[] = [
    ...activePlayers,
    ...(editing && source
      ? source.Results.filter(
          (r) => !activePlayers.some((p) => p.Id === r.PlayerId),
        ).map((r) => ({
          Id: r.PlayerId,
          GroupId: group.Id,
          UserId: null,
          DisplayName: r.DisplayName,
          IsGuest: 1,
          IsArchived: 1,
          CreatedAt: "",
          UpdatedAt: "",
          AvatarImageUrl: r.AvatarImageUrl,
          Email: null,
        }))
      : []),
  ];
  const initial =
    source && editing
      ? {
          ...source,
          PlayerIds: source.Results.map((r) => r.PlayerId),
          Amounts: Object.fromEntries(
            source.Results.map((r) => [r.PlayerId, String(r.NetAmount)]),
          ),
        }
      : null;
  const [step, setStep] = useState(1),
    [date, setDate] = useState(initial?.RecordDate || localToday()),
    [name, setName] = useState(initial?.Name || ""),
    [type, setType] = useState<MahjongType>(
      initial?.MahjongType || "Traditional",
    ),
    [major, setMajor] = useState(
      String(initial?.RateMajor ?? firstRate.RateMajor),
    ),
    [minor, setMinor] = useState(
      String(initial?.RateMinor ?? firstRate.RateMinor),
    ),
    [count, setCount] = useState(
      initial?.HandCount == null ? "" : String(initial.HandCount),
    ),
    [custom, setCustom] = useState(
      !!initial &&
        !rateChoices.some(
          (r) =>
            r.RateMajor === initial.RateMajor &&
            r.RateMinor === initial.RateMinor,
        ),
    ),
    [selected, setSelected] = useState<string[]>(
      initial?.PlayerIds || players.map((p) => p.Id),
    ),
    [amounts, setAmounts] = useState<Record<string, string>>(
      initial?.Amounts || {},
    ),
    [auto, setAuto] = useState(""),
    [guest, setGuest] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const id = useRef(editing ? source?.Id : undefined);
  const participants = players.filter((p) => selected.includes(p.Id));
  const [loadingQuote, setLoadingQuote] = useState(false);
  const loadingCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => loadingCleanup.current?.(), []);
  let calculated: number | undefined,
    total: bigint | null = 0n;
  try {
    const values = participants
      .filter((p) => p.Id !== auto)
      .map((p) => {
        const n = signedInteger(amounts[p.Id] || "0");
        if (n === null) throw Error();
        return { PlayerId: p.Id, NetAmount: n };
      });
    if (auto) calculated = autoBalance(values.map((r) => r.NetAmount));
    total =
      values.reduce((s, r) => s + BigInt(r.NetAmount), 0n) +
      (calculated === undefined ? 0n : BigInt(calculated));
  } catch {
    total = null;
  }
  const fields = (): SessionInput => {
    const a = signedInteger(major),
      b = signedInteger(minor),
      h = count.trim() === "" ? null : signedInteger(count);
    if (a === null || b === null || a < 0 || b < 0)
      throw Error("底與台請填 0 以上的整數。");
    if ((h !== null && h < 1) || (count.trim() !== "" && h === null))
      throw Error("將數請填 1 以上的整數，或留白。");
    return {
      RecordDate: date,
      Name: name,
      MahjongType: type,
      RateMajor: a,
      RateMinor: b,
      HandCount: h,
    };
  };
  const submit = async () => {
    setBusy(true);
    setError("");
    setLoadingQuote(false);
    const finishLoading = delayedLoading(() => setLoadingQuote(true));
    loadingCleanup.current = finishLoading;
    try {
      const input = fields();
      if (!id.current) {
        const created = await api<MobileSession>(
          `/groups/${group.Id}/sessions`,
          "POST",
          input,
        );
        id.current = created.Id;
      } else {
        const { RecordDate, ...update } = input;
        if (!update.Name) delete update.Name;
        await api(`/sessions/${id.current}`, "PATCH", update);
      }
      const Results = participants.map((p) => ({
        PlayerId: p.Id,
        NetAmount:
          p.Id === auto ? calculated! : signedInteger(amounts[p.Id] || "0")!,
      }));
      const s = await api<MobileSession>(
        `/sessions/${id.current}/settlement`,
        "PUT",
        { Results },
      );
      onDone(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      finishLoading();
      setLoadingQuote(false);
      setBusy(false);
    }
  };
  return (
    <div className="wizard">
      {busy && loadingQuote && (
        <p className="settlement-loading-quote" role="status">
          {slotQuote("LoadingQuote", group.Id, localToday()).Text}
        </p>
      )}
      <div className="steps" aria-label={`第 ${step} 步，共 3 步`}>
        {["基本資料", "選擇牌咖", "結算"].map((label, i) => (
          <span key={label} className={step >= i + 1 ? "active" : ""}>
            <b>{i + 1}</b>
            {label}
          </span>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <fieldset disabled={busy}>
        {step === 1 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                fields();
                setError("");
                setStep(2);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label>
              日期
              <input
                type="date"
                required
                value={date}
                disabled={!!id.current}
                onChange={(e) => setDate(e.target.value)}
                onInput={(e) => setDate(e.currentTarget.value)}
              />
            </label>
            <label>
              場次名稱 <span className="muted">可略過</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：Kevin最後的1000塊"
                maxLength={100}
              />
            </label>
            <div className="field-label">今天玩什麼？</div>
            <div className="chips">
              {Object.entries(typeNames).map(([v, label]) => (
                <button
                  type="button"
                  className={type === v ? "chip selected" : "chip"}
                  aria-pressed={type === v}
                  key={v}
                  onClick={() => setType(v as MahjongType)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="field-label">底 / 台</div>
            <div className="chips">
              {rateChoices.map(({ RateMajor: a, RateMinor: b }) => (
                <button
                  type="button"
                  key={`${a}/${b}`}
                  aria-pressed={
                    !custom && major === String(a) && minor === String(b)
                  }
                  className={
                    !custom && major === String(a) && minor === String(b)
                      ? "chip selected"
                      : "chip"
                  }
                  onClick={() => {
                    setMajor(String(a));
                    setMinor(String(b));
                    setCustom(false);
                  }}
                >
                  {a}/{b}
                </button>
              ))}
              <button
                type="button"
                className={custom ? "chip selected" : "chip"}
                onClick={() => setCustom(true)}
              >
                自訂
              </button>
            </div>
            {custom && (
              <div className="two-fields">
                <label>
                  底
                  <input
                    inputMode="numeric"
                    value={major}
                    onChange={(e) => setMajor(e.target.value)}
                  />
                </label>
                <label>
                  台
                  <input
                    inputMode="numeric"
                    value={minor}
                    onChange={(e) => setMinor(e.target.value)}
                  />
                </label>
              </div>
            )}
            <label>
              今天打幾將？ <span className="muted">可略過</span>
              <input
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                placeholder="例如：3"
              />
            </label>
            <button className="primary full">
              下一步 · 選牌咖 <Icon name="chevron" size={18} />
            </button>
          </form>
        )}
        {step === 2 && (
          <>
            <div className="section-heading">
              <h3>今晚誰上桌？</h3>
              <span className="tag">已選 {selected.length} 人</span>
            </div>
            <p className="muted">至少 4 位，輪流參與的朋友也可以加入。</p>
            <div className="player-grid">
              {players.map((p) => (
                <button
                  key={p.Id}
                  className={`player-choice ${selected.includes(p.Id) ? "selected" : ""}`}
                  aria-pressed={selected.includes(p.Id)}
                  onClick={() =>
                    setSelected((v) =>
                      v.includes(p.Id)
                        ? v.filter((id) => id !== p.Id)
                        : [...v, p.Id],
                    )
                  }
                >
                  <Avatar
                    name={p.DisplayName}
                    url={p.AvatarImageUrl}
                    size={48}
                  />
                  <span>{p.DisplayName}</span>
                  <i className="choice-check">
                    {selected.includes(p.Id) && <Icon name="check" size={14} />}
                  </i>
                </button>
              ))}
            </div>
            <form
              className="inline-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  const p = await api<PlayerView>(
                    `/groups/${group.Id}/players`,
                    "POST",
                    { DisplayName: guest },
                  );
                  await onPlayers();
                  setSelected((v) => [...v, p.Id]);
                  setGuest("");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <input
                aria-label="牌咖暱稱"
                placeholder="朋友的暱稱"
                value={guest}
                onChange={(e) => setGuest(e.target.value)}
                required
              />
              <button className="secondary">＋ 新增牌咖</button>
            </form>
            <div className="flow-actions">
              <button className="secondary" onClick={() => setStep(1)}>
                上一步
              </button>
              <button
                className="primary"
                disabled={selected.length < 4}
                onClick={() => setStep(3)}
              >
                下一步 · 結算
              </button>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <p className="muted">記下最後輸贏就好。選一位朋友自動平帳。</p>
            <div className="settlement-list">
              {participants.map((p) => (
                <div className="settlement-row" key={p.Id}>
                  <Avatar name={p.DisplayName} url={p.AvatarImageUrl} />
                  <div className="settlement-name">
                    <b>{p.DisplayName}</b>
                    <button
                      className={`auto-toggle ${auto === p.Id ? "active" : ""}`}
                      aria-pressed={auto === p.Id}
                      onClick={() => setAuto(auto === p.Id ? "" : p.Id)}
                    >
                      {auto === p.Id ? "◎ 已選自動平帳" : "○ 自動平帳"}
                    </button>
                  </div>
                  {auto === p.Id ? (
                    <div className="auto-amount">
                      <Amount value={calculated ?? 0} />
                    </div>
                  ) : (
                    <div className="signed-input">
                      <button
                        type="button"
                        className="sign-toggle"
                        aria-label={`切換 ${p.DisplayName} 正負`}
                        onClick={() =>
                          setAmounts((v) => ({
                            ...v,
                            [p.Id]: toggleSign(v[p.Id] || ""),
                          }))
                        }
                      >
                        ±
                      </button>
                      <input
                        aria-label={`${p.DisplayName} 輸贏`}
                        inputMode="numeric"
                        pattern="[+-]?[0-9]+"
                        value={amounts[p.Id] ?? ""}
                        placeholder="0"
                        onChange={(e) =>
                          setAmounts((v) => ({ ...v, [p.Id]: e.target.value }))
                        }
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className={`balance ${total === 0n ? "balanced" : ""}`}>
              <span>{total === 0n ? "目前合計" : "還沒平帳"}</span>
              <strong>
                {total === null
                  ? "請填整數"
                  : `$${total.toLocaleString("zh-TW")}`}
              </strong>
              {total === 0n && <Icon name="check" />}
            </div>
            <div className="flow-actions">
              <button className="secondary" onClick={() => setStep(2)}>
                上一步
              </button>
              <button
                className="primary"
                disabled={total !== 0n || participants.length < 4}
                onClick={() => void submit()}
              >
                {busy ? "儲存中…" : "完成結算"}
              </button>
            </div>
          </>
        )}
      </fieldset>
      {editing && source && (
        <section className="destructive-section">
          <button
            className="destructive full"
            disabled={busy}
            onClick={() => setDeleteConfirm(true)}
          >
            刪除此牌局
          </button>
        </section>
      )}
      {deleteConfirm && source && (
        <Modal
          title="刪除此牌局？"
          onClose={() => {
            if (!busy) setDeleteConfirm(false);
          }}
        >
          <p>確定要刪除「{source.Name}」嗎？</p>
          <p className="muted">
            此牌局的結算結果也會刪除，K.O.榜與統計會重新計算。
          </p>
          <p className="muted">
            如果有綁定這場牌局的精華，精華會保留，但會解除場次連結。
          </p>
          <p>此操作無法復原。</p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="flow-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setDeleteConfirm(false)}
            >
              取消
            </button>
            <button
              className="destructive"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void onDelete()
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? "刪除中…" : "刪除"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
export function HighlightForm({
  group,
  players,
  source,
  existing,
  onBusyChange,
  onDone,
}: {
  group: Group;
  players: PlayerView[];
  source?: MobileSession;
  existing?: Highlight & {
    RecordDate: string;
    SessionName?: string | null;
    PlayerName?: string | null;
  };
  onDone: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [date, setDate] = useState(
      existing?.RecordDate || source?.RecordDate || localToday(),
    ),
    [title, setTitle] = useState(existing?.Title || ""),
    [note, setNote] = useState(existing?.Note || ""),
    [amount, setAmount] = useState(existing?.Amount?.toString() || ""),
    [player, setPlayer] = useState(existing?.PlayerId || ""),
    [session, setSession] = useState(existing?.SessionId || source?.Id || ""),
    [sessions, setSessions] = useState<MobileSession[]>([]),
    [image, setImage] = useState<{ Id: string; ImageUrl: string } | null>(
      existing?.ImageUrl
        ? {
            Id: existing.ImageUrl.split("/").pop()!,
            ImageUrl: existing.ImageUrl,
          }
        : null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [stage, setStage] = useState<ImageStage | null>(null),
    [preview, setPreview] = useState("");
  const previewRef = useRef("");
  const pending = useRef<{ Id: string } | null>(null),
    saved = useRef(false);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  useEffect(() => {
    let cancelled = false;
    api<Page<MobileSession>>(
      `/groups/${group.Id}/sessions?limit=5&date=${date}`,
    )
      .then((page) => {
        if (!cancelled) {
          setSessions(page.Items);
          if (
            !page.Items.some((s) => s.Id === session) &&
            session !== existing?.SessionId
          )
            setSession("");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      if (pending.current && !saved.current)
        void api(`/media/${pending.current.Id}`, "DELETE").catch(() => {});
    },
    [],
  );
  async function photo(file: File) {
    setBusy(true);
    setError("");
    try {
      const next = await uploadProcessedImage(
        file,
        "Highlight",
        `/api/groups/${group.Id}/images`,
        setStage,
      );
      const old = pending.current;
      pending.current = next;
      setImage(next);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = URL.createObjectURL(next.PreviewBlob);
      setPreview(previewRef.current);
      if (old) await api(`/media/${old.Id}`, "DELETE");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setStage(null);
    }
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const n = amount.trim() === "" ? null : signedInteger(amount);
          if (amount.trim() !== "" && n === null)
            throw Error("金額請填整數，可加 + 或 -。");
          const input: HighlightInput = {
            RecordDate: date,
            Title: title,
            Note: note,
            Amount: n,
            PlayerId: player || null,
            SessionId: session || null,
            ImageUrl: image?.ImageUrl || null,
          };
          if (!title.trim() && !note.trim() && n === null && !image)
            throw Error("留下一張照片、一句話，或這一把的金額。");
          setStage("LINKING_HIGHLIGHT");
          console.info(
            JSON.stringify({
              operation: "image-client",
              stage: "LINKING_HIGHLIGHT",
            }),
          );
          // Preserve the current photo without relinking another user's image when
          // an admin edits text. Existing photo removal/replacement happens on save.
          if (existing && input.ImageUrl === existing.ImageUrl)
            delete input.ImageUrl;
          await api<Highlight>(
            existing
              ? `/highlights/${existing.Id}`
              : `/groups/${group.Id}/highlights`,
            existing ? "PATCH" : "POST",
            input,
          );
          saved.current = true;
          onDone();
        } catch (e) {
          console.warn(
            JSON.stringify({
              operation: "image-client",
              stage: "LINKING_HIGHLIGHT",
              errorCategory: "HIGHLIGHT_SAVE_FAILED",
            }),
          );
          setError((e as Error).message);
        } finally {
          setBusy(false);
          setStage(null);
        }
      }}
    >
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {busy && stage && (
        <p className="image-progress" role="status" aria-live="polite">
          {imageStageLabel(stage)}
        </p>
      )}
      <fieldset disabled={busy}>
        <label>
          日期
          <input
            type="date"
            required
            disabled={!!existing}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSession("");
            }}
            onInput={(e) => {
              setDate(e.currentTarget.value);
              setSession("");
            }}
          />
        </label>
        <div className="photo-picker">
          {image ? (
            <>
              <img
                className="photo-preview"
                src={preview || image.ImageUrl}
                alt="精華照片預覽"
              />
              <button
                type="button"
                className="photo-remove icon-button"
                aria-label="移除照片"
                onClick={async () => {
                  setBusy(true);
                  try {
                    if (pending.current?.Id === image.Id)
                      await api(`/media/${image.Id}`, "DELETE");
                    setImage(null);
                    if (previewRef.current)
                      URL.revokeObjectURL(previewRef.current);
                    previewRef.current = "";
                    setPreview("");
                    pending.current = null;
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Icon name="close" />
              </button>
            </>
          ) : (
            <div className="photo-empty">
              <Icon name="photo" size={30} />
              <span>留住今晚的名場面</span>
            </div>
          )}
          <label className="upload-button">
            {image ? "替換照片" : "上傳照片"}
            <input
              type="file"
              accept="image/*"
              aria-label={image ? "替換照片" : "上傳照片"}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void photo(f);
              }}
            />
          </label>
          <small>可略過 · 一張照片就夠精彩</small>
        </div>
        <label>
          精華名稱 <span className="muted">可略過</span>
          <input
            placeholder="例如：大三元自摸"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          備註 <span className="muted">可略過</span>
          <textarea
            rows={3}
            placeholder="今晚發生了什麼？"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="two-fields">
          <label>
            主角 <span className="muted">可略過</span>
            <select value={player} onChange={(e) => setPlayer(e.target.value)}>
              <option value="">不指定牌咖</option>
              {existing?.PlayerId &&
                !players.some((p) => p.Id === existing.PlayerId) && (
                  <option value={existing.PlayerId}>
                    {existing.PlayerName || "已離開牌咖"}
                  </option>
                )}
              {players.map((p) => (
                <option key={p.Id} value={p.Id}>
                  {p.DisplayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            這一把 +/- 多少？
            <input
              inputMode="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="+8000"
            />
          </label>
        </div>
        <label>
          場次 <span className="muted">可略過</span>
          <select value={session} onChange={(e) => setSession(e.target.value)}>
            <option value="">不綁定場次</option>
            {existing?.SessionId &&
              !sessions.some((s) => s.Id === existing.SessionId) && (
                <option value={existing.SessionId}>
                  {existing.SessionName || "原場次"}
                </option>
              )}
            {sessions.map((s) => (
              <option key={s.Id} value={s.Id}>
                {s.Name} · {s.RecordDate.slice(5).replace("-", "/")}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">這一把的金額只用來記錄回憶，不計入輸贏。</p>
        <button className="primary full">
          {busy ? "處理中…" : "儲存精華"}
        </button>
      </fieldset>
    </form>
  );
}
