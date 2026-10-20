import {
  QUOTES,
  INSIGHT_COPY,
  ACHIEVEMENTS,
  GROUP_ACHIEVEMENTS,
} from "./catalog-data";
import type { EventId, FunEvent } from "./facts";
import { TITLES, type TitleDefinition } from "./title-system";
export { TITLES, type TitleDefinition } from "./title-system";
export const INSIGHT_EVENTS: EventId[] = [
  "WIN_STREAK_2",
  "WIN_STREAK_2",
  "WIN_STREAK_2",
  "WIN_STREAK_4",
  "WIN_STREAK_4",
  "WIN_STREAK_4",
  "WIN_STREAK_4",
  "LOSS_STREAK_2",
  "LOSS_STREAK_2",
  "LOSS_STREAK_4",
  "LOSS_STREAK_4",
  "LOSS_STREAK_4",
  "RECENT5_LEADER",
  "RECENT5_LEADER",
  "RECENT5_BOTTOM",
  "RECENT_FORM_STRONG",
  "NEW_PERSONAL_BEST_SESSION",
  "NEW_PERSONAL_BEST_SESSION",
  "NEW_PERSONAL_WORST_SESSION",
  "NEW_PERSONAL_WORST_SESSION",
  "NEAR_STREAK_RECORD",
  "TURN_POSITIVE",
  "TURN_POSITIVE",
  "MONTH_RANK_1",
  "RANK_IMPROVED",
  "RANK_IMPROVED",
  "HIGH_VOLATILITY",
  "HIGH_VOLATILITY",
  "ONE_HIT_DOMINANT",
  "HIGH_WIN_RATE_POSITIVE",
  "PLAYER_RETURNED_AFTER_LONG_ABSENCE",
];
export const INSIGHTS = INSIGHT_COPY.map((q, i) => ({
  ...q,
  EventId: INSIGHT_EVENTS[i],
}));
const descriptions = [
  "第一次留下自己參與的牌局紀錄",
  "累積參與三個不同麻將日",
  "累積參與五個不同麻將日",
  "累積參與十個不同麻將日",
  "累積參與二十個不同麻將日",
  "累積參與十將",
  "累積參與二十五將",
  "累積參與五十將",
  "累積參與一百將",
  "同一天累積參與兩將",
  "同一天累積參與五將",
  "同一天累積參與十將",
  "首次達成兩連勝",
  "首次達成四連勝",
  "最近五次參與至少四次正收益",
  "已有五次參與後，刷新個人單場最高正收益",
  "參與至少五個麻將日，生涯總收益為正",
  "同一月份累積由非正數轉正",
  "月份結束時累積第一，該月參與至少兩天",
  "連續兩個完整月份都是月冠軍",
  "麻吉局已有五場紀錄後，刷新最高單場正收益",
  "自己的最近五次參與累積正收益最高",
  "同一天至少兩場，有負收益但當天總計為正",
  "首次達成兩連敗",
  "首次達成四連敗",
  "月份結束時累積最後，該月參與至少兩天",
  "已有五次參與後，刷新個人最大單場虧損",
  "同一天所有牌局加總後，刷新個人歷史最大單日虧損",
  "自己的最近五次參與累積負收益最低",
  "和同一位牌咖共同參與十個不同麻將日",
  "與三位不同牌咖，各共同參與至少三個麻將日",
  "首次新增有圖片的精華",
  "累積新增五則精華",
  "累積新增十則精華",
  "首次從「我要上訴」入口建立下一場牌局",
  "有一場不輸不贏",
  "同一天不同場次，分別當最大贏家與最大輸家",
  "四連敗之後形成兩連勝",
  "完整月份結束時第一且明顯領先",
  "同月份曾是最後，月底成為第一",
];
const rarity = (value: string) =>
  ({
    一般: "Common",
    普通: "Common",
    稀有: "Rare",
    史詩: "Epic",
    傳說: "Legendary",
  })[value] || value;
