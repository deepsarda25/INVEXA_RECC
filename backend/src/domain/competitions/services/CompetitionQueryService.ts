import {
  Competition,
  JoinedCompetitionView,
  LeaderboardEntry,
  TransactionResult,
  CompetitionNotFoundError
} from "../types";
import { ICompetitionRepository } from "../../../data/repositories/CompetitionRepository";
import { sql } from "../../../lib/db";

export class CompetitionQueryService {
  constructor(private repository: ICompetitionRepository) {}

  async getPublicCompetitions(): Promise<Competition[]> {
    return this.repository.getPublicCompetitions();
  }

  async getHostedByUser(userId: string): Promise<Competition[]> {
    return this.repository.getHostedByUser(userId);
  }

  async getJoinedByUserWithRanking(userId: string): Promise<JoinedCompetitionView[]> {
    const competitions = await this.repository.getJoinedByUser(userId);

    const views = await Promise.all(
      competitions.map(async (comp) => {
        const leaderboard = await this.repository.getLeaderboard(comp.id);
        const userRank = leaderboard.find((e) => e.userId === userId)?.rank || null;
        const top3 = leaderboard.slice(0, 3);

        return {
          id: comp.id,
          name: comp.name,
          status: comp.status,
          endAt: comp.endAt,
          participantCount: leaderboard.length,
          userRank,
          miniLeaderboard: top3.map((e) => ({
            rank: e.rank,
            username: e.username,
            portfolioValue: e.portfolioValue,
            isCurrentUser: e.userId === userId,
          })),
        };
      })
    );

    return views;
  }

  async getLeaderboard(competitionId: string): Promise<{
    leaderboard: LeaderboardEntry[];
    startAt: Date;
  }> {
    const competition = await this.repository.getById(competitionId);
    if (!competition) {
      throw new CompetitionNotFoundError(competitionId);
    }

    const leaderboard = await this.repository.getLeaderboard(competitionId);
    return {
      leaderboard,
      startAt: competition.startAt,
    };
  }

  async getTransactionHistory(
    competitionId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<TransactionResult> {
    const competition = await this.repository.getById(competitionId);
    if (!competition) {
      throw new CompetitionNotFoundError(competitionId);
    }

    const transactions = await sql<any[]>`
      SELECT 
        o.id, o.user_id as "userId", u.username,
        o.ticker, o.side, o.quantity,
        o.filled_price as "filledPrice",
        o.created_at as "createdAt", o.executed_at as "executedAt",
        o.status
      FROM orders o
      INNER JOIN users u ON o.user_id = u.id
      WHERE o.competition_id = ${competitionId}
      ORDER BY o.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const [countResult] = await sql<any[]>`
      SELECT COUNT(*) as count FROM orders WHERE competition_id = ${competitionId}
    `;
    const totalCount = Number(countResult.count);

    const formattedTransactions = transactions.map((t) => ({
      id: t.id,
      userId: t.userId,
      username: t.username,
      ticker: t.ticker,
      side: (t.side.toLowerCase() as "buy" | "sell"),
      quantity: t.quantity,
      filledPrice: t.filledPrice ? Number(t.filledPrice) : null,
      totalValue: t.filledPrice ? Number(t.filledPrice) * t.quantity : null,
      createdAt: new Date(t.createdAt),
      executedAt: t.executedAt ? new Date(t.executedAt) : null,
      status: t.status,
    }));

    return {
      transactions: formattedTransactions,
      pagination: {
        limit,
        offset,
        total: totalCount,
        hasMore: offset + limit < totalCount,
      },
    };
  }
}
