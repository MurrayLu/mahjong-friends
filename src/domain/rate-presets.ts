import { ensure, integer } from "./rules";

export interface RatePair {
  RateMajor: number;
  RateMinor: number;
}
export interface RatePreset extends RatePair {
  IsCustom: boolean;
  IsSelected: boolean;
}
export interface RateSettings {
  SelectedRates: RatePair[];
  CustomRates: RatePair[];
}
export const BUILTIN_RATE_PRESETS: readonly RatePair[] = Object.freeze(
  [
    { RateMajor: 30, RateMinor: 10 },
    { RateMajor: 50, RateMinor: 20 },
    { RateMajor: 100, RateMinor: 20 },
    { RateMajor: 300, RateMinor: 100 },
    { RateMajor: 500, RateMinor: 200 },
  ].map((r) => Object.freeze(r)),
);
export const rateKey = (r: RatePair) => `${r.RateMajor}/${r.RateMinor}`;
export const sortRates = <T extends RatePair>(rates: readonly T[]): T[] =>
  [...rates].sort(
    (a, b) => a.RateMajor - b.RateMajor || a.RateMinor - b.RateMinor,
  );
export function defaultRateSettings(): RateSettings {
  return {
    SelectedRates: BUILTIN_RATE_PRESETS.slice(0, 3).map((r) => ({ ...r })),
    CustomRates: [],
  };
}
/** Complete replacement validated before any database writes. Missing settings only defaults on creation. */
export function normalizeRateSettings(input: unknown): RatePreset[] {
  ensure(input !== null && typeof input === "object", "請提供常用底台設定。");
  const { SelectedRates, CustomRates } = input as RateSettings;
  ensure(
    Array.isArray(SelectedRates) && SelectedRates.length >= 1,
    "至少要保留 1 組常用底台。",
  );
  ensure(SelectedRates.length <= 3, "最多設定 3 組常用底台，請先取消一組。");
  ensure(
    Array.isArray(CustomRates) && CustomRates.length <= 3,
    "最多保存 3 組自訂底台。",
  );
  const validate = (rates: RatePair[]) => {
    const keys = new Set<string>();
    for (const r of rates) {
      ensure(r !== null && typeof r === "object", "底台必須是非負整數。");
      integer(r.RateMajor, "RateMajor", 0);
      integer(r.RateMinor, "RateMinor", 0);
      ensure(!keys.has(rateKey(r)), "這組底台已經存在。");
      keys.add(rateKey(r));
    }
    return keys;
  };
  const custom = validate(CustomRates),
    selected = validate(SelectedRates);
  const builtins = new Set(BUILTIN_RATE_PRESETS.map(rateKey));
  ensure(
    [...custom].every((k) => !builtins.has(k)),
    "這組底台已經存在。",
  );
  ensure(
    [...selected].every((k) => builtins.has(k) || custom.has(k)),
    "選取的底台不存在。",
  );
  return sortRates(
    [...BUILTIN_RATE_PRESETS, ...CustomRates].map((r) => ({
      RateMajor: r.RateMajor,
      RateMinor: r.RateMinor,
      IsCustom: custom.has(rateKey(r)),
      IsSelected: selected.has(rateKey(r)),
    })),
  );
}
export function settingsFromPresets(
  rates: readonly RatePreset[],
): RateSettings {
  const pair = ({ RateMajor, RateMinor }: RatePair) => ({
    RateMajor,
    RateMinor,
  });
  return {
    SelectedRates: rates.filter((r) => r.IsSelected).map(pair),
    CustomRates: rates.filter((r) => r.IsCustom).map(pair),
  };
}
export function sessionRateChoices(rates?: readonly RatePreset[]): RatePair[] {
  return sortRates(
    (rates ?? normalizeRateSettings(defaultRateSettings())).filter(
      (r) => r.IsSelected,
    ),
  );
}
