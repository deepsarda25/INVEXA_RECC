import {
  StockConfigInput,
  CompetitionNotFoundError,
  UnauthorizedCompetitionError,
  CompetitionAlreadyStartedError
} from "../types";
import { ICompetitionRepository } from "../../../data/repositories/CompetitionRepository";
import { IEventPublisher } from "../../../lib/events/IEventPublisher";

export class CompetitionAdminService {
  constructor(
    private repository: ICompetitionRepository,
    private eventPublisher: IEventPublisher
  ) {}

  async configureStockData(
    userId: string,
    competitionId: string,
    config: StockConfigInput
  ): Promise<void> {
    const competition = await this.repository.getById(competitionId);
    if (!competition) {
      throw new CompetitionNotFoundError(competitionId);
    }

    if (competition.createdBy !== userId) {
      throw new UnauthorizedCompetitionError(userId, "configure stock data");
    }

    if (competition.startAt <= new Date()) {
      throw new CompetitionAlreadyStartedError(competitionId);
    }

    await this.repository.update(competitionId, {
      stockDataSource: config.dataSource,
      allowUserInfluence: config.allowInfluence,
      stockDataConfig: config,
    });

    await this.eventPublisher.publish("stock_config_updated", {
      competitionId,
      userId,
      dataSource: config.dataSource,
      timestamp: new Date().toISOString(),
    });
  }

  async addParticipantsBulk(
    userId: string,
    competitionId: string,
    usernames: string[]
  ): Promise<void> {
    const competition = await this.repository.getById(competitionId);
    if (!competition) {
      throw new CompetitionNotFoundError(competitionId);
    }

    if (competition.createdBy !== userId) {
      throw new UnauthorizedCompetitionError(userId, "add participants");
    }

    if (!usernames || usernames.length === 0) {
      return;
    }

    await this.eventPublisher.publish("bulk_add_participants", {
      competitionId,
      startBalance: competition.startBalance,
      usernames,
      timestamp: new Date().toISOString(),
    });
  }

  async triggerAdminEvent(
    userId: string,
    competitionId: string,
    eventType: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const competition = await this.repository.getById(competitionId);
    if (!competition) {
      throw new CompetitionNotFoundError(competitionId);
    }

    await this.eventPublisher.publish("admin_event", {
      competitionId,
      eventType,
      userId,
      metadata: metadata || {},
      timestamp: new Date().toISOString(),
    });
  }
}
