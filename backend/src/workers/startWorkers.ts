import type { Consumer } from "kafkajs";
import { connectProducer } from "../lib/kafka";
import { startOrdersConsumer } from "./ordersConsumer";
import { startPriceChannelSubscriber, stopPriceChannelSubscriber } from "./priceChannelSubscriber";
import { startPriceTicksConsumer } from "./priceTicksConsumer";
import { startVolumeAggregator, stopVolumeAggregator } from "./volumeAggregator";
import { startRealMarketWorker, stopRealMarketWorker } from "./realMarketWorker";
import { startCompetitionMarketWorker, stopCompetitionMarketWorker } from "./competitionMarketWorker";
import { startCompetitionConsumer } from "./competitionConsumer";

const consumers: Consumer[] = [];

export async function startWorkers() {
  await connectProducer();
  consumers.push(await startPriceTicksConsumer());
  consumers.push(await startOrdersConsumer());
  consumers.push(await startCompetitionConsumer());
  await startPriceChannelSubscriber();
  
  // Start the background volume aggregator (Feature 1)
  await startVolumeAggregator();

  // Start real market fetcher (for Polygon/Yahoo mode)
  startRealMarketWorker();

  // Start competition market worker (for simulated mode with real market prices)
  startCompetitionMarketWorker();
}

export async function stopWorkers() {
  stopVolumeAggregator();
  stopRealMarketWorker();
  stopCompetitionMarketWorker();
  await stopPriceChannelSubscriber();
  await Promise.allSettled(consumers.map((consumer) => consumer.disconnect()));
}
