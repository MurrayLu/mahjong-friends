import React, { useState } from "react";
import { Modal } from "./ui";

export function RoomDeletionDialog({
  room,
  busy,
  error,
  onClose,
  onDelete,
}: {
  room: { Id: string; Name: string };
  busy: boolean;
  error: string;
  onClose: () => void;
  onDelete: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <Modal
      title="再次確認刪除麻吉局"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>即將永久刪除「{room.Name}」，所有成員都會失去這個麻吉局。</p>
      <p className="muted">
        牌局、戰績、精華照片、上訴與成就紀錄將一併刪除，無法復原。其他麻吉局及個人帳號不受影響。
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && name === room.Name) onDelete(name);
        }}
      >
        <label>
          請輸入完整麻吉局名稱「{room.Name}」確認
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="flow-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button className="destructive" disabled={busy || name !== room.Name}>
            {busy ? "刪除中…" : "永久刪除麻吉局"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