export const PLAYER_ACHIEVEMENTS = ACHIEVEMENTS.map((d, i) => ({
  ...d,
  Rarity: rarity(d.Rarity),
  UserDescription: descriptions[i],
}));
export const GROUP_DEFINITIONS = GROUP_ACHIEVEMENTS.map((d, i) => ({
  ...d,
  Rarity: rarity(d.Rarity),
  UserDescription: [
    "麻吉局完成第一個麻將日",
    "累積五個不同麻將日",
    "累積二十個不同麻將日",
    "麻吉局累積一百將，每場只算一次",
    "麻吉局同一天累積十將",
    "麻吉局累積二十則精華",
    "至少四位目前牌咖都取得一個成就",
  ][i],
}));
export interface Quote {
  Id: string;
  Category: string;
  Text: string;
  AllowedSlots: readonly string[];
  EventIds: EventId[];
  Severity: number;
  MottoEligible: boolean;
  SeasonalPack: string | null;
  Enabled: boolean;
}
export const QUOTE_CATALOG: Quote[] = QUOTES.map((q) => ({
  ...q,
  EventIds:
    q.Category === "CHAMPION"
      ? q.Id === "CHAMPION_08" ? ["WIN_STREAK_2"]
        : q.Id === "CHAMPION_13" ? ["WIN_STREAK_4"]
        : q.Id === "CHAMPION_15" || q.Id === "CHAMPION_16"
          ? ["MONTH_RANK_1", "LARGE_RANK_LEAD"] : []
      : q.Category === "ROAST"
        ? [
            Number(q.Id.slice(-2)) <= 3
              ? "LOSS_STREAK_2"
              : Number(q.Id.slice(-2)) <= 7
                ? "LOSS_STREAK_4"
                : Number(q.Id.slice(-2)) <= 11
                  ? "RECENT_FORM_WEAK"
                  : Number(q.Id.slice(-2)) <= 16
                    ? "RECENT5_BOTTOM"
                    : "NEW_PERSONAL_WORST_SESSION",
          ]
        : [],
}));
export function currentTitle(events: FunEvent[]): TitleDefinition {
  const ranked = TITLES.filter(
    (t) => t.EventId !== null && events.some((e) => e.Id === t.EventId),
  );
  return (
    ranked.sort(
      (a, b) =>
        b.Priority - a.Priority ||
        newest(events, b.EventId).localeCompare(newest(events, a.EventId)) ||
        a.Id.localeCompare(b.Id),
    )[0] || {
      Id: "LEGACY_NORMAL",
      Icon: "🀄",
      Name: "正常發揮",
      Category: "STATE",
      EventId: null,
      Priority: 0,
      UserDescription: "目前沒有更符合的狀態",
    }
  );
}
const newest = (es: FunEvent[], id: EventId | null) =>
  es
    .filter((e) => e.Id === id)
    .map((e) => e.OccurredAt)
    .sort()
    .at(-1) || "";
export function hash(text: string) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function rotate(pool: Quote[], key: string, ordinal: number) {
  if (!pool.length) throw Error("Empty quote pool");
  return pool[(hash(key) + ordinal) % pool.length];
}
const ordinal = (day: string) =>
  Math.floor(Date.parse(day + "T00:00:00Z") / 86400000);
