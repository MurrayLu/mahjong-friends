export interface AnalysisSession {
  SessionId: string;
  SessionName: string;
  RecordDate: string;
  CreatedAt: string;
  NetAmount: number;
}
export interface AnalysisPlayer {
  PlayerId: string;
  DisplayName: string;
  AvatarImageUrl: string | null;
  IsArchived: number;
}
export function derivePlayerAnalysis(
  player: AnalysisPlayer,
  rows: AnalysisSession[],
  period: { Period: string; From: string | null; To: string | null },
  ranking: { Rank: number | null; ActivePlayerCount: number },
) {
  const ordered = [...rows].sort(
    (a, b) =>
      a.RecordDate.localeCompare(b.RecordDate) ||
      a.CreatedAt.localeCompare(b.CreatedAt) ||
      a.SessionId.localeCompare(b.SessionId),
  );
  let cumulative = 0,
    win = 0,
    loss = 0,
    maxWin = 0,
    maxLoss = 0;
  const Trend = ordered.map((r) => {
    win = r.NetAmount > 0 ? win + 1 : 0;
    loss = r.NetAmount < 0 ? loss + 1 : 0;
    maxWin = Math.max(maxWin, win);
    maxLoss = Math.max(maxLoss, loss);
    cumulative += r.NetAmount;
    return {
      SessionId: r.SessionId,
      SessionName: r.SessionName,
      RecordDate: r.RecordDate,
      NetAmount: r.NetAmount,
      CumulativeNet: cumulative,
    };
  });
  const best = ordered.reduce<AnalysisSession | null>(
    (a, r) => (!a || r.NetAmount > a.NetAmount ? r : a),
    null,
  );
  const worst = ordered.reduce<AnalysisSession | null>(
    (a, r) => (!a || r.NetAmount < a.NetAmount ? r : a),
    null,
  );
  const project = (r: AnalysisSession | null) =>
    r
      ? {
          SessionId: r.SessionId,
          SessionName: r.SessionName,
          RecordDate: r.RecordDate,
          NetAmount: r.NetAmount,
        }
      : null;
  const wins = ordered.filter((r) => r.NetAmount > 0).length;
  const losses = ordered.filter((r) => r.NetAmount < 0).length;
  return {
    Player: player,
    Period: period,
    Ranking: ranking,
    Summary: {
      NetAmount: cumulative,
      SessionsPlayed: ordered.length,
      WinningSessions: wins,
      LosingSessions: losses,
      FlatSessions: ordered.length - wins - losses,
      WinRate: ordered.length ? wins / ordered.length : null,
      AveragePerSession: ordered.length ? cumulative / ordered.length : null,
    },
    Extremes: { BestSession: project(best), WorstSession: project(worst) },
    Streak: {
      CurrentType: win
        ? ("Win" as const)
        : loss
          ? ("Loss" as const)
          : ("None" as const),
      CurrentCount: win || loss,
      MaxWinStreak: maxWin,
      MaxLossStreak: maxLoss,
    },
    Trend,
    RecentSessions: ordered
      .slice(-10)
      .reverse()
      .map((r) => project(r)!),
  };
}
export type PlayerAnalysis = ReturnType<typeof derivePlayerAnalysis>;
