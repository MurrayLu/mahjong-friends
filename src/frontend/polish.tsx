import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { JoinChoices, type JoinMode } from "./membership";
import { api } from "./mobile-api";
import { Modal, Skeleton } from "./ui";
import { BrandWordmark } from "./brand";
import { rangeCanApply, inviteUrl } from "./polish-logic";
const periods = [
  ["current-month", "本月"],
  ["previous-month", "上月"],
  ["year", "今年"],
  ["all", "全部"],
];
export function RangePicker({
  dates,
  value,
  onApply,
}: {
  dates: string[];
  value: string;
  onApply: (period: string, from?: string, to?: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [custom, setCustom] = useState(false),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  return (
    <>
      <button
        className="secondary range-picker"
        onClick={() => {
          setFrom(dates[0] || "");
          setTo(dates.at(-1) || "");
          setCustom(false);
          setOpen(true);
        }}
      >
        {value} ▾
      </button>
      {open && (
        <Modal title="統計期間" onClose={() => setOpen(false)}>
          {!custom ? (
            <div className="period-options">
              {periods.map(([p, label]) => (
                <button
                  className="secondary full"
                  key={p}
                  onClick={() => {
                    onApply(p);
                    setOpen(false);
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                className="secondary full"
                disabled={!dates.length}
                onClick={() => setCustom(true)}
              >
                自訂區間
              </button>
              {!dates.length && <p className="muted">目前還沒有可統計的牌局</p>}
            </div>
          ) : (
            <>
              <label>
                開始日期
                <input
                  type="date"
                  aria-label="開始日期"
                  min={dates[0]}
                  max={dates.at(-1)}
                  value={from}
                  onInput={(e) => setFrom(e.currentTarget.value)}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                結束日期
                <input
                  type="date"
                  aria-label="結束日期"
                  min={dates[0]}
                  max={dates.at(-1)}
                  value={to}
                  onInput={(e) => setTo(e.currentTarget.value)}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              {!rangeCanApply(dates, from, to) && (
                <p role="status" className="muted">
                  {from > to
                    ? "開始日期不能晚於結束日期"
                    : "這段期間沒有對戰紀錄"}
                </p>
              )}
              <button
                className="primary full"
                disabled={!rangeCanApply(dates, from, to)}
                onClick={() => {
                  onApply("custom", from, to);
                  setOpen(false);
                }}
              >
                套用
              </button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
export function InviteSheet({
  name,
  code,
  onClose,
}: {
  name: string;
  code: string;
  onClose: () => void;
}) {
  const url = inviteUrl(location.origin, code),
    [message, setMessage] = useState(""),
    [copyFallback, setCopyFallback] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("已複製邀請連結");
      setCopyFallback(false);
    } catch {
      setMessage("無法自動複製，請長按以下連結：");
      setCopyFallback(true);
    }
  }
  return (
    <Modal title="邀請牌咖加入" onClose={onClose}>
      <div className="invite-sheet">
        <BrandWordmark />
        <h3>{name}</h3>
        <div className="invite-qr">
          <QRCodeSVG
            value={url}
            size={232}
            marginSize={4}
            title={`加入 ${name}`}
          />
        </div>
        <p className="muted qr-caption">掃描 QR Code 即可加入麻吉局。</p>
        <button className="primary full" onClick={() => void copy()}>
          複製邀請連結
        </button>
        {typeof navigator.share === "function" && (
          <button
            className="secondary full"
            onClick={() =>
              void navigator
                .share({ title: name, text: `邀請你加入 ${name}`, url })
                .catch((e) => {
                  if (e.name !== "AbortError")
                    setMessage("無法分享，請複製邀請連結。");
                })
            }
          >
            分享
          </button>
        )}
        <p role="status">{message}</p>
        {copyFallback && (
          <input
            className="invite-url"
            aria-label="手動複製邀請連結"
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
          />
        )}
      </div>
    </Modal>
  );
}
export function InviteLanding({
  code,
  busy,
  onJoin,
  onBack,
}: {
  code: string;
  busy: boolean;
  onJoin: (code: string, name: string, mode: JoinMode) => Promise<void>;
  onBack: () => void;
}) {
  const [preview, setPreview] = useState<{
      Name: string;
      MemberCount: number;
    } | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [confirm, setConfirm] = useState(false),
    [name, setName] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    api<{ Name: string; MemberCount: number }>(
      `/invites/${encodeURIComponent(code)}`,
    )
      .then((v) => {
        if (active) setPreview(v);
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
  }, [code]);
  return (
    <section className="onboarding invite-landing">
      <BrandWordmark />
      {loading ? (
        <Skeleton />
      ) : preview ? (
        <>
          <p className="eyebrow">你被邀請加入</p>
          <h1>{preview.Name}</h1>
          <p className="muted">已有 {preview.MemberCount} 人加入</p>
          <p>你想怎麼加入？</p>
          {!confirm ? (
            <JoinChoices
              busy={busy}
              onChoose={(mode) => {
                if (mode === "member") {
                  setConfirm(true);
                  return;
                }
                void onJoin(code, "", mode).catch((e) => setError(e.message));
              }}
            />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void onJoin(code, name, "member").catch((e) =>
                  setError(e.message),
                );
              }}
            >
              <label>
                你的暱稱
                <input
                  aria-label="你的暱稱"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Amy"
                  required
                  maxLength={1000}
                  autoFocus
                  disabled={busy}
                />
              </label>
              <button className="primary full" disabled={busy}>
                {busy ? "加入中…" : "加入麻吉局"}
              </button>
              <button
                type="button"
                className="text-button full"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                返回選擇
              </button>
            </form>
          )}
          <p className="small muted">不需要 Google 帳號。</p>
        </>
      ) : null}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="text-button" onClick={onBack}>
        回到首頁
      </button>
    </section>
  );
}
