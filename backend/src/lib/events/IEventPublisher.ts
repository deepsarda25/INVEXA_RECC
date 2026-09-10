/**
 * Event Publisher Interface
 * 
 * Abstracts event publishing mechanism (Kafka, RabbitMQ, etc.)
 * Implements Dependency Inversion Principle.
 */

export interface IEventPublisher {
  /**
   * Publish a single event
   */
  publish(eventType: string, data: any): Promise<void>;

  /**
   * Publish multiple events atomically
   */
  publishBatch(events: Array<{ type: string; data: any }>): Promise<void>;
}

/**
 * Kafka-based event publisher
 * Encapsulates Kafka-specific logic
 */
import { connectProducer, producer } from "../kafka";
import { env } from "../../config/env";

export class KafkaEventPublisher implements IEventPublisher {
  /**
   * Maps event types to Kafka topics
   */
  private getTopicForEvent(eventType: string): string {
    const topicMap: Record<string, string> = {
      // Competition events
      "competition_created": env.COMPETITION_EVENTS_TOPIC,
      "competition_updated": env.COMPETITION_EVENTS_TOPIC,
      "user_joined_competition": env.COMPETITION_EVENTS_TOPIC,
      "bulk_add_participants": env.COMPETITION_EVENTS_TOPIC,
      "stock_config_updated": env.COMPETITION_EVENTS_TOPIC,
      "admin_event": env.COMPETITION_EVENTS_TOPIC,

      // Order events (use competition events topic)
      "order_placed": env.COMPETITION_EVENTS_TOPIC,
      "order_filled": env.COMPETITION_EVENTS_TOPIC,
      "order_cancelled": env.COMPETITION_EVENTS_TOPIC,

      // Simulation events
      "sim_started": env.SIM_CONTROL_TOPIC,
      "sim_strategy_changed": env.SIM_CONTROL_TOPIC,
    };

    return topicMap[eventType] || env.COMPETITION_EVENTS_TOPIC;
  }

  async publish(eventType: string, data: any): Promise<void> {
    await connectProducer();

    const topic = this.getTopicForEvent(eventType);
    const message = {
      type: eventType,
      ...data,
    };

    await producer.send({
      topic,
      messages: [
        {
          key: data.id || data.competitionId || "default",
          value: JSON.stringify(message),
        },
      ],
    });
  }

  async publishBatch(
    events: Array<{ type: string; data: any }>
  ): Promise<void> {
    await connectProducer();

    const messagesByTopic: Record<string, any[]> = {};

    for (const event of events) {
      const topic = this.getTopicForEvent(event.type);
      if (!messagesByTopic[topic]) {
        messagesByTopic[topic] = [];
      }

      messagesByTopic[topic].push({
        key: event.data.id || event.data.competitionId || "default",
        value: JSON.stringify({
          type: event.type,
          ...event.data,
        }),
      });
    }

    // Send messages grouped by topic
    for (const [topic, messages] of Object.entries(messagesByTopic)) {
      await producer.send({
        topic,
        messages,
      });
    }
  }
}

// Export singleton instance
export const eventPublisher = new KafkaEventPublisher();
