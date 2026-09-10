/**
 * Competition Domain Types
 * 
 * These types represent the core business domain objects for competitions.
 * They are framework-agnostic and can be used throughout the application.
 */

export interface Competition {
  id: string;
  name: string;
  startBalance: number;
  startAt: Date;
  endAt: Date;
  status: "draft" | "active" | "ended";
  isPublic: boolean;
  joinCode: string;
  createdBy: string;
  createdAt: Date;
  stockDataSource: "simulated" | "excel" | "live";
  stockDataConfig?: any;
  allowUserInfluence: boolean;
}

export interface CompetitionParticipant {
  competitionId: string;
  userId: string;
  virtualBalance: number;
  rank?: number;
  joinedAt: Date;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  portfolioValue: number;
}

export interface MiniLeaderboardEntry {
  rank: number;
  username: string;
  portfolioValue: number;
  isCurrentUser: boolean;
}

export interface JoinedCompetitionView {
  id: string;
  name: string;
  status: string;
  endAt: Date;
  participantCount: number;
  userRank: number | null;
  miniLeaderboard: MiniLeaderboardEntry[];
}

export interface CompetitionFilter {
  status?: string[];
  isPublic?: boolean;
  createdBy?: string;
}

export interface CreateCompetitionInput {
  name: string;
  startBalance: number;
  isPublic: boolean;
  password?: string;
  startAt: Date;
  endAt: Date;
}

export interface UpdateCompetitionInput {
  name: string;
  isPublic?: boolean;
  startAt: Date;
  endAt: Date;
  password?: string;
}

export interface StockConfigInput {
  dataSource: "simulated" | "excel" | "live";
  allowInfluence: boolean;
  tickers: string[];
}

export interface Transaction {
  id: string;
  userId: string;
  username: string;
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
  filledPrice: number | null;
  totalValue: number | null;
  createdAt: Date;
  executedAt: Date | null;
  status: string;
}

export interface TransactionResult {
  transactions: Transaction[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

/**
 * Domain Exceptions
 */
export class CompetitionNotFoundError extends Error {
  constructor(id: string) {
    super(`Competition not found: ${id}`);
    this.name = "CompetitionNotFoundError";
  }
}

export class UnauthorizedCompetitionError extends Error {
  constructor(userId: string, action: string) {
    super(`User ${userId} is not authorized to ${action}`);
    this.name = "UnauthorizedCompetitionError";
  }
}

export class CompetitionAlreadyStartedError extends Error {
  constructor(competitionId: string) {
    super(`Cannot modify competition after it has started: ${competitionId}`);
    this.name = "CompetitionAlreadyStartedError";
  }
}

export class UserAlreadyJoinedError extends Error {
  constructor(userId: string, competitionId: string) {
    super(`User ${userId} has already joined competition ${competitionId}`);
    this.name = "UserAlreadyJoinedError";
  }
}

export class InvalidJoinCodeError extends Error {
  constructor(code: string) {
    super(`Invalid competition join code: ${code}`);
    this.name = "InvalidJoinCodeError";
  }
}
