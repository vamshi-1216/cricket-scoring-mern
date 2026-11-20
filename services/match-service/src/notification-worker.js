import { setTimeout as delay } from "node:timers/promises";
import { Kafka } from "kafkajs";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { Match } from "./modules/matches/match.model.js";
import {
  ResultNotification,
  resultEventSchema,
} from "./modules/notifications/result-notification.js";

const topic = process.env.KAFKA_RESULT_TOPIC?.trim() || "cricket.match-finalized.v1";
const brokers = (process.env.KAFKA_BROKERS || "localhost:29092")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);
const kafka = new Kafka({ clientId: "cricket-match-notifications", brokers });
const admin = kafka.admin();
const producer = kafka.producer({ allowAutoTopicCreation: false });
const consumer = kafka.consumer({
  groupId: `${topic}.notifications`,
  allowAutoTopicCreation: false,
});
const shutdown = new AbortController();

process.once("SIGTERM", () => shutdown.abort());
process.once("SIGINT", () => shutdown.abort());
consumer.on(consumer.events.CRASH, ({ payload }) => {
  if (!payload.restart) {
    console.error("Kafka notification consumer stopped:", payload.error);
    process.exitCode = 1;
    shutdown.abort();
  }
});

async function storeNotification({ message }) {
  let event;
  try {
    event = resultEventSchema.parse(JSON.parse(message.value?.toString() ?? ""));
    if (message.key?.toString() !== event.matchId) {
      throw new Error("Kafka key does not match the event match ID.");
    }
  } catch {
    console.warn("Ignoring invalid match result event at Kafka offset", message.offset);
    return;
  }

  await ResultNotification.updateOne(
    { _id: event.matchId },
    { $setOnInsert: event },
    { upsert: true }
  );
}

async function publishPendingResults() {
  const matches = await Match.find({ resultNotificationPendingAt: { $exists: true } })
    .select("title result.outcome result.winnerTeamId +resultNotificationPendingAt")
    .sort({ resultNotificationPendingAt: 1, _id: 1 })
    .limit(50)
    .lean();

  if (matches.length === 0) return;

  await producer.send({
    topic,
    acks: -1,
    messages: matches.map((match) => {
      const event = {
        matchId: String(match._id),
        title: match.title,
        outcome: match.result.outcome,
        winnerTeamId: match.result.winnerTeamId?.toString() ?? null,
        finalizedAt: match.resultNotificationPendingAt.toISOString(),
      };
      return { key: event.matchId, value: JSON.stringify(event) };
    }),
  });

  await Match.updateMany(
    { _id: { $in: matches.map((match) => match._id) } },
    { $unset: { resultNotificationPendingAt: 1 } },
    { timestamps: false }
  );
}

async function run() {
  await connectDatabase();
  await ResultNotification.createIndexes();
  await admin.connect();
  await admin.createTopics({
    topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
  });
  await admin.disconnect();
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topics: [topic], fromBeginning: true });
  await consumer.run({ eachMessage: storeNotification });
  console.log("Kafka match notification worker running.");

  while (!shutdown.signal.aborted) {
    try {
      await publishPendingResults();
    } catch (error) {
      console.error("Pending match results could not be published:", error);
    }
    await delay(2000, undefined, { signal: shutdown.signal });
  }
}

try {
  await run();
} catch (error) {
  if (error.name !== "AbortError") {
    console.error("Kafka notification worker failed:", error);
    process.exitCode = 1;
  }
} finally {
  const clients = await Promise.allSettled([
    admin.disconnect(),
    producer.disconnect(),
    consumer.disconnect(),
  ]);
  await disconnectDatabase();
  for (const result of clients) {
    if (result.status === "rejected") {
      console.error("Kafka client disconnect failed:", result.reason);
      process.exitCode = 1;
    }
  }
}
