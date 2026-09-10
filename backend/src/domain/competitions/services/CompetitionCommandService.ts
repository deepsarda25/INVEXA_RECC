import {
  Competition,
  CreateCompetitionInput,
  UpdateCompetitionInput,
  CompetitionNotFoundError,
  UnauthorizedCompetitionError,
  CompetitionAlreadyStartedError,
  InvalidJoinCodeError
} from "../types";
import { ICompetitionRepository } from "../../../data/repositories/CompetitionRepository";
import { IEventPublisher } from "../../../lib/events/IEventPublisher";

export class CompetitionCommandService {
  constructor(
    private repository: ICompetitionRepository,
    private eventPublisher: IEventPublisher
  ) {}

  async createCompetition(
    userId: string,
    input: CreateCompetitionInput
  ): Promise<Competition> {
    const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const competition: Competition = {
      id: "", 
      name: input.name,
      startBalance: input.startBalance,
      startAt: input.startAt,
      endAt: input.endAt,
      status: "draft",
      isPublic: input.isPublic,
      joinCode,
      createdBy: userId,
      createdAt: new Date(),
      stockDataSource: "simulated",
      allowUserInfluence: false,
    };

    const created = await this.repository.create(competition);

    await this.eventPublisher.publish("competition_created", {
      id: created.id,
      userId,
      name: created.name,
      timestamp: new Date().toISOString(),
    });

    return created;
  }

  async updateCompetition(
    userId: string,
    competitionId: string,
    input: UpdateCompetitionInput
  ): Promise<void> {
    const competition = await this.repository.getById(competitionId);
    if (!competition) {
      throw new CompetitionNotFoundError(competitionId);
    }

    if (competition.createdBy !== userId) {
      throw new UnauthorizedCompetitionError(userId, "update competition");
    }

    // Note: we no longer block updates after start — only stock config is restricted (see CompetitionAdminService)

    await this.repository.update(competitionId, {
      name: input.name,
      // Preserve existing isPublic if the caller didn't explicitly supply it
      isPublic: input.isPublic ?? competition.isPublic,
      startAt: input.startAt,
      endAt: input.endAt,
      password: input.password,
    });

    await this.eventPublisher.publish("competition_updated", {
      id: competitionId,
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  async joinCompetition(
    userId: string,
    idOrCode: string,
    password?: string
  ): Promise<Competition> {
    let competition: Competition | null = null;

    if (idOrCode.length === 6) {
      competition = await this.repository.getByJoinCode(idOrCode);
      if (!competition) {
        throw new InvalidJoinCodeError(idOrCode);
      }
    } else {
      competition = await this.repository.getById(idOrCode);
      if (!competition) {
        throw new CompetitionNotFoundError(idOrCode);
      }
    }

    const existing = await this.repository.getParticipant(competition.id, userId);
    if (existing) {
      return competition;
    }

    await this.repository.addParticipant(
      competition.id,
      userId,
      competition.startBalance
    );

    await this.eventPublisher.publish("user_joined_competition", {
      competitionId: competition.id,
      userId,
      timestamp: new Date().toISOString(),
    });

    return competition;
  }
}
