#!/bin/sh
set -e

BOOTSTRAP_SERVER="kafka:9092"
KAFKA_TOPICS_BIN="kafka-topics.sh"

if [ -x "/opt/kafka/bin/kafka-topics.sh" ]; then
  KAFKA_TOPICS_BIN="/opt/kafka/bin/kafka-topics.sh"
fi

echo "Waiting for Kafka to be ready..."
until "$KAFKA_TOPICS_BIN" --bootstrap-server "$BOOTSTRAP_SERVER" --list >/dev/null 2>&1; do
  sleep 2
done

echo "Creating starter topics..."
"$KAFKA_TOPICS_BIN" --bootstrap-server "$BOOTSTRAP_SERVER" --create --if-not-exists --topic price-ticks --partitions 5 --replication-factor 1
"$KAFKA_TOPICS_BIN" --bootstrap-server "$BOOTSTRAP_SERVER" --create --if-not-exists --topic orders-placed --partitions 3 --replication-factor 1
"$KAFKA_TOPICS_BIN" --bootstrap-server "$BOOTSTRAP_SERVER" --create --if-not-exists --topic orders-filled --partitions 3 --replication-factor 1
"$KAFKA_TOPICS_BIN" --bootstrap-server "$BOOTSTRAP_SERVER" --create --if-not-exists --topic sim-control --partitions 1 --replication-factor 1
"$KAFKA_TOPICS_BIN" --bootstrap-server "$BOOTSTRAP_SERVER" --create --if-not-exists --topic competition-events --partitions 2 --replication-factor 1

echo "Kafka topics are ready."
