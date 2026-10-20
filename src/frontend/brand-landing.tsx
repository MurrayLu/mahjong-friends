import React from "react";
import { PublicUsageStats } from "./site-admin";
import { Icon } from "./ui";
import { BrandWordmark, BrandIllustration } from "./brand";
export function BrandLanding({
  showMenu,
  showRecovery,
  onMenu,
  onCreate,
  onJoin,
}: {
  showMenu: boolean;
  showRecovery: boolean;
  onMenu: () => void;
  onCreate: () => void;
  onJoin: () => void;
}) {
  return (
    <section className="onboarding brand-landing">
      <div className="onboard-top">
        <BrandWordmark />
        {showMenu && (
          <button
            className="icon-button"
            aria-label="開啟選單"
            onClick={onMenu}
          >
            <Icon name="menu" />
          </button>
        )}
      </div>
      <BrandIllustration />
      <p className="eyebrow">GOOD TIMES, ON THE RECORD.</p>
      <h1>這桌</h1>
      <p className="onboard-copy">
        朋友打完牌，
        <br />
        總要有人記得這桌發生過什麼。
      </p>
      <button className="primary full" onClick={onCreate}>
        <Icon name="plus" />
        開一桌
      </button>
      <p className="invite-hint">有朋友開好麻吉局了？</p>
      <button className="secondary full" onClick={onJoin}>
        <Icon name="link" />
        加入麻吉局
      </button>
      {showRecovery && (
        <div className="recovery-entry">
          <p>已有資料？</p>
          <a className="recovery-action" href="/api/auth/google">
            用 Google 找回
          </a>
        </div>
      )}
      <PublicUsageStats />
      <a className="text-button" href="/privacy">
        隱私與資料使用
      </a>
      <p className="onboard-foot">不用登入，今晚就能開桌。</p>
      <a className="text-button" href="/tools/ting">
        🀄 聽牌計算機
      </a>
    </section>
  );
}
