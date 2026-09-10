import { CompetitionService } from "../../domain/competitions/CompetitionService";
import { eventPublisher } from "../../lib/events/IEventPublisher";
import { competitionRepository } from "../../data/repositories/CompetitionRepository";

export const competitionService = new CompetitionService(
  competitionRepository,
  eventPublisher
);
