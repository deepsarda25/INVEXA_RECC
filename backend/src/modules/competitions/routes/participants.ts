import { Elysia, t } from "elysia";
import { authenticate } from "../../../lib/auth";
import { competitionService } from "../deps";
import { handleCompetitionError } from "../errorHandler";

export const participantRoutes = new Elysia()
  .get("/joined", async (ctx: any) => {
    try {
      const { user } = await authenticate(ctx);
      const competitions = await competitionService.getJoinedByUserWithRanking(user.id);
      return { competitions };
    } catch (error: any) {
      return handleCompetitionError(error, ctx);
    }
  })
  .post("/:id/join", async (ctx: any) => {
    try {
      const { user } = await authenticate(ctx);
      const idOrCode = ctx.params.id;
      const body = (ctx.body || {}) as any;

      const competition = await competitionService.joinCompetition(
        user.id,
        idOrCode,
        body.password
      );

      return { ok: true, competitionId: competition.id };
    } catch (error: any) {
      return handleCompetitionError(error, ctx);
    }
  })
  .get("/:id/leaderboard", async (ctx: any) => {
    try {
      const competitionId = ctx.params.id;
      const { leaderboard, startAt } = await competitionService.getLeaderboard(competitionId);

      return {
        leaderboard,
        startAt: startAt.toISOString(),
        source: "db",
      };
    } catch (error: any) {
      return handleCompetitionError(error, ctx);
    }
  })
  .get("/:id/transactions", async (ctx: any) => {
    try {
      const competitionId = ctx.params.id;
      const limit = Math.min(Number((ctx as any).query.limit ?? 100), 1000);
      const offset = Math.max(Number((ctx as any).query.offset ?? 0), 0);

      const result = await competitionService.getTransactionHistory(competitionId, limit, offset);
      return result;
    } catch (error: any) {
      return handleCompetitionError(error, ctx);
    }
  });
