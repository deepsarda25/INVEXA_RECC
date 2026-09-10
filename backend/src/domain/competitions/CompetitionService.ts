import { ICompetitionRepository } from "../../data/repositories/CompetitionRepository";
import { IEventPublisher } from "../../lib/events/IEventPublisher";
import { CompetitionQueryService } from "./services/CompetitionQueryService";
import { CompetitionCommandService } from "./services/CompetitionCommandService";
import { CompetitionAdminService } from "./services/CompetitionAdminService";
import { 
  Competition, 
  JoinedCompetitionView, 
  LeaderboardEntry, 
  CreateCompetitionInput, 
  UpdateCompetitionInput, 
  StockConfigInput, 
  TransactionResult 
} from "./types";

export class CompetitionService {
  private queryService: CompetitionQueryService;
  private commandService: CompetitionCommandService;
  private adminService: CompetitionAdminService;

  constructor(repository: ICompetitionRepository, eventPublisher: IEventPublisher) {
    this.queryService = new CompetitionQueryService(repository);
    this.commandService = new CompetitionCommandService(repository, eventPublisher);
    this.adminService = new CompetitionAdminService(repository, eventPublisher);
  }

  getPublicCompetitions(): Promise<Competition[]> {
    return this.queryService.getPublicCompetitions();
  }

  getHostedByUser(userId: string): Promise<Competition[]> {
    return this.queryService.getHostedByUser(userId);
  }

  getJoinedByUserWithRanking(userId: string): Promise<JoinedCompetitionView[]> {
    return this.queryService.getJoinedByUserWithRanking(userId);
  }

  getLeaderboard(competitionId: string): Promise<{ leaderboard: LeaderboardEntry[]; startAt: Date; }> {
    return this.queryService.getLeaderboard(competitionId);
  }

  getTransactionHistory(competitionId: string, limit?: number, offset?: number): Promise<TransactionResult> {
    return this.queryService.getTransactionHistory(competitionId, limit, offset);
  }

  createCompetition(userId: string, input: CreateCompetitionInput): Promise<Competition> {
    return this.commandService.createCompetition(userId, input);
  }

  updateCompetition(userId: string, competitionId: string, input: UpdateCompetitionInput): Promise<void> {
    return this.commandService.updateCompetition(userId, competitionId, input);
  }

  joinCompetition(userId: string, idOrCode: string, password?: string): Promise<Competition> {
    return this.commandService.joinCompetition(userId, idOrCode, password);
  }

  configureStockData(userId: string, competitionId: string, config: StockConfigInput): Promise<void> {
    return this.adminService.configureStockData(userId, competitionId, config);
  }

  addParticipantsBulk(userId: string, competitionId: string, usernames: string[]): Promise<void> {
    return this.adminService.addParticipantsBulk(userId, competitionId, usernames);
  }

  triggerAdminEvent(userId: string, competitionId: string, eventType: string, metadata?: Record<string, any>): Promise<void> {
    return this.adminService.triggerAdminEvent(userId, competitionId, eventType, metadata);
  }
}
