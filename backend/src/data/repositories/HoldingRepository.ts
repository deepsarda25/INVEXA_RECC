import { sql } from "../../lib/db";

export interface IHoldingRepository {
  getCompetitionHoldings(competitionId: string, userId: string): Promise<{ ticker: string; quantity: number }[]>;
  getGlobalHoldings(userId: string): Promise<{ ticker: string; quantity: number }[]>;
}

export class HoldingRepository implements IHoldingRepository {
  async getCompetitionHoldings(competitionId: string, userId: string): Promise<{ ticker: string; quantity: number }[]> {
    return await sql<{ ticker: string; quantity: number }[]>`
      SELECT ticker, quantity
      FROM competition_holdings
      WHERE competition_id = ${competitionId} AND user_id = ${userId}
    `;
  }

  async getGlobalHoldings(userId: string): Promise<{ ticker: string; quantity: number }[]> {
    return await sql<{ ticker: string; quantity: number }[]>`
      SELECT ticker, quantity
      FROM holdings
      WHERE user_id = ${userId}
    `;
  }
}

export const holdingRepository = new HoldingRepository();
