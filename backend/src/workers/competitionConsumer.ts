import type { Consumer } from "kafkajs";
import { env } from "../config/env";
import { createConsumer } from "../lib/kafka";
import { sql } from "../lib/db";

export async function startCompetitionConsumer(): Promise<Consumer> {
  const consumer = createConsumer("competition-events-worker");
  await consumer.connect();
  await consumer.subscribe({ topic: env.COMPETITION_EVENTS_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      const parsed = JSON.parse(message.value.toString());

      if (parsed.type === "bulk_add_participants") {
        const { competitionId, startBalance, usernames } = parsed;
        
        if (!usernames || usernames.length === 0) return;

        // Efficient lookup of user IDs from the given usernames array
        const usersToInsert = await sql<{ id: string }[]>`
          SELECT id FROM users WHERE username = ANY(${usernames})
        `;

        if (usersToInsert.length === 0) return;

        console.log(`[CompetitionConsumer] Bulk adding ${usersToInsert.length} mapped participants to competition ${competitionId}`);

        // Insert individually across the batch to avoid blocking the DB connection 
        // with gigantic arrays and prevent bulk transaction failures from a single bad ID block
        let added = 0;
        for (const u of usersToInsert) {
          try {
            await sql`
              INSERT INTO competition_participants (competition_id, user_id, virtual_balance)
              VALUES (${competitionId}, ${u.id}, ${startBalance})
              ON CONFLICT DO NOTHING
            `;
            added++;
          } catch (err) {
            console.error("[CompetitionConsumer] Insert err", err);
          }
        }
        console.log(`[CompetitionConsumer] Finished bulk participant task. Added new: ${added}.`);
      }
    }
  });

  return consumer;
}
