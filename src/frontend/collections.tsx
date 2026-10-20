import React, { useState } from "react";
import { Modal } from "./ui";

export function CollectionGrid({
  children,
  preview = false,
}: {
  children: React.ReactNode;
  preview?: boolean;
}) {
  return (
    <div className={preview ? "collection-preview" : "collection-grid"}>
      {children}
    </div>
  );
}
export function CollectionTile({
  icon,
  name,
  state,
  active = false,
  onClick,
  className = "",
}: {
  icon: string;
  name: string;
  state: string;
  active?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      className={`collection-tile ${active ? "active" : "quiet"} ${className}`}
      onClick={onClick}
      aria-label={`${name}，${state}，查看詳情`}
    >
      <span className="collection-emblem" aria-hidden="true">
        {icon}
      </span>
      <b>{name}</b>
      <small>{state}</small>
    </button>
  );
}
export function DetailSheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="collection-detail">{children}</div>
    </Modal>
  );
}
export type EntertainmentSection =
  | "index"
  | "activity"
  | "titles"
  | "achievements"
  | "hall"
  | "group";
export const entertainmentLinks = [
  ["activity", "🗞", "這桌動態"],
  ["titles", "🎭", "稱號圖鑑"],
  ["achievements", "🏅", "我的成就"],
  ["hall", "🏆", "牌桌名人堂"],
  ["group", "🀄", "群組成就"],
] as const;
export function EntertainmentNavigation({
  onNavigate,
  active,
  unread = 0,
}: {
  onNavigate: (page: EntertainmentSection) => void;
  active?: EntertainmentSection;
  unread?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <nav className="entertainment-navigation" aria-label="牌桌娛樂">
      <button
        className="menu-button"
        aria-expanded={expanded}
        aria-controls="entertainment-children"
        onClick={() => setExpanded((v) => !v)}
      >
        <span aria-hidden="true">🎭</span>
        <span>牌桌娛樂</span>
        <span aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
      </button>
      {expanded && (
        <div id="entertainment-children">
          {entertainmentLinks.map(([page, icon, label]) => (
            <button
              key={page}
              className="entertainment-child"
              aria-current={active === page ? "page" : undefined}
              onClick={() => onNavigate(page)}
            >
              <span aria-hidden="true">{icon}</span>
              <span>{label}</span>
              {page === "activity" && unread > 0 && <small>{unread}</small>}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
