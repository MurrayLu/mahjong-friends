import { dayShift, sum, type FunInput } from "./facts";

export interface InactivityFacts {
  PlayerId: string;
  PlayerHasHistoricalParticipation: boolean;
  PlayerLastParticipationDate: string | null;
  DaysSinceLastParticipation: number | null;
  RoomLastSettledSessionDate: string | null;
  RoomRecentlyActiveAfterPlayerLastParticipation: boolean;
}

/** RecordDate is the engine's authoritative Taipei LocalDate, not CreatedAt's UTC day. */
export function deriveInactivityFacts(
  input: FunInput,
  today: string,
): InactivityFacts[] {
  // Same settlement qualification as FunEngineService.source. Future record days cannot
  // qualify (or replace a past last-participation day) in an historical evaluation.
  const sessions = input.Sessions.filter(
    (s) =>
      s.RecordDate <= today &&
      s.Results.length >= 4 &&
      sum(s.Results.map((r) => r.NetAmount)) === 0,
  );
  const latest = (dates: string[]) => [...dates].sort().at(-1) ?? null;
  const RoomLastSettledSessionDate = latest(sessions.map((s) => s.RecordDate));
  const cutoff = dayShift(today, -13);
  return input.Players.map((player) => {
    const PlayerLastParticipationDate = latest(
      sessions
        .filter((s) => s.Results.some((r) => r.PlayerId === player.Id))
        .map((s) => s.RecordDate),
    );
    return {
      PlayerId: player.Id,
      PlayerHasHistoricalParticipation: PlayerLastParticipationDate !== null,
      PlayerLastParticipationDate,
      DaysSinceLastParticipation:
        PlayerLastParticipationDate === null
          ? null
          : (Date.parse(today + "T00:00:00Z") -
              Date.parse(PlayerLastParticipationDate + "T00:00:00Z")) /
            86400000,
      RoomLastSettledSessionDate,
      RoomRecentlyActiveAfterPlayerLastParticipation:
        PlayerLastParticipationDate !== null &&
        sessions.some(
          (s) =>
            s.RecordDate > PlayerLastParticipationDate &&
            s.RecordDate >= cutoff &&
            !s.Results.some((r) => r.PlayerId === player.Id),
        ),
    };
  });
}