export function championQuote(
  group: string,
  day: string,
  player: string,
  events: FunEvent[],
  seasonal = true,
) {
  let pool = QUOTE_CATALOG.filter(
    (q) =>
      q.Category === "CHAMPION" && q.Enabled && (seasonal || !q.SeasonalPack),
  );
  const has = (id: EventId) => events.some((e) => e.Id === id);
  const specific = has("MONTH_RANK_1") && has("LARGE_RANK_LEAD")
    ? "LARGE_RANK_LEAD" : has("WIN_STREAK_4")
      ? "WIN_STREAK_4" : has("WIN_STREAK_2")
        ? "WIN_STREAK_2" : null;
  pool = pool.filter((q) =>
    specific ? q.EventIds.includes(specific) : q.EventIds.length === 0,
  );
  return rotate(
    pool,
    group + player + (specific || "GENERIC_CHAMPION"),
    ordinal(day),
  );
}
export function dailyPhilosophy(group: string, day: string, seasonal = true) {
  return dailyPhilosophyOrder(group, day, seasonal)[0];
}
export function dailyPhilosophyOrder(
  group: string,
  day: string,
  seasonal = true,
) {
  const pool = QUOTE_CATALOG.filter(
    (q) =>
      q.Enabled &&
      q.AllowedSlots.includes("DailyPhilosophy") &&
      (seasonal || !q.SeasonalPack),
  ).sort((a, b) => a.Id.localeCompare(b.Id));
  if (!pool.length) throw Error("Empty daily philosophy pool");
  // Seeded Fisher-Yates: the full daily browsing order is stable for this group
  // and Taipei date, while adjacent days are independently shuffled.
  let state = hash(`${group}:${day}:daily-philosophy`) || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // Prevent day boundaries from looking like a continuing carousel.
  const previousDay = new Date(Date.parse(`${day}T00:00:00+08:00`) - 86400000)
    .toISOString()
    .slice(0, 10);
  if (
    shuffled.length > 1 &&
    shuffled[0].Id === dailyPhilosophyOrderFirst(group, previousDay, pool)
  ) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }
  return shuffled;
}
function dailyPhilosophyOrderFirst(group: string, day: string, pool: Quote[]) {
  let state = hash(`${group}:${day}:daily-philosophy`) || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled[0].Id;
}
export function slotQuote(
  slot: "LoadingQuote" | "EmptyStateQuote",
  group: string,
  day: string,
  seasonal = true,
) {
  return rotate(
    QUOTE_CATALOG.filter(
      (q) =>
        q.Enabled &&
        q.AllowedSlots.includes(slot) &&
        (seasonal || !q.SeasonalPack),
    ),
    group + slot,
    ordinal(day),
  );
}
export function settlementQuote(
  group: string,
  sequence: number,
  seasonal = true,
) {
  return rotate(
    QUOTE_CATALOG.filter(
      (q) =>
        q.Category === "APPEAL" && q.Enabled && (seasonal || !q.SeasonalPack),
    ),
    group,
    sequence,
  );
}
const insightPriority: Partial<Record<EventId, number>> = {
  NEW_PERSONAL_BEST_SESSION: 100,
  NEW_PERSONAL_WORST_SESSION: 100,
  PLAYER_RETURNED_AFTER_LONG_ABSENCE: 95,
  WIN_STREAK_4: 90,
  LOSS_STREAK_4: 90,
  TURN_POSITIVE: 85,
  MONTH_RANK_1: 85,
  RANK_IMPROVED: 85,
  RANK_DROPPED: 85,
  RECENT5_LEADER: 75,
  RECENT5_BOTTOM: 75,
  RECENT_FORM_STRONG: 75,
  RECENT_FORM_WEAK: 75,
  WIN_STREAK_2: 65,
  LOSS_STREAK_2: 65,
  NEAR_STREAK_RECORD: 60,
  HIGH_VOLATILITY: 50,
  LOW_VOLATILITY_POSITIVE: 50,
  MONTH_RANK_2_CLOSE: 40,
};
const insightCategory = (id: EventId) => {
  if (["WIN_STREAK_2", "WIN_STREAK_4", "RECENT_FORM_STRONG", "RECENT5_LEADER"].includes(id)) return "positive-form";
  if (["LOSS_STREAK_2", "LOSS_STREAK_4", "RECENT_FORM_WEAK", "RECENT5_BOTTOM"].includes(id)) return "negative-form";
  if (["MONTH_RANK_1", "RANK_IMPROVED", "RANK_DROPPED", "TURN_POSITIVE"].includes(id)) return "rank-movement";
  if (["HIGH_VOLATILITY", "LOW_VOLATILITY_POSITIVE"].includes(id)) return "style";
  return id;
};
export function profileInsights(
  player: string,
  day: string,
  events: FunEvent[],
) {
  const seen = new Set<string>();
  const chosen = events
    .sort(
      (a, b) =>
        (insightPriority[b.Id] || 0) - (insightPriority[a.Id] || 0) ||
        b.OccurredAt.localeCompare(a.OccurredAt) ||
        a.Id.localeCompare(b.Id),
    )
    .filter((e) => {
      if (!INSIGHTS.some((q) => q.EventId === e.Id)) return false;
      const category = insightCategory(e.Id);
      if (seen.has(category)) return false;
      seen.add(category);
      return true;
    });
  return chosen
    .map((e) => {
      const pool = INSIGHTS.filter((q) => q.EventId === e.Id);
      if (!pool.length) return null;
      const q = pool[(hash(player + e.Id) + ordinal(day)) % pool.length];
      let Fact = q.Fact.replace(
        "{oldRank}",
        String(e.Metadata.oldRank),
      ).replace("{newRank}", String(e.Metadata.newRank));
      if (
        e.Metadata.count &&
        (e.Id.startsWith("WIN_STREAK") || e.Id.startsWith("LOSS_STREAK"))
      )
        Fact = Fact.replace(/兩|四|2|4/, String(e.Metadata.count));
      const roasts = QUOTE_CATALOG.filter(
        (r) =>
          r.Enabled &&
          r.AllowedSlots.includes("ProfileInsight") &&
          r.EventIds.includes(e.Id),
      );
      if (e.Id === "RECENT_FORM_STRONG" && e.Metadata.wins)
        Fact = Fact.replace(/四|4/, String(e.Metadata.wins));
      const flavors = e.Id === "PLAYER_RETURNED_AFTER_LONG_ABSENCE"
        ? [q.Flavor]
        : roasts.length ? roasts.map((q) => q.Text) : pool.map((q) => q.Flavor);
      let Flavor =
        flavors[(hash(player + e.Id) + ordinal(day)) % flavors.length];
      if (!roasts.length && e.Metadata.count && e.Id.startsWith("LOSS_STREAK"))
        Flavor = Flavor.replace(
          /四連敗|兩连敗|兩連敗|2 連敗|4 連敗/,
          `${e.Metadata.count}連敗`,
        );
      if (
        e.Id === "NEW_PERSONAL_BEST_SESSION" &&
        Number(e.Metadata.amount) <= 0
      )
        Fact = "你剛刷新個人單場最高收益紀錄。";
      if (
        e.Id === "NEW_PERSONAL_WORST_SESSION" &&
        Number(e.Metadata.amount) >= 0
      )
        Fact = "你剛刷新個人單場最低收益紀錄。";
      return {
        Id: q.Id,
        Title: TITLES.find((t) => t.EventId === e.Id)?.Name || "最近的紀錄",
        Fact,
        Flavor,
        EventId: e.Id,
      };
    })
    .filter((x) => x !== null)
    .slice(0, 3);
}
