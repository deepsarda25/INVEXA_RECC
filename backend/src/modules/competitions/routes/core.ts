import { Elysia, t } from "elysia";
import { authenticate } from "../../../lib/auth";
import { competitionService } from "../deps";
import { handleCompetitionError } from "../errorHandler";

export const coreRoutes = new Elysia()
  .get("/", async (ctx: any) => {
    try {
      const competitions = await competitionService.getPublicCompetitions();
      return { competitions };
    } catch (error: any) {
      return handleCompetitionError(error, ctx);
    }
  })
  .get("/hosted", async (ctx: any) => {
    try {
      const { user } = await authenticate(ctx);
      const competitions = await competitionService.getHostedByUser(user.id);
      return { competitions };
    } catch (error: any) {
      return handleCompetitionError(error, ctx);
    }
  })
  .post(
    "/",
    async (ctx: any) => {
      try {
        const { user } = await authenticate(ctx);
        const body = ctx.body as any;

        const competition = await competitionService.createCompetition(user.id, {
          name: body.name,
          startBalance: body.startBalance ?? 10000,
          isPublic: body.isPublic ?? true,
          password: body.password,
          startAt: new Date(body.startAt),
          endAt: new Date(body.endAt),
        });

        return { competition };
      } catch (error: any) {
        return handleCompetitionError(error, ctx);
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 3, maxLength: 120 }),
        startBalance: t.Optional(t.Number({ minimum: 1000 })),
        isPublic: t.Optional(t.Boolean()),
        password: t.Optional(t.String()),
        startAt: t.String(),
        endAt: t.String(),
      }),
    }
  )
  .put(
    "/:id",
    async (ctx: any) => {
      try {
        const { user } = await authenticate(ctx);
        const competitionId = ctx.params.id;
        const body = ctx.body as any;

        await competitionService.updateCompetition(user.id, competitionId, {
          name: body.name,
          isPublic: body.isPublic,
          startAt: new Date(body.startAt),
          endAt: new Date(body.endAt),
          password: body.password,
        });

        return { ok: true };
      } catch (error: any) {
        return handleCompetitionError(error, ctx);
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 3, maxLength: 120 }),
        isPublic: t.Optional(t.Boolean()),
        password: t.Optional(t.String()),
        startAt: t.String(),
        endAt: t.String(),
      }),
    }
  );
