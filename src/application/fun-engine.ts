import { LedgerService } from "./service";
import {
  TableAppealService,
  appealResultLabel,
  type AppealSnapshot,
} from "./table-appeal";
import { ensure } from "../domain/rules";
import {
  deriveFacts,
  deriveEvents,
  taipeiDate,
  orderedSessions,
  type FunInput,
  type FunPlayer,
  type FunSession,
  type FunHighlight,
} from "../fun/facts";
import { replayAchievements, type Unlock } from "../fun/achievements";
import {
  deriveTitles,
  type SeniorityTitle,
  type TitleDefinition,
} from "../fun/title-system";
import { deriveSessionTags } from "../fun/session-tags";
import {
  PLAYER_ACHIEVEMENTS,
  GROUP_DEFINITIONS,
  QUOTE_CATALOG,
  currentTitle,
  championQuote,
  dailyPhilosophy,
  dailyPhilosophyOrder,
  profileInsights,
  settlementQuote,
  slotQuote,
} from "../fun/catalog";

interface StoredUnlock {
  Id: string;
  PlayerId?: string;
  AchievementId: string;
  UnlockedAt: string;
  IsBackfilled: number;
  RevokedAt: string | null;
  MetadataJson: string | null;
  TriggerSessionId: string | null;
}
export interface FunProjection {
  TitleSystemVersion: 3;
  FunCopyVersion: 2;
  LocalDate: string;
  Players: {
    PlayerId: string;
    EligibleTitleIds: string[];
    Title: ReturnType<typeof currentTitle>;
    Titles: TitleDefinition[];
    EligibleTitles: TitleDefinition[];
    CategoryCandidates: TitleDefinition[];
    SeniorityTitle: SeniorityTitle;
    Insights: ReturnType<typeof profileInsights>;
    Progress: {
      Days: number;
      Hands: number;
      Highlights: number;
      PartnerDays: number;
    };
  }[];
  ChampionQuotes: Record<string, string>;
  Hall: {
    Id: string;
    Name: string;
    Value: number;
    Players: { Id: string; DisplayName: string; IsArchived: number }[];
  }[];
  GroupProgress: {
    Days: number;
    Sessions: number;
    Hands: number;
    Players: number;
    Highlights: number;
  };
}
export interface FunActivity {
  Id: string;
  Type: string;
  PlayerId: string | null;
  AchievementId: string | null;
  SessionId: string | null;
  HighlightId: string | null;
  CreatedAt: string;
  MetadataJson: string | null;
  Text?: string;
  Flavor?: string;
  LocalDate?: string;
  AppealId?: string | null;
  Appeal?: AppealSnapshot | null;
}
const quote = (id: string | null) =>
  QUOTE_CATALOG.find((q) => q.Id === id) || null;
const normalizeTime = (at: string) => new Date(at).toISOString();

