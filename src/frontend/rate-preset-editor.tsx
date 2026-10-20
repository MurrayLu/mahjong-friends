import React, { useState } from "react";
import {
  defaultRateSettings,
  normalizeRateSettings,
  rateKey,
  settingsFromPresets,
  type RateSettings,
  type RatePreset,
  type RatePair,
} from "../domain/rate-presets";

export function RatePresetEditor({
  value,
  onChange,
}: {
  value: RateSettings;
  onChange: (v: RateSettings) => void;
}) {
  const [open, setOpen] = useState(false),
    [major, setMajor] = useState(""),
    [minor, setMinor] = useState(""),
    [error, setError] = useState("");
  const rates = normalizeRateSettings(value);
  function update(next: RateSettings) {
    try {
      normalizeRateSettings(next);
      onChange(next);
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "底台設定無效。");
      return false;
    }
  }
  function toggle(r: RatePreset) {
    const pair = { RateMajor: r.RateMajor, RateMinor: r.RateMinor };
    update({
      ...value,
      SelectedRates: r.IsSelected
        ? value.SelectedRates.filter((p) => rateKey(p) !== rateKey(r))
        : [...value.SelectedRates, pair],
    });
  }
  function remove(r: RatePair) {
    update({
      SelectedRates: value.SelectedRates.filter(
        (p) => rateKey(p) !== rateKey(r),
      ),
      CustomRates: value.CustomRates.filter((p) => rateKey(p) !== rateKey(r)),
    });
  }
  function add() {
    if (value.SelectedRates.length === 3) {
      setError("目前已選滿 3 組，請先取消一組再新增。");
      return;
    }
    if (!/^\d+$/.test(major.trim()) || !/^\d+$/.test(minor.trim())) {
      setError("底台必須是非負整數。");
      return;
    }
    const pair = { RateMajor: Number(major), RateMinor: Number(minor) };
    if (rates.some((r) => rateKey(r) === rateKey(pair))) {
      setError("這組底台已經存在。");
      return;
    }
    if (
      update({
        SelectedRates: [...value.SelectedRates, pair],
        CustomRates: [...value.CustomRates, pair],
      })
    ) {
      setOpen(false);
      setMajor("");
      setMinor("");
    }
  }
  return (
    <section className="rate-preset-editor" aria-label="常用底 / 台">
      <h3 className="subheading">常用底 / 台</h3>
      <p className="small muted rate-preset-help">
        選 1～3 組，新增牌局時會優先顯示。
      </p>
      <div className="chips rate-preset-chips">
        {rates.map((r) => (
          <span
            className={`rate-preset-option${r.IsCustom ? " custom-rate" : ""}`}
            key={rateKey(r)}
          >
            <button
              type="button"
              className={r.IsSelected ? "chip selected" : "chip"}
              aria-pressed={r.IsSelected}
              onClick={() => toggle(r)}
            >
              {rateKey(r)}
            </button>
            {r.IsCustom && (
              <button
                type="button"
                className="rate-preset-delete"
                aria-label={`刪除 ${rateKey(r)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(r);
                }}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <button
          type="button"
          className={open ? "chip selected" : "chip"}
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            setError("");
          }}
        >
          自訂
        </button>
      </div>
      {open && (
        <div className="rate-custom-editor">
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
          <button type="button" className="secondary" onClick={add}>
            新增
          </button>
        </div>
      )}
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function ManageRatePresets({
  rates,
  onSave,
  disabled = false,
}: {
  rates?: RatePreset[];
  onSave: (v: RateSettings) => Promise<void>;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(() =>
    rates ? settingsFromPresets(rates) : defaultRateSettings(),
  );
  return (
    <fieldset disabled={disabled}>
      <RatePresetEditor value={value} onChange={setValue} />
      <button
        type="button"
        className="secondary full"
        disabled={disabled}
        onClick={() => void onSave(value)}
      >
        儲存常用底台
      </button>
    </fieldset>
  );
}
