import { sql } from "../../lib/db";
import { Competition, CompetitionParticipant, LeaderboardEntry } from "../../domain/competitions/types";

export interface ICompetitionRepository {
  getPublicCompetitions(): Promise<Competition[]>;
  getHostedByUser(userId: string): Promise<Competition[]>;
  getJoinedByUser(userId: string): Promise<Competition[]>;
  getLeaderboard(competitionId: string): Promise<LeaderboardEntry[]>;
  getById(id: string): Promise<Competition | null>;
  create(competition: Competition): Promise<Competition>;
  update(id: string, data: Partial<Competition> & { password?: string }): Promise<void>;
  getByJoinCode(joinCode: string): Promise<Competition | null>;
  getParticipant(competitionId: string, userId: string): Promise<CompetitionParticipant | null>;
  addParticipant(competitionId: string, userId: string, startBalance: number): Promise<void>;
}

export class CompetitionRepository implements ICompetitionRepository {
  async getPublicCompetitions(): Promise<Competition[]> {
    const records = await sql<any[]>`
      SELECT c.*, u.username as creator_username 
      FROM competitions c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.is_public = true AND c.end_at > NOW()
    `;
    return records.map(this.mapToCompetition);
  }

  async getHostedByUser(userId: string): Promise<Competition[]> {
    const records = await sql<any[]>`
      SELECT * FROM competitions WHERE created_by = ${userId}
    `;
    return records.map(this.mapToCompetition);
  }

  async getJoinedByUser(userId: string): Promise<Competition[]> {
    const records = await sql<any[]>`
      SELECT c.* 
      FROM competitions c
      JOIN competition_participants cp ON c.id = cp.competition_id
      WHERE cp.user_id = ${userId}
    `;
    return records.map(this.mapToCompetition);
  }

  async getLeaderboard(competitionId: string): Promise<LeaderboardEntry[]> {
    const records = await sql<any[]>`
      SELECT cp.rank, u.id as user_id, u.username, cp.virtual_balance as portfolio_value
      FROM competition_participants cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.competition_id = ${competitionId}
      ORDER BY cp.rank ASC
    `;
    return records.map(r => ({
      rank: r.rank || 0,
      userId: r.user_id,
      username: r.username,
      portfolioValue: parseFloat(r.portfolio_value)
    }));
  }

  async getById(id: string): Promise<Competition | null> {
    const records = await sql<any[]>`
      SELECT * FROM competitions WHERE id = ${id}
    `;
    return records.length ? this.mapToCompetition(records[0]) : null;
  }

  async create(comp: Competition): Promise<Competition> {
    const [record] = await sql<any[]>`
      INSERT INTO competitions (
        name, start_balance, join_code, is_public, start_at, end_at, 
        stock_data_source, allow_user_influence, created_by
      ) VALUES (
        ${comp.name}, ${comp.startBalance}, ${comp.joinCode}, ${comp.isPublic}, 
        ${comp.startAt.toISOString()}, ${comp.endAt.toISOString()}, ${comp.stockDataSource}, 
        ${comp.allowUserInfluence}, ${comp.createdBy}
      ) RETURNING *
    `;
    return this.mapToCompetition(record);
  }

  async update(id: string, data: Partial<Competition> & { password?: string }): Promise<void> {
    const updates = [];
    if (data.name !== undefined) updates.push(sql`name = ${data.name}`);
    if (data.isPublic !== undefined) updates.push(sql`is_public = ${data.isPublic}`);
    if (data.startAt !== undefined) updates.push(sql`start_at = ${data.startAt.toISOString()}`);
    if (data.endAt !== undefined) updates.push(sql`end_at = ${data.endAt.toISOString()}`);
    if (data.stockDataSource !== undefined) updates.push(sql`stock_data_source = ${data.stockDataSource}`);
    if (data.stockDataConfig !== undefined) updates.push(sql`stock_data_config = ${JSON.stringify(data.stockDataConfig)}`);
    if (data.allowUserInfluence !== undefined) updates.push(sql`allow_user_influence = ${data.allowUserInfluence}`);
    if (data.password !== undefined && data.password !== "") updates.push(sql`password = ${data.password}`);

    if (updates.length > 0) {
      const setSql = updates.reduce((a, b) => sql`${a}, ${b}`);
      await sql`UPDATE competitions SET ${setSql} WHERE id = ${id}`;
    }
  }

  async getByJoinCode(joinCode: string): Promise<Competition | null> {
    const records = await sql<any[]>`
      SELECT * FROM competitions WHERE join_code = ${joinCode}
    `;
    return records.length ? this.mapToCompetition(records[0]) : null;
  }

  async getParticipant(competitionId: string, userId: string): Promise<CompetitionParticipant | null> {
    const records = await sql<any[]>`
      SELECT * FROM competition_participants 
      WHERE competition_id = ${competitionId} AND user_id = ${userId}
    `;
    if (!records.length) return null;
    const r = records[0];
    return {
      competitionId: r.competition_id,
      userId: r.user_id,
      virtualBalance: parseFloat(r.virtual_balance),
      rank: r.rank,
      joinedAt: new Date(r.joined_at)
    };
  }

  async addParticipant(competitionId: string, userId: string, startBalance: number): Promise<void> {
    await sql`
      INSERT INTO competition_participants (competition_id, user_id, virtual_balance)
      VALUES (${competitionId}, ${userId}, ${startBalance})
      ON CONFLICT DO NOTHING
    `;
  }

  private mapToCompetition(record: any): Competition {
    return {
      id: record.id,
      name: record.name,
      startBalance: parseFloat(record.start_balance),
      startAt: new Date(record.start_at),
      endAt: new Date(record.end_at),
      status: record.status,
      isPublic: record.is_public,
      joinCode: record.join_code,
      // Always use the UUID for auth checks; expose username separately via creatorUsername
      createdBy: record.created_by,
      creatorUsername: record.creator_username ?? null,
      createdAt: new Date(record.created_at),
      stockDataSource: record.stock_data_source,
      stockDataConfig: record.stock_data_config,
      allowUserInfluence: record.allow_user_influence
    } as any;
  }
}

export const competitionRepository = new CompetitionRepository();