/** Rebuildable projections and replay are separate from the authoritative ledger. */
export class FunEngineService {
  latestSource: FunInput | null = null;
  private authorized: string | null = null;
  constructor(
    public ledger: LedgerService,
    public now = () => new Date(),
  ) {}
  get repo() {
    return this.ledger.repo;
  }
  async source(groupId: string): Promise<FunInput> {
    // Batch the independent room context; query count stays bounded for larger rosters.
    const context = await this.repo.one<{
      PlayersJson: string;
      HighlightsJson: string;
      AppealsJson: string;
    }>(
      `SELECT
      (SELECT json_group_array(json_object('Id',p.Id,'UserId',COALESCE(p.UserId,(SELECT CASE WHEN COUNT(*)=1 THEN MIN(f.UserId) ELSE NULL END FROM FunPlayerIdentity f WHERE f.PlayerId=p.Id)),'DisplayName',p.DisplayName,'AvatarImageUrl',p.AvatarImageUrl,'IsArchived',p.IsArchived,'CreatedAt',p.CreatedAt)) FROM PlayerPresentation p WHERE p.GroupId=?) AS PlayersJson,
      (SELECT json_group_array(json_object('Id',h.Id,'DayRecordId',h.DayRecordId,'CreatedAt',h.CreatedAt,'CreatedByUserId',h.CreatedByUserId,'Title',h.Title,'HasImage',(h.ImageUrl IS NOT NULL OR EXISTS(SELECT 1 FROM MediaImage m WHERE m.HighlightId=h.Id AND m.DeletedAt IS NULL)))) FROM Highlight h WHERE h.DayRecordId IN(SELECT Id FROM DayRecord WHERE GroupId=?)) AS HighlightsJson,
      (SELECT json_group_array(json_object('SessionId',SessionId,'PlayerId',PlayerId,'CreatedAt',CreatedAt)) FROM FunSessionProvenance WHERE GroupId=?) AS AppealsJson`,
      groupId,
      groupId,
      groupId,
    );
    const Players = JSON.parse(context!.PlayersJson) as FunPlayer[];
    const Highlights = JSON.parse(context!.HighlightsJson) as FunHighlight[];
    const Appeals = JSON.parse(context!.AppealsJson) as FunInput["Appeals"];
    const Sessions = await this.repo.many<FunSession & { ResultsJson: string }>(
      `SELECT s.*,d.RecordDate,(SELECT json_group_array(json_object('PlayerId',r.PlayerId,'NetAmount',r.NetAmount)) FROM SessionResult r WHERE r.SessionId=s.Id) AS ResultsJson FROM Session s JOIN DayRecord d ON d.Id=s.DayRecordId WHERE s.DayRecordId IN (SELECT Id FROM DayRecord WHERE GroupId=?) AND (SELECT COUNT(*) FROM SessionResult r WHERE r.SessionId=s.Id)>=4 AND (SELECT SUM(NetAmount) FROM SessionResult r WHERE r.SessionId=s.Id)=0`,
      groupId,
    );
    for (const s of Sessions) s.Results = JSON.parse(s.ResultsJson);
    for (const h of Highlights)
      h.CreatorPlayerId =
        [...Players]
          .filter(
            (p) => p.UserId === h.CreatedByUserId && p.CreatedAt <= h.CreatedAt,
          )
          .sort(
            (a, b) =>
              b.CreatedAt.localeCompare(a.CreatedAt) ||
              a.Id.localeCompare(b.Id),
          )[0]?.Id || null;
    return (this.latestSource = {
      GroupId: groupId,
      Players,
      Sessions,
      Highlights,
      Appeals,
    });
  }
  async observeIdentities(groupId: string) {
    await this.repo.run(
      "INSERT OR IGNORE INTO FunPlayerIdentity(PlayerId,UserId) SELECT Id,UserId FROM Player WHERE GroupId=? AND UserId IS NOT NULL AND IsGuest=0",
      groupId,
    );
  }
  async signature(groupId: string) {
    const value = await this.repo.one<Record<string, unknown>>(
      `SELECT
   (SELECT COUNT(*) FROM Session WHERE DayRecordId IN (SELECT Id FROM DayRecord WHERE GroupId=?)) AS sc,
   (SELECT MAX(UpdatedAt) FROM Session WHERE DayRecordId IN (SELECT Id FROM DayRecord WHERE GroupId=?)) AS su,
   (SELECT COUNT(*) FROM SessionResult WHERE SessionId IN (SELECT Id FROM Session WHERE DayRecordId IN (SELECT Id FROM DayRecord WHERE GroupId=?))) AS rc,
   (SELECT TOTAL(NetAmount*rowid) FROM SessionResult WHERE SessionId IN (SELECT Id FROM Session WHERE DayRecordId IN (SELECT Id FROM DayRecord WHERE GroupId=?))) AS rs,
   (SELECT COUNT(*) FROM Highlight WHERE DayRecordId IN (SELECT Id FROM DayRecord WHERE GroupId=?)) AS hc,
   (SELECT MAX(UpdatedAt) FROM Highlight WHERE DayRecordId IN (SELECT Id FROM DayRecord WHERE GroupId=?)) AS hu,
   (SELECT COUNT(*) FROM Player WHERE GroupId=?) AS pc,
   (SELECT MAX(UpdatedAt) FROM Player WHERE GroupId=?) AS pu,
   (SELECT COUNT(*) FROM MediaImage WHERE GroupId=?) AS mc,
   (SELECT COUNT(*) FROM FunSessionProvenance WHERE GroupId=?) AS ac`,
      ...Array(10).fill(groupId),
    );
    return JSON.stringify(value);
  }
  async dirty(groupId: string) {
    await this.repo.run(
      "UPDATE FunEngineState SET Dirty=1 WHERE GroupId=?",
      groupId,
    );
  }
  async ensure(
    userId: string,
    groupId: string,
    force = false,
  ): Promise<FunProjection> {
    if (this.authorized !== `${userId}:${groupId}`)
      await this.ledger.requireRoomRead(userId, groupId);
    const today = taipeiDate(this.now()),
      signature = await this.signature(groupId);
    const state = await this.repo.one<{
      SourceSignature: string;
      LocalDate: string;
      Dirty: number;
      ProjectionJson: string;
    }>("SELECT * FROM FunEngineState WHERE GroupId=?", groupId);
    const cached = state
      ? (JSON.parse(state.ProjectionJson) as Partial<FunProjection>)
      : null;
    if (
      !force &&
      state &&
      !state.Dirty &&
      state.SourceSignature === signature &&
      cached?.TitleSystemVersion === 3 &&
      cached?.FunCopyVersion === 2 &&
      Number.isFinite(cached.GroupProgress?.Sessions) &&
      Number.isFinite(cached.GroupProgress?.Players) &&
      state.LocalDate === today
    )
      return cached as FunProjection;
    if (this.authorized !== `${userId}:${groupId}`)
      await this.observeIdentities(groupId);
    const input = await this.source(groupId);
    const replay =
      force ||
      !state ||
      !!state.Dirty ||
      state.SourceSignature !== signature ||
      state.LocalDate.slice(0, 7) !== today.slice(0, 7);
    if (replay) await this.reconcile(input, today, !state);
    const projection = this.project(input, today);
    await this.repo.run(
      "INSERT INTO FunEngineState(GroupId,SourceSignature,LocalDate,ProjectionJson,Dirty,UpdatedAt) VALUES(?,?,?,?,0,?) ON CONFLICT(GroupId) DO UPDATE SET SourceSignature=excluded.SourceSignature,LocalDate=excluded.LocalDate,ProjectionJson=excluded.ProjectionJson,Dirty=0,UpdatedAt=excluded.UpdatedAt",
      groupId,
      signature,
      today,
      JSON.stringify(projection),
      this.now().toISOString(),
    );
    return projection;
  }
  project(input: FunInput, today: string): FunProjection {
    const facts = deriveFacts(input, today),
      events = deriveEvents(input, facts);
    const titlePlayers = deriveTitles(input, today);
    const Players = facts.Players.map((f) => ({
      ...titlePlayers.find((p) => p.PlayerId === f.PlayerId)!,
      PlayerId: f.PlayerId,
      EligibleTitleIds: titlePlayers
        .find((p) => p.PlayerId === f.PlayerId)!
        .EligibleTitles.map((t) => t.Id),
      Title: currentTitle(events.filter((e) => e.PlayerId === f.PlayerId)),
      Insights: profileInsights(
        f.PlayerId,
        today,
        events.filter((e) => e.PlayerId === f.PlayerId),
      ),
      Progress: {
        Days: f.Days,
        Hands: f.Hands,
        Highlights: f.Highlights,
        PartnerDays: Math.max(0, ...Object.values(f.PartnerDays)),
      },
    }));
    const ChampionQuotes = Object.fromEntries(
      facts.Players.map((f) => [
        f.PlayerId,
        championQuote(
          input.GroupId,
          today,
          f.PlayerId,
          events.filter((e) => e.PlayerId === f.PlayerId),
        ).Text,
      ]),
    );
    const hall = (
      Id: string,
      Name: string,
      values: { PlayerId: string; Value: number }[],
      minimum = false,
    ) => {
      const Value = values.length
        ? (minimum ? Math.min : Math.max)(...values.map((x) => x.Value))
        : 0;
      return {
        Id,
        Name,
        Value,
        Players: values
          .filter((x) => x.Value === Value)
          .map((x) => {
            const p = input.Players.find((p) => p.Id === x.PlayerId)!;
            return {
              Id: p.Id,
              DisplayName: p.DisplayName,
              IsArchived: p.IsArchived,
            };
          }),
      };
    };
    const fs = facts.Players.filter((f) => f.Sessions.length > 0);
    const Hall = [
      hall(
        "net",
        "累積贏最多",
        fs.map((f) => ({ PlayerId: f.PlayerId, Value: f.Net })),
      ),
      hall(
        "loss",
        "累積輸最多",
        fs.map((f) => ({ PlayerId: f.PlayerId, Value: f.Net })),
        true,
      ),
      hall(
        "best",
        "最高單場",
        fs.map((f) => ({
          PlayerId: f.PlayerId,
          Value: Math.max(...f.Amounts),
        })),
      ),
      hall(
        "worst",
        "最低單場",
        fs.map((f) => ({
          PlayerId: f.PlayerId,
          Value: Math.min(...f.Amounts),
        })),
        true,
      ),
      hall(
        "win-streak",
        "最長連勝",
        fs.map((f) => ({ PlayerId: f.PlayerId, Value: f.BestWinStreak })),
      ),
      hall(
        "loss-streak",
        "最長連敗",
        fs.map((f) => ({ PlayerId: f.PlayerId, Value: f.BestLossStreak })),
      ),
      hall(
        "days",
        "出席最多",
        fs.map((f) => ({ PlayerId: f.PlayerId, Value: f.Days })),
      ),
      hall(
        "hands",
        "打最多將",
        fs.map((f) => ({ PlayerId: f.PlayerId, Value: f.Hands })),
      ),
      hall(
        "highlights",
        "精華最多",
        facts.Players.filter((f) => f.Highlights > 0).map((f) => ({
          PlayerId: f.PlayerId,
          Value: f.Highlights,
        })),
      ),
    ];
    return {
      LocalDate: today,
      TitleSystemVersion: 3,
      FunCopyVersion: 2,
      Players,
      ChampionQuotes,
      Hall,
      GroupProgress: {
        Days: facts.GroupDays,
        Sessions: input.Sessions.length,
        Hands: facts.GroupHands,
        Players: input.Players.filter((p) => !p.IsArchived).length,
        Highlights: input.Highlights.length,
      },
    };
  }
  async reconcile(input: FunInput, today: string, backfilled: boolean) {
    const result = replayAchievements(input, today),
      now = this.now().toISOString(),
      group = input.GroupId;
    const statements = [];
    const bulk = (
      table: string,
      columns: string[],
      rows: unknown[][],
      conflict: string,
    ) => {
      if (rows.length)
        statements.push(
          this.repo.statement(
            `INSERT INTO ${table}(${columns.join(",")}) SELECT ${columns.map((_, i) => `json_extract(value,'$[${i}]')`).join(",")} FROM json_each(?) WHERE true ${conflict}`,
            JSON.stringify(rows),
          ),
        );
    };
    const activities = await this.repo.many<
      FunActivity & { InvalidatedAt: string | null }
    >("SELECT * FROM GroupActivity WHERE GroupId=?", group);
    const activityRows: unknown[][] = [];
    let issuedAt = Math.max(
      Date.parse(now) - 1,
      ...activities.map((a) => Date.parse(a.CreatedAt)),
    );
    const addActivity = (
      id: string,
      type: string,
      p: string | null,
      ach: string | null,
      s: string | null,
      h: string | null,
      at: string,
      metadata: Record<string, unknown>,
    ) =>
      activityRows.push([
        id,
        group,
        type,
        p,
        ach,
        s,
        h,
        activities.find((a) => a.Id === id)?.CreatedAt ||
          new Date(++issuedAt).toISOString(),
        JSON.stringify({ ...metadata, EffectiveAt: normalizeTime(at) }),
        null,
      ]);
    const validIds: string[] = [];
    for (const [table, unlocks] of [
      ["PlayerAchievement", result.Player],
      ["GroupAchievement", result.Group],
    ] as const) {
      const existing = await this.repo.many<
        StoredUnlock & { CreatedAt: string }
      >("SELECT * FROM " + table + " WHERE GroupId=?", group);
      // An observed all-active-player milestone survives later roster archives. Its source achievements still must be historically valid.
      if (table === "GroupAchievement") {
        const prior = existing.find(
          (a) => a.AchievementId === "G07" && !a.RevokedAt,
        );
        const ids: unknown =
          prior && JSON.parse(prior.MetadataJson || "{}").playerIds;
        if (
          prior &&
          Array.isArray(ids) &&
          ids.length >= 4 &&
          (!unlocks.some((u) => u.AchievementId === "G07") ||
            Date.parse(prior.UnlockedAt) <
              Date.parse(
                unlocks.find((u) => u.AchievementId === "G07")!.UnlockedAt,
              )) &&
          ids.every((id) =>
            result.Player.some(
              (a) =>
                a.PlayerId === id &&
                Date.parse(a.UnlockedAt) <= Date.parse(prior.UnlockedAt),
            ),
          )
        ) {
          const index = unlocks.findIndex((u) => u.AchievementId === "G07");
          if (index >= 0) unlocks.splice(index, 1);
          unlocks.push({
            PlayerId: null,
            AchievementId: "G07",
            UnlockedAt: prior.UnlockedAt,
            TriggerSessionId: prior.TriggerSessionId,
            TriggerDayRecordId: null,
            Metadata: { playerIds: ids },
          });
        }
      }
      const key = (u: { PlayerId?: string | null; AchievementId: string }) =>
        (u.PlayerId || "GROUP") + u.AchievementId;
      const rows: unknown[][] = [];
      for (const u of unlocks) {
        const old = existing.find((a) => key(a) === key(u)),
          id = group + ":" + key(u),
          at = normalizeTime(u.UnlockedAt);
        validIds.push(id);
        const source =
          u.TriggerSessionId ||
          (typeof u.Metadata.provenanceSessionId === "string"
            ? u.Metadata.provenanceSessionId
            : null);
        u.Metadata = {
          ...u.Metadata,
          FirstIssuedSessionId: old
            ? (JSON.parse(old.MetadataJson || "{}").FirstIssuedSessionId ??
              old.TriggerSessionId)
            : source,
        };
        rows.push([
          id,
          group,
          ...(table === "PlayerAchievement" ? [u.PlayerId] : []),
          u.AchievementId,
          at,
          source,
          u.TriggerDayRecordId,
          old?.IsBackfilled ?? Number(backfilled),
          JSON.stringify(u.Metadata),
          old?.CreatedAt || now,
          now,
          null,
        ]);
        if (
          !backfilled &&
          (!old || old.RevokedAt || activities.some((a) => a.Id === id))
        )
          addActivity(
            id,
            table === "PlayerAchievement"
              ? "PLAYER_ACHIEVEMENT_UNLOCKED"
              : "GROUP_ACHIEVEMENT_UNLOCKED",
            u.PlayerId,
            u.AchievementId,
            source,
            null,
            at,
            u.Metadata,
          );
      }
      const columns = [
        "Id",
        "GroupId",
        ...(table === "PlayerAchievement" ? ["PlayerId"] : []),
        "AchievementId",
        "UnlockedAt",
        "TriggerSessionId",
        "TriggerDayRecordId",
        "IsBackfilled",
        "MetadataJson",
        "CreatedAt",
        "UpdatedAt",
        "RevokedAt",
      ];
      bulk(
        table,
        columns,
        rows,
        "ON CONFLICT(Id) DO UPDATE SET UnlockedAt=excluded.UnlockedAt,TriggerSessionId=excluded.TriggerSessionId,TriggerDayRecordId=excluded.TriggerDayRecordId,MetadataJson=excluded.MetadataJson,UpdatedAt=excluded.UpdatedAt,RevokedAt=NULL",
      );
      statements.push(
        this.repo.statement(
          `UPDATE ${table} SET RevokedAt=?,UpdatedAt=? WHERE GroupId=? AND RevokedAt IS NULL AND Id NOT IN(SELECT value FROM json_each(?))`,
          now,
          now,
          group,
          JSON.stringify(rows.map((r) => r[0])),
        ),
      );
    }
    statements.push(
      this.repo.statement(
        "UPDATE GroupActivity SET InvalidatedAt=? WHERE GroupId=? AND Type IN ('PLAYER_ACHIEVEMENT_UNLOCKED','GROUP_ACHIEVEMENT_UNLOCKED') AND Id NOT IN(SELECT value FROM json_each(?))",
        now,
        group,
        JSON.stringify(validIds),
      ),
    );
    for (const p of input.Players) {
      const id = group + ":backfill:" + p.Id,
        old = activities.find((a) => a.Id === id);
      if (backfilled || old) {
        const count = result.Player.filter(
          (a) =>
            a.PlayerId === p.Id &&
            (backfilled ||
              !activities.some(
                (e) => e.Id === group + ":" + p.Id + a.AchievementId,
              )),
        ).length;
        if (count)
          addActivity(
            id,
            "ACHIEVEMENT_BACKFILL_SUMMARY",
            p.Id,
            null,
            null,
            null,
            old?.CreatedAt || now,
            { count },
          );
        else if (old)
          activityRows.push([
            id,
            group,
            old.Type,
            p.Id,
            null,
            null,
            null,
            old.CreatedAt,
            JSON.stringify({ count: 0 }),
            now,
          ]);
      }
    }
    const observations = await this.repo.many<{ SourceId: string }>(
        "SELECT SourceId FROM FunSourceObservation WHERE GroupId=?",
        group,
      ),
      seen = new Set(observations.map((o) => o.SourceId));
    const records: unknown[][] = [],
      recordIds: string[] = [];
    const sourceObserved = (id: string) => {
      records.push([group, id]);
      return seen.has(id);
    };
    for (const e of result.Records) {
      const source = input.Sessions.find((s) => s.Id === e.TriggerSessionId)!;
      const id = group + ":record:" + e.PlayerId + ":" + source.Id;
      recordIds.push(id);
      const observed = sourceObserved(id);
      if (!backfilled && (!observed || activities.some((a) => a.Id === id)))
        addActivity(
          id,
          "PLAYER_RECORD_BROKEN",
          e.PlayerId,
          null,
          source.Id,
          null,
          source.RecordDate + "T00:00:00+08:00",
          {
            kind: e.Id.includes("BEST") ? "BEST" : "WORST",
            amount: e.Metadata.amount,
          },
        );
    }
    for (const h of input.Highlights) {
      const id = group + ":highlight:" + h.Id;
      recordIds.push(id);
      const observed = sourceObserved(id);
      if (!backfilled && (!observed || activities.some((a) => a.Id === id)))
        addActivity(
          id,
          "HIGHLIGHT_CREATED",
          h.CreatorPlayerId === undefined
            ? input.Players.find((p) => p.UserId === h.CreatedByUserId)?.Id ||
                null
            : h.CreatorPlayerId,
          null,
          null,
          h.Id,
          h.CreatedAt,
          { Title: h.Title },
        );
    }
    statements.push(
      this.repo.statement(
        "UPDATE GroupActivity SET InvalidatedAt=? WHERE GroupId=? AND Type IN ('PLAYER_RECORD_BROKEN','HIGHLIGHT_CREATED') AND Id NOT IN(SELECT value FROM json_each(?))",
        now,
        group,
        JSON.stringify(recordIds),
      ),
    );
    bulk(
      "GroupActivity",
      [
        "Id",
        "GroupId",
        "Type",
        "PlayerId",
        "AchievementId",
        "SessionId",
        "HighlightId",
        "CreatedAt",
        "MetadataJson",
        "InvalidatedAt",
      ],
      activityRows,
      "ON CONFLICT(Id) DO UPDATE SET CreatedAt=CASE WHEN GroupActivity.InvalidatedAt IS NOT NULL THEN excluded.CreatedAt ELSE GroupActivity.CreatedAt END,SessionId=excluded.SessionId,MetadataJson=excluded.MetadataJson,InvalidatedAt=excluded.InvalidatedAt",
    );
    bulk(
      "FunSourceObservation",
      ["GroupId", "SourceId"],
      records,
      "ON CONFLICT(GroupId,SourceId) DO NOTHING",
    );
    bulk(
      "ClosedMonthEvaluationState",
      ["GroupId", "Month", "EvaluatedAt"],
      result.ClosedMonths.map((m) => [group, m, now]),
      "ON CONFLICT(GroupId,Month) DO NOTHING",
    );
    // A bounded number of JSON bulk statements keeps replay within the Free plan query limit.
    if (statements.length) await this.repo.batch(statements);
  }
  async activity(
    groupId: string,
    id: string,
    type: string,
    playerId: string | null,
    achievementId: string | null,
    sessionId: string | null,
    highlightId: string | null,
    at: string,
    metadata: Record<string, unknown>,
  ) {
    await this.repo.run(
      `INSERT INTO GroupActivity(Id,GroupId,Type,PlayerId,AchievementId,SessionId,HighlightId,CreatedAt,MetadataJson) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(Id) DO UPDATE SET CreatedAt=excluded.CreatedAt,MetadataJson=excluded.MetadataJson,InvalidatedAt=NULL`,
      id,
      groupId,
      type,
      playerId,
      achievementId,
      sessionId,
      highlightId,
      normalizeTime(at),
      JSON.stringify(metadata),
    );
  }
  async prepareMutation(userId: string, groupId: string, settlement = false) {
    await this.ledger.requireRoomRead(userId, groupId);
    this.authorized = `${userId}:${groupId}`;
    const state = await this.repo.one(
      "SELECT 1 FROM FunEngineState WHERE GroupId=?",
      groupId,
    );
    if (!state && settlement) {
      await this.observeIdentities(groupId);
      await this.reconcile(
        await this.source(groupId),
        taipeiDate(this.now()),
        true,
      );
      await this.repo.run(
        "INSERT OR IGNORE INTO FunEngineState(GroupId,SourceSignature,LocalDate,ProjectionJson,Dirty,UpdatedAt) VALUES(?,?,?, ?,1,?)",
        groupId,
        "",
        taipeiDate(this.now()),
        "{}",
        this.now().toISOString(),
      );
    } else if (!state) await this.ensure(userId, groupId);
    else await this.observeIdentities(groupId);
    return !state;
  }
  async mutation(userId: string, groupId: string, _highlightId?: string) {
    await this.dirty(groupId);
    await this.ensure(userId, groupId);
  }
  async home(userId: string, groupId: string) {
    const projection = await this.ensure(userId, groupId);
    const representatives = await this.representativeAchievements(groupId);
    const philosophy = dailyPhilosophy(groupId, projection.LocalDate);
    const identities = await this.repo.many<{
      Id: string;
      DisplayName: string;
    }>(
      "SELECT Id,DisplayName FROM PlayerPresentation WHERE GroupId=?",
      groupId,
    );
    const names = new Map(
      identities.map((player) => [player.Id, player.DisplayName]),
    );
    return {
      ...projection,
      RepresentativeAchievements: representatives,
      Hall: projection.Hall.map((entry) => ({
        ...entry,
        Players: entry.Players.map((player) => ({
          ...player,
          DisplayName: names.get(player.Id) ?? player.DisplayName,
        })),
      })),
      UnreadCount: await this.unread(userId, groupId),
      DailyPhilosophy: philosophy,
      DailyPhilosophyPool: dailyPhilosophyOrder(groupId, projection.LocalDate),
      LoadingQuote: slotQuote("LoadingQuote", groupId, projection.LocalDate),
    };
  }
  async representativeAchievements(
    groupId: string,
  ): Promise<Record<string, { Id: string; Icon: string; Name: string }>> {
    const selected = await this.repo.many<{
      PlayerId: string;
      AchievementId: string;
    }>(
      `SELECT p.Id AS PlayerId, f.RepresentativeAchievementId AS AchievementId
       FROM PlayerPresentation p
       JOIN PlayerFunProfile f ON f.PlayerId=p.Id
       JOIN PlayerAchievement a ON a.PlayerId=p.Id AND a.GroupId=p.GroupId
         AND a.AchievementId=f.RepresentativeAchievementId AND a.RevokedAt IS NULL
       WHERE p.GroupId=? AND f.RepresentativeAchievementId IS NOT NULL`,
      groupId,
    );
    return Object.fromEntries(
      selected.flatMap(({ PlayerId, AchievementId }) => {
        const achievement = PLAYER_ACHIEVEMENTS.find(
          (a) => a.Id === AchievementId,
        );
        return achievement
          ? [
              [
                PlayerId,
                {
                  Id: achievement.Id,
                  Icon: achievement.Icon,
                  Name: achievement.Name,
                },
              ],
            ]
          : [];
      }),
    );
  }
  async player(userId: string, groupId: string, playerId: string) {
    const projection = await this.ensure(userId, groupId),
      p = projection.Players.find((p) => p.PlayerId === playerId);
    ensure(p, "PlayerNotFound", 404);
    const profile = await this.repo.one<{
      RepresentativeAchievementId: string | null;
    }>(
      "SELECT RepresentativeAchievementId FROM PlayerFunProfile WHERE PlayerId=?",
      playerId,
    );
    const identity = await this.repo.one<{
      UserId: string | null;
      DisplayName: string;
      AvatarImageUrl: string | null;
      MottoQuoteId: string | null;
    }>(
      "SELECT p.UserId,p.DisplayName,p.AvatarImageUrl,u.MottoQuoteId FROM PlayerPresentation p LEFT JOIN UserAccount u ON u.Id=p.UserId WHERE p.Id=? AND p.GroupId=?",
      playerId,
      groupId,
    );
    const achievements = await this.achievements(groupId, playerId);
    const representative =
      achievements.find(
        (a) => a.Id === profile?.RepresentativeAchievementId && a.Unlocked,
      ) || null;
    if (profile?.RepresentativeAchievementId && !representative)
      await this.repo.run(
        "UPDATE PlayerFunProfile SET RepresentativeAchievementId=NULL,UpdatedAt=? WHERE PlayerId=?",
        this.now().toISOString(),
        playerId,
      );
    const count = await this.repo.one<{ Count: number }>(
      "SELECT COUNT(*) AS Count FROM PlayerAchievement WHERE PlayerId=? AND IsBackfilled=1 AND RevokedAt IS NULL",
      playerId,
    );
    return {
      ...p,
      DisplayName: identity?.DisplayName || null,
      AvatarImageUrl: identity?.AvatarImageUrl || null,
      Motto: quote(identity?.UserId ? identity.MottoQuoteId : null),
      RepresentativeAchievement: representative,
      BackfilledCount: count?.Count || 0,
      Achievements: achievements,
    };
  }
  async achievements(groupId: string, playerId: string | null) {
    const rows = await this.repo.many<StoredUnlock>(
      `SELECT * FROM ${playerId ? "PlayerAchievement" : "GroupAchievement"} WHERE GroupId=? ${playerId ? "AND PlayerId=?" : ""} AND RevokedAt IS NULL`,
      groupId,
      ...(playerId ? [playerId] : []),
    );
    return (playerId ? PLAYER_ACHIEVEMENTS : GROUP_DEFINITIONS).map((d) => {
      const row = rows.find((a) => a.AchievementId === d.Id);
      if (d.Hidden && !row)
        return {
          Id: d.Id,
          Name: "???",
          Icon: "🔒",
          UserDescription: "尚未揭曉",
          Rarity: d.Rarity,
          Hidden: true,
          Unlocked: false,
          UnlockedAt: null,
          ProgressType: null,
        };
      return {
        Id: d.Id,
        Name: d.Name,
        Icon: d.Icon,
        UserDescription: d.UserDescription,
        Rarity: d.Rarity,
        Hidden: d.Hidden,
        Unlocked: !!row,
        UnlockedAt: row?.UnlockedAt || null,
        ProgressType: (d.Id === "A30" ? "PartnerDays" : d.ProgressType) as
          string | null,
        Category: d.Hidden && !row ? "隱藏" : d.Category,
        UnlockCopy: row ? d.UnlockCopy : null,
      };
    });
  }
  async library(userId: string) {
    const favorites = await this.repo.many<{ QuoteId: string }>(
      "SELECT QuoteId FROM UserQuoteFavorite WHERE UserId=?",
      userId,
    );
    return QUOTE_CATALOG.filter((q) => q.Enabled && q.MottoEligible).map(
      (q) => ({ ...q, Favorite: favorites.some((f) => f.QuoteId === q.Id) }),
    );
  }
  async favorite(userId: string, id: string, selected: boolean) {
    ensure(quote(id), "QuoteNotFound", 404);
    if (selected) ensure(quote(id)?.Enabled, "QuoteNotFound", 404);
    if (selected)
      await this.repo.run(
        "INSERT OR IGNORE INTO UserQuoteFavorite VALUES(?,?,?)",
        userId,
        id,
        this.now().toISOString(),
      );
    else
      await this.repo.run(
        "DELETE FROM UserQuoteFavorite WHERE UserId=? AND QuoteId=?",
        userId,
        id,
      );
    return { ok: true };
  }
  async motto(
    userId: string,
    groupId: string,
    playerId: string,
    id: string | null,
  ) {
    await this.ledger.requireRoomWrite(userId, groupId);
    const owner = await this.repo.one(
      "SELECT 1 FROM Player WHERE Id=? AND GroupId=? AND UserId=? AND IsGuest=0 AND IsArchived=0",
      playerId,
      groupId,
      userId,
    );
    ensure(owner, "MottoOwnerRequired", 403);
    ensure(
      id === null || (quote(id)?.Enabled && quote(id)?.MottoEligible),
      "QuoteNotMottoEligible",
    );
    await this.setAccountMotto(userId, id);
    return { Motto: quote(id) };
  }
  async setAccountMotto(userId: string, id: string | null) {
    ensure(
      id === null || !!(quote(id)?.Enabled && quote(id)?.MottoEligible),
      "QuoteNotMottoEligible",
    );
    await this.repo.run(
      "UPDATE UserAccount SET MottoQuoteId=?,UpdatedAt=? WHERE Id=?",
      id,
      this.now().toISOString(),
      userId,
    );
    return { Motto: quote(id) };
  }
  async representative(
    userId: string,
    groupId: string,
    playerId: string,
    id: string | null,
  ) {
    await this.ledger.requireRoomRead(userId, groupId);
    ensure(
      id === null || (typeof id === "string" && id.length > 0),
      "InvalidRepresentativeAchievement",
    );
    ensure(
      await this.repo.one(
        "SELECT 1 FROM Player WHERE Id=? AND GroupId=? AND UserId=? AND IsGuest=0 AND IsArchived=0",
        playerId,
        groupId,
        userId,
      ),
      "RepresentativeOwnerRequired",
      403,
    );
    if (id !== null)
      ensure(
        await this.repo.one(
          "SELECT 1 FROM PlayerAchievement WHERE GroupId=? AND PlayerId=? AND AchievementId=? AND RevokedAt IS NULL",
          groupId,
          playerId,
          id,
        ),
        "RepresentativeAchievementLocked",
        409,
      );
    await this.repo.run(
      "INSERT INTO PlayerFunProfile(PlayerId,MottoQuoteId,UpdatedAt,RepresentativeAchievementId) VALUES(?,NULL,?,?) ON CONFLICT(PlayerId) DO UPDATE SET RepresentativeAchievementId=excluded.RepresentativeAchievementId,UpdatedAt=excluded.UpdatedAt",
      playerId,
      this.now().toISOString(),
      id,
    );
    return { RepresentativeAchievementId: id };
  }
  async unread(userId: string, groupId: string) {
    const row = await this.repo.one<{ Count: number }>(
      `SELECT COUNT(*) AS Count FROM GroupActivity a LEFT JOIN GroupActivityReadState r ON r.GroupId=a.GroupId AND r.UserId=? WHERE a.GroupId=? AND a.InvalidatedAt IS NULL AND (r.UserId IS NULL OR a.CreatedAt>r.LastSeenActivityAt OR (a.CreatedAt=r.LastSeenActivityAt AND a.Id>r.LastSeenActivityId))`,
      userId,
      groupId,
    );
    return row?.Count || 0;
  }
  async activities(userId: string, groupId: string, offset = 0) {
    await this.ensure(userId, groupId);
    ensure(Number.isSafeInteger(offset) && offset >= 0, "InvalidOffset");
    const rows = await this.repo.many<FunActivity>(
      "SELECT * FROM GroupActivity WHERE GroupId=? AND InvalidatedAt IS NULL ORDER BY CreatedAt DESC,Id DESC LIMIT 21 OFFSET ?",
      groupId,
      offset,
    );
    const players = await this.repo.many<{ Id: string; DisplayName: string }>(
      "SELECT Id,DisplayName FROM PlayerPresentation WHERE GroupId=?",
      groupId,
    );
    return {
      Items: await Promise.all(
        rows.slice(0, 20).map(async (a) => {
          const appeal =
            a.Type === "TABLE_APPEAL" && a.AppealId
              ? await new TableAppealService(this.ledger).get(
                  userId,
                  a.AppealId,
                )
              : null;
          const { MetadataJson, ...publicActivity } = a;
          return {
            ...publicActivity,
            LocalDate: taipeiDate(new Date(a.CreatedAt)),
            Text: appeal
              ? `⚖️ ${appeal.CreatedByDisplayName}的上訴`
              : this.activityText(a, players),
            Flavor: appeal
              ? appeal.Status === "ACTIVE"
                ? appeal.ReadyAt
                  ? "人到齊了"
                  : `${appeal.Support.Count} 人想再打`
                : `結果：${appealResultLabel[appeal.FinalResult!]}`
              : this.activityFlavor(a),
            Appeal: appeal,
          };
        }),
      ),
      HasMore: rows.length > 20,
    };
  }
  activityText(a: FunActivity, players: { Id: string; DisplayName: string }[]) {
    const name =
        players.find((p) => p.Id === a.PlayerId)?.DisplayName || "這桌",
      metadata = JSON.parse(a.MetadataJson || "{}");
    if (a.Type === "ACHIEVEMENT_BACKFILL_SUMMARY")
      return `${name} 的老戰績解鎖了 ${metadata.count} 個成就。`;
    if (a.Type === "HIGHLIGHT_CREATED") return `${name} 留下了一則精華。`;
    if (a.Type === "PLAYER_RECORD_BROKEN")
      return `${name} 刷新了個人單場${metadata.kind === "BEST" ? "最高" : "最低"}紀錄：${metadata.amount > 0 ? "+" : ""}${metadata.amount}。`;
    const def = [...PLAYER_ACHIEVEMENTS, ...GROUP_DEFINITIONS].find(
      (d) => d.Id === a.AchievementId,
    );
    return `${name} 解鎖了 ${def?.Icon || ""} ${def?.Name || "成就"}。`;
  }
  activityFlavor(a: FunActivity) {
    const m = JSON.parse(a.MetadataJson || "{}");
    if (a.Type === "HIGHLIGHT_CREATED")
      return typeof m.Title === "string" ? m.Title : null;
    if (a.AchievementId)
      return (
        [...PLAYER_ACHIEVEMENTS, ...GROUP_DEFINITIONS].find(
          (d) => d.Id === a.AchievementId,
        )?.UnlockCopy || null
      );
    return null;
  }
  async seen(userId: string, groupId: string) {
    await this.ledger.requireRoomRead(userId, groupId);
    const latest = await this.repo.one<{ CreatedAt: string; Id: string }>(
      "SELECT CreatedAt,Id FROM GroupActivity WHERE GroupId=? AND InvalidatedAt IS NULL ORDER BY CreatedAt DESC,Id DESC LIMIT 1",
      groupId,
    );
    if (latest)
      await this.repo.run(
        "INSERT INTO GroupActivityReadState VALUES(?,?,?,?,?) ON CONFLICT(GroupId,UserId) DO UPDATE SET LastSeenActivityAt=excluded.LastSeenActivityAt,LastSeenActivityId=excluded.LastSeenActivityId,UpdatedAt=excluded.UpdatedAt",
        groupId,
        userId,
        latest.CreatedAt,
        latest.Id,
        this.now().toISOString(),
      );
    return { ok: true };
  }
  async completion(userId: string, groupId: string, sessionId: string) {
    await this.ensure(userId, groupId);
    const scoped = await this.ledger.scopedSession(userId, sessionId);
    ensure(scoped.GroupId === groupId, "SessionNotFound", 404);
    const sequence = await this.repo.one<{ Count: number }>(
      "SELECT COUNT(*) AS Count FROM Session WHERE DayRecordId IN (SELECT Id FROM DayRecord WHERE GroupId=?) AND (CreatedAt,Id)<=(SELECT CreatedAt,Id FROM Session WHERE Id=?)",
      groupId,
      sessionId,
    );
    const rows = await this.repo.many<StoredUnlock & { DisplayName: string }>(
      "SELECT a.*,p.DisplayName FROM PlayerAchievement a JOIN PlayerPresentation p ON p.Id=a.PlayerId WHERE a.GroupId=? AND json_extract(a.MetadataJson,'$.FirstIssuedSessionId')=? AND a.RevokedAt IS NULL AND a.IsBackfilled=0",
      groupId,
      sessionId,
    );
    const groups = await this.repo.many<StoredUnlock>(
      "SELECT * FROM GroupAchievement WHERE GroupId=? AND json_extract(MetadataJson,'$.FirstIssuedSessionId')=? AND RevokedAt IS NULL AND IsBackfilled=0",
      groupId,
      sessionId,
    );
    const source = await this.source(groupId);
    const tags = deriveSessionTags(source.Sessions)[sessionId] || {};
    return {
      SessionTags: Object.entries(tags).flatMap(([PlayerId, Tags]) =>
        Tags.filter((t) => t.Priority >= 60)
          .slice(0, 2)
          .map((Tag) => ({
            PlayerId,
            PlayerName:
              source.Players.find((p) => p.Id === PlayerId)?.DisplayName ||
              "牌咖",
            Tag,
          })),
      ),
      SettlementQuote: settlementQuote(groupId, sequence?.Count || 0).Text,
      NewlyUnlocked: [...rows, ...groups].map((a) => {
        const d =
          PLAYER_ACHIEVEMENTS.find((d) => d.Id === a.AchievementId) ||
          GROUP_DEFINITIONS.find((d) => d.Id === a.AchievementId);
        return {
          Id: a.AchievementId,
          PlayerId: a.PlayerId || null,
          PlayerName: "DisplayName" in a ? String(a.DisplayName) : "這桌",
          Name: d?.Name || "成就",
          Icon: d?.Icon || "🏅",
          UnlockCopy: d?.UnlockCopy || "",
        };
      }),
    };
  }
}

export class FunEngineBackfillService {
  constructor(public engine: FunEngineService) {}
  async rebuild(userId: string, groupId: string) {
    await this.engine.ledger.requireRoomAdmin(userId, groupId);
    await this.engine.ensure(userId, groupId, true);
    const rows = await this.engine.repo.one<{
      PlayerUnlocks: number;
      GroupUnlocks: number;
    }>(
      `SELECT (SELECT COUNT(*) FROM PlayerAchievement WHERE GroupId=? AND RevokedAt IS NULL) AS PlayerUnlocks,(SELECT COUNT(*) FROM GroupAchievement WHERE GroupId=? AND RevokedAt IS NULL) AS GroupUnlocks`,
      groupId,
      groupId,
    );
    return { GroupId: groupId, ...rows };
  }
}
