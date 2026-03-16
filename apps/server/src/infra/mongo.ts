import { MongoClient, type Collection } from "mongodb";
import type {
  LlmConfig,
  Session,
  SessionEvent,
  SessionSnapshot
} from "@dglab-ai/shared";
import type { SessionStore } from "../types/contracts.js";

const DEFAULT_CONFIG: LlmConfig = {
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "replace-me",
  model: "gpt-4.1-mini",
  temperature: 0.9,
  maxTokens: 1200,
  topP: 1,
  requestTimeoutMs: 120000
};

type ConfigDocument = {
  _id: "default";
  config: LlmConfig;
};

export class MongoSessionStore implements SessionStore {
  private readonly client: MongoClient;
  private readonly dbName: string;

  constructor(mongoUri: string, dbName = "dglab_ai") {
    this.client = new MongoClient(mongoUri);
    this.dbName = dbName;
  }

  private get configs(): Collection<ConfigDocument> {
    return this.client.db(this.dbName).collection("app_configs");
  }

  private get sessions(): Collection<Session> {
    return this.client.db(this.dbName).collection("sessions");
  }

  private get events(): Collection<SessionEvent> {
    return this.client.db(this.dbName).collection("session_events");
  }

  private get snapshots(): Collection<SessionSnapshot> {
    return this.client.db(this.dbName).collection("session_snapshots");
  }

  async init(): Promise<void> {
    await this.client.connect();
    await Promise.all([
      this.sessions.createIndex({ id: 1 }, { unique: true }),
      this.sessions.createIndex({ updatedAt: -1 }),
      this.events.createIndex({ sessionId: 1, seq: 1 }, { unique: true }),
      this.snapshots.createIndex({ sessionId: 1, seq: -1 })
    ]);
  }

  async getConfig(): Promise<LlmConfig> {
    const document = await this.configs.findOne({ _id: "default" });
    if (!document) {
      await this.saveConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    return document.config;
  }

  async saveConfig(config: LlmConfig): Promise<LlmConfig> {
    await this.configs.updateOne(
      { _id: "default" },
      { $set: { config } },
      { upsert: true }
    );
    return config;
  }

  async listSessions(): Promise<Array<Pick<Session, "id" | "title" | "status" | "updatedAt" | "createdAt">>> {
    return this.sessions
      .find({}, { projection: { id: 1, title: 1, status: 1, updatedAt: 1, createdAt: 1, _id: 0 } })
      .sort({ updatedAt: -1 })
      .toArray();
  }

  async createSession(session: Session): Promise<Session> {
    await this.sessions.insertOne(session);
    return session;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    return this.sessions.findOne({ id: sessionId }, { projection: { _id: 0 } });
  }

  async replaceSession(session: Session): Promise<void> {
    await this.sessions.replaceOne({ id: session.id }, session, { upsert: false });
  }

  async appendEvents(
    sessionId: string,
    startSeq: number,
    events: Array<Omit<SessionEvent, "seq" | "sessionId">>
  ): Promise<SessionEvent[]> {
    if (events.length === 0) {
      return [];
    }
    const documents = events.map((event, index) => ({
      ...event,
      sessionId,
      seq: startSeq + index + 1
    }));
    await this.events.insertMany(documents);
    return documents;
  }

  async getEvents(sessionId: string, cursor?: number, limit = 200): Promise<SessionEvent[]> {
    const query = cursor ? { sessionId, seq: { $gt: cursor } } : { sessionId };
    return this.events
      .find(query, { projection: { _id: 0 } })
      .sort({ seq: 1 })
      .limit(limit)
      .toArray();
  }

  async createSnapshot(snapshot: SessionSnapshot): Promise<void> {
    await this.snapshots.insertOne(snapshot);
  }

  async getLatestSnapshot(sessionId: string): Promise<SessionSnapshot | null> {
    return this.snapshots.findOne({ sessionId }, { projection: { _id: 0 }, sort: { seq: -1 } });
  }

  async listSchedulableSessions(): Promise<Session[]> {
    return this.sessions
      .find({
        status: "active"
      }, { projection: { _id: 0 } })
      .toArray();
  }
}
