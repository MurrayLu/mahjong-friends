import React, { useEffect, useRef, useState } from "react";
import { BrandMark } from "./brand";
export function Icon({
  name,
  size = 22,
}: {
  name:
    | "qr"
    | "menu"
    | "plus"
    | "back"
    | "close"
    | "chevron"
    | "crown"
    | "photo"
    | "check"
    | "users"
    | "chart"
    | "home"
    | "copy"
    | "eye"
    | "eye-slash"
    | "thumb-up"
    | "thumb-down"
    | "comment"
    | "more"
    | "link";
  size?: number;
}) {
  const paths = {
    "thumb-up":
      "M7 10v11H3V10h4zM7 10l5-7c2 0 2 2 1 6h6a2 2 0 012 2l-2 8a2 2 0 01-2 2H7",
    "thumb-down":
      "M7 14V3H3v11h4zM7 14l5 7c2 0 2-2 1-6h6a2 2 0 002-2l-2-8a2 2 0 00-2-2H7",
    comment:
      "M21 11.5a8.5 8.5 0 01-8.5 8.5H4l-2 2v-9.5A8.5 8.5 0 0110.5 4h2a8.5 8.5 0 018.5 7.5z",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    qr: "M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h-3zM21 15v6h-6",
    menu: "M4 6h16M4 12h16M4 18h16",
    plus: "M12 5v14M5 12h14",
    back: "M15 5l-7 7 7 7",
    close: "M6 6l12 12M6 18L18 6",
    chevron: "M9 5l7 7-7 7",
    crown: "M3 7l5 4 4-7 4 7 5-4-2 12H5L3 7z",
    photo: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M16 8h.01",
    check: "M5 12l4 4L19 6",
    users:
      "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M15 3a4 4 0 010 8M22 21v-2a4 4 0 00-3-3M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    chart: "M4 20V10M12 20V4M20 20v-7",
    home: "M3 11l9-8 9 8M5 10v11h14V10M9 21v-8h6v8",
    copy: "M9 9h12v12H9zM15 9V3H3v12h6",
    eye: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12zM15 12a3 3 0 11-6 0 3 3 0 016 0",
    "eye-slash":
      "M3 3l18 18M10 5a12 12 0 012 0c7 0 10 7 10 7a18 18 0 01-4 5M6 6a19 19 0 00-4 6s3 7 10 7a13 13 0 005-1M10 10a3 3 0 004 4",
    link: "M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-2 2M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l2-2",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return !failed &&
    url &&
    /^\/(images\/|api\/media\/|api\/admin\/groups\/[^/]+\/media\/)/.test(
      url,
    ) ? (
    <img
      className="avatar"
      width={size}
      height={size}
      src={url}
      alt={name}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
    />
  ) : (
    <span
      className="avatar initials"
      style={{ width: size, height: size }}
      aria-label={name}
    >
      {name.trim().slice(0, 1) || "友"}
    </span>
  );
}
export function Amount({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  return (
    <span
      className={`amount ${value > 0 ? "positive" : value < 0 ? "negative" : "neutral"} ${className}`}
    >
      {value > 0 ? "+" : ""}
      {new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(
        value,
      )}
    </span>
  );
}
let openModalCount = 0;
let originalBodyOverflow = "";
export function Modal({
  title,
  onClose,
  children,
  drawer = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    if (openModalCount++ === 0)
      originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (d.open) d.close();
      if (--openModalCount === 0)
        document.body.style.overflow = originalBodyOverflow;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={drawer ? "sheet drawer" : "sheet"}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-inner">
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="關閉" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function Empty({
  title,
  note,
  action,
}: {
  title: string;
  note: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <BrandMark className="tile-mark" />
      <h3>{title}</h3>
      <p>{note}</p>
      {action}
    </div>
  );
}
export function Skeleton() {
  return (
    <div className="skeleton" aria-label="載入麻吉局資訊">
      <div className="skeleton-hero" />
      <div className="skeleton-row" />
      <div className="skeleton-row" />
      <div className="skeleton-stats" />
      <div className="skeleton-row" />
    </div>
  );
}
