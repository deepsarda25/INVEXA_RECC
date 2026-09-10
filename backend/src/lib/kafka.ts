import { Kafka, logLevel } from "kafkajs";
import { env } from "../config/env";

const kafka = new Kafka({
  clientId: env.KAFKA_CLIENT_ID,
  brokers: env.kafkaBrokers,
  logLevel: logLevel.WARN
});

export const producer = kafka.producer({
  allowAutoTopicCreation: false
});

let producerConnected = false;

export async function connectProducer() {
  if (!producerConnected) {
    await producer.connect();
    producerConnected = true;
  }
}

export function createConsumer(groupId: string) {
  return kafka.consumer({
    groupId,
    retry: { retries: 10 }
  });
}

export async function closeProducer() {
  if (producerConnected) {
    await producer.disconnect();
    producerConnected = false;
  }
}
