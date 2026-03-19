import { MongoClient, type Collection } from "mongodb";
import {
  appConfigSchema,
  createDefaultAppConfig,
  extractLlmConfig,
  findActiveModelBackend,
  llmCallListResponseSchema,
  llmCallRecordSchema,
  llmConfigSchema,
  normalizeAppConfig,
  normalizeLlmConfig,
  sessionSchema,
  type AppConfig,
  type LlmCallListQuery,
  type LlmCallListResponse,
  type LlmCallRecord,
  type LlmConfig,
  type Session,
  type SessionEvent
} from "@dglab-ai/shared";
import type { LlmCallStore, SessionStore } from "../types/contracts.js";

type ConfigDocument = {
  _id: "default";
  config: unknown;
};

export class MongoSessionStore implements SessionStore, LlmCallStore {
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

  private get llmCalls(): Collection<LlmCallRecord> {
    return this.client.db(this.dbName).collection("llm_call_records");
  }

  async init(): Promise<void> {
    await this.client.connect();
    await Promise.all([
      this.sessions.createIndex({ id: 1 }, { unique: true }),
      this.sessions.createIndex({ updatedAt: -1 }),
      this.events.createIndex({ sessionId: 1, seq: 1 }, { unique: true }),
      this.llmCalls.createIndex({ id: 1 }, { unique: true }),
      this.llmCalls.createIndex({ startedAt: -1 }),
      this.llmCalls.createIndex({ sessionId: 1, startedAt: -1 })
    ]);
  }

  async getConfig(): Promise<LlmConfig> {
    return extractLlmConfig(findActiveModelBackend(await this.getAppConfig()));
  }

  async saveConfig(config: LlmConfig): Promise<LlmConfig> {
    const current = await this.getAppConfig();
    const activeBackend = findActiveModelBackend(current);
    const next = normalizeAppConfig({
      ...current,
      backends: current.backends.map((backend) => (
        backend.id === activeBackend.id
          ? {
            ...activeBackend,
            ...normalizeLlmConfig(config)
          }
          : backend
      ))
    });
    await this.writeAppConfig(next);
    return extractLlmConfig(findActiveModelBackend(next));
  }

  async getAppConfig(): Promise<AppConfig> {
    const document = await this.configs.findOne({ _id: "default" });
    if (!document) {
      const defaultConfig = createDefaultAppConfig();
      await this.writeAppConfig(defaultConfig);
      return defaultConfig;
    }
    const normalized = this.parseStoredAppConfig(document.config);
    await this.writeAppConfig(normalized);
    return normalized;
  }

  async saveAppConfig(config: AppConfig): Promise<AppConfig> {
    const normalized = normalizeAppConfig(config);
    await this.writeAppConfig(normalized);
    return normalized;
  }

  private parseStoredAppConfig(config: unknown): AppConfig {
    const appConfig = appConfigSchema.safeParse(config);
    if (appConfig.success) {
      return normalizeAppConfig(appConfig.data);
    }
    const legacyConfig = llmConfigSchema.safeParse(config);
    if (legacyConfig.success) {
      return normalizeAppConfig(legacyConfig.data);
    }
    return createDefaultAppConfig();
  }

  private async writeAppConfig(config: AppConfig): Promise<void> {
    await this.configs.updateOne(
      { _id: "default" },
      { $set: { config } },
      { upsert: true }
    );
  }

  async listSessions(): Promise<Array<Pick<Session, "id" | "title" | "status" | "updatedAt" | "createdAt">>> {
    return this.sessions
      .find({}, { projection: { id: 1, title: 1, status: 1, updatedAt: 1, createdAt: 1, _id: 0 } })
      .sort({ updatedAt: -1 })
      .toArray();
  }

  async createSession(session: Session): Promise<Session> {
    const normalized = sessionSchema.parse(session);
    await this.sessions.insertOne(normalized);
    return normalized;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const document = await this.sessions.findOne({ id: sessionId }, { projection: { _id: 0 } });
    return document ? sessionSchema.parse(document) : null;
  }

  async replaceSession(session: Session): Promise<void> {
    await this.sessions.replaceOne({ id: session.id }, sessionSchema.parse(session), { upsert: false });
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

  async getEvents(sessionId: string, cursor?: number, limit?: number): Promise<SessionEvent[]> {
    if (cursor !== undefined) {
      const query = this.events
        .find({ sessionId, seq: { $gt: cursor } }, { projection: { _id: 0 } })
        .sort({ seq: 1 });
      if (typeof limit === "number") {
        query.limit(limit);
      }
      return query.toArray();
    }

    const query = this.events
      .find({ sessionId }, { projection: { _id: 0 } })
      .sort({ seq: 1 });
    if (typeof limit === "number") {
      query.limit(limit);
    }

    return query.toArray();
  }

  async listSchedulableSessions(): Promise<Session[]> {
    const documents = await this.sessions
      .find({
        status: "active"
      }, { projection: { _id: 0 } })
      .toArray();
    return documents.map((document) => sessionSchema.parse(document));
  }

  async recordLlmCall(record: LlmCallRecord): Promise<void> {
    await this.llmCalls.insertOne(llmCallRecordSchema.parse(record));
  }

  async listLlmCalls(query: LlmCallListQuery): Promise<LlmCallListResponse> {
    const page = query.page;
    const pageSize = query.pageSize;
    const [items, total] = await Promise.all([
      this.llmCalls
        .find({}, { projection: { _id: 0 } })
        .sort({ startedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray(),
      this.llmCalls.countDocuments({})
    ]);

    return llmCallListResponseSchema.parse({
      items,
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
    });
  }
}
