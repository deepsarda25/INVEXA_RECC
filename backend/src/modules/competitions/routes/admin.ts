import { Elysia, t } from "elysia";
import { authenticate } from "../../../lib/auth";
import { env } from "../../../config/env";
import { connectProducer, producer } from "../../../lib/kafka";
import { competitionService } from "../deps";
import { handleCompetitionError } from "../errorHandler";

// Dynamic import for wsHub to avoid circular or early execution issues
async function getWsHub() {
  const hub = await import("../../../lib/wsHub");
  return hub;
}

export const adminRoutes = new Elysia()
  .post(
    "/:id/participants-bulk",
    async (ctx: any) => {
      try {
        const { user } = await authenticate(ctx);
        const competitionId = ctx.params.id;
        const body = ctx.body as any;

        const usernames: string[] = body.usernames;
        await competitionService.addParticipantsBulk(user.id, competitionId, usernames);

        return {
          ok: true,
          queued: usernames.length,
          message: "Participant insertion queued for background processing.",
        };
      } catch (error: any) {
        return handleCompetitionError(error, ctx);
      }
    },
    {
      body: t.Object({
        usernames: t.Array(t.String()),
      }),
    }
  )
  .put(
    "/:id/event",
    async (ctx: any) => {
      try {
        const { user } = await authenticate(ctx);

        if (user.role !== "admin" && user.role !== "educator") {
          ctx.set.status = 403;
          return { error: "Unauthorized" };
        }

        const competitionId = ctx.params.id;
        const body = ctx.body as any;

        await competitionService.triggerAdminEvent(
          user.id,
          competitionId,
          body.type,
          body.metadata
        );

        await connectProducer();
        await producer.send({
          topic: env.SIM_CONTROL_TOPIC,
          messages: [
            {
              key: `admin-${competitionId}`,
              value: JSON.stringify({
                action: "set_strategy",
                strategy: body.type,
                params: body.metadata ?? {},
                competitionId,
              }),
            },
          ],
        });

        const { broadcastSystemEvent } = await getWsHub();
        broadcastSystemEvent({ type: "STRATEGY_CHANGED", strategy: body.type });

        return {
          ok: true,
          emitted: {
            type: body.type,
            competitionId,
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error: any) {
        return handleCompetitionError(error, ctx);
      }
    },
    {
      body: t.Object({
        type: t.String({ minLength: 2, maxLength: 32 }),
        metadata: t.Optional(t.Record(t.String(), t.Any())),
      }),
    }
  );
