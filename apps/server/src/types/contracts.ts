import type { Response } from "express";
import type { z, ZodTypeAny } from "zod";
import type {
  ActionBatch,
  AgentProfile,
  AppConfig,
  LlmCallListQuery,
  LlmCallListResponse,
  LlmCallRecord,
  LlmConfig,
  MemoryDebugResponse,
  NarrativeContextBundle,
  Session,
  SessionDraft,
  SessionEvent,
  SessionTtsBatchJob,
  SseEvent,
  QueuedPlayerMessageInterpretation,
  ToolContext,
  UsageEntry
} from "@dglab-ai/shared";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface ProviderUsage extends UsageEntry {
  model: string;
}

export type OrchestratorPreviewEvent = {
  type: SseEvent["type"];
  payload: Record<string, unknown>;
};

export interface LLMProvider {
  completeJson<T>({
    modelConfig,
    messages,
    schema,
    schemaName,
    usageContext
  }: {
    modelConfig: LlmConfig;
    messages: ChatMessage[];
    schema: z.ZodSchema<T>;
    schemaName: string;
    usageContext: Record<string, unknown>;
  }): Promise<{
    data: T;
    usage: ProviderUsage;
    rawText: string;
  }>;
  streamText({
    modelConfig,
    messages,
    usageContext,
    onTextDelta,
    onReasoningSummaryDelta
  }: {
    modelConfig: LlmConfig;
    messages: ChatMessage[];
    usageContext: Record<string, unknown>;
    onTextDelta?: (delta: string) => void;
    onReasoningSummaryDelta?: (delta: string) => void;
  }): Promise<{
    usage: ProviderUsage;
    rawText: string;
    reasoningSummary?: string;
    llmCallId?: string;
  }>;
}

export interface ChannelAdapter {
  publish(event: SseEvent): void;
  attach(sessionId: string, response: Response): void;
  detach(sessionId: string, response: Response): void;
  normalizeInbound(payload: unknown): { text: string };
}

export type ToolExecutionResult = {
  stopProcessing?: boolean;
};

export type ToolExecutionContext = {
  session: Session;
  agent: AgentProfile;
  now: string;
  addEvent: (event: Omit<SessionEvent, "seq" | "sessionId">) => void;
};

export type ToolWorldPromptContext = {
  playerBrief: string;
  toolContext?: ToolContext;
};

export type TtsAudioCacheRecord = {
  key: string;
  contentKey?: string;
  sessionId: string;
  readableId: string;
  sourceKind: "setup" | "event";
  eventSeq?: number;
  eventType?: string;
  speaker: string;
  referenceId: string;
  baseUrl: string;
  sourceText: string;
  normalizedText: string;
  filePath: string;
  mimeType: string;
  durationMs?: number;
  createdAt: string;
  lastAccessedAt: string;
};

export interface ToolWorldPromptContribution {
  toolId: string;
  prompt: string;
}

export type ToolTurnPromptContext = {
  session: Session;
  now: string;
  reason: string;
};

export interface ToolTurnPromptContribution {
  toolId: string;
  prompt: string;
}

export interface ToolPromptContract {
  argsShape: string;
  example: string;
  guidance?: string[];
}

export interface ToolDefinition<TArgs = unknown> {
  id: string;
  description: string;
  visibility: "public" | "system";
  inputSchema: ZodTypeAny;
  promptContract: ToolPromptContract;
  buildWorldPrompt?(context: ToolWorldPromptContext): string | null | undefined;
  buildTurnPrompt?(context: ToolTurnPromptContext): Promise<string | null | undefined> | string | null | undefined;
  execute(context: ToolExecutionContext, args: TArgs): Promise<ToolExecutionResult | void>;
}

export interface ToolRegistry {
  get(toolId: string): ToolDefinition | undefined;
  list(toolStates?: Record<string, boolean>): Array<Pick<ToolDefinition, "id" | "description" | "visibility" | "promptContract">>;
  getWorldPromptContributions(context: ToolWorldPromptContext, toolStates?: Record<string, boolean>): ToolWorldPromptContribution[];
  getTurnPromptContributions(
    context: ToolTurnPromptContext,
    toolStates?: Record<string, boolean>
  ): Promise<ToolTurnPromptContribution[]>;
  execute(
    context: ToolExecutionContext,
    toolId: string,
    args: unknown,
    toolStates?: Record<string, boolean>
  ): Promise<ToolExecutionResult | void>;
}

export interface SessionStore {
  init(): Promise<void>;
  getConfig(): Promise<LlmConfig>;
  saveConfig(config: LlmConfig): Promise<LlmConfig>;
  getAppConfig(): Promise<AppConfig>;
  saveAppConfig(config: AppConfig): Promise<AppConfig>;
  listSessions(): Promise<Array<Pick<Session, "id" | "title" | "status" | "updatedAt" | "createdAt">>>;
  createSession(session: Session): Promise<Session>;
  getSession(sessionId: string): Promise<Session | null>;
  getEvent(sessionId: string, seq: number): Promise<SessionEvent | null>;
  replaceSession(session: Session): Promise<void>;
  appendEvents(
    sessionId: string,
    startSeq: number,
    events: Array<Omit<SessionEvent, "seq" | "sessionId">>
  ): Promise<SessionEvent[]>;
  getEvents(sessionId: string, cursor?: number, limit?: number): Promise<SessionEvent[]>;
  listSchedulableSessions(): Promise<Session[]>;
  getTtsAudioCache(key: string): Promise<TtsAudioCacheRecord | null>;
  getTtsAudioCacheByContentKey(contentKey: string): Promise<TtsAudioCacheRecord | null>;
  getTtsAudioCaches(keys: string[]): Promise<TtsAudioCacheRecord[]>;
  getTtsAudioCachesByContentKeys(contentKeys: string[]): Promise<TtsAudioCacheRecord[]>;
  findLatestTtsAudioCacheByIdentity(identity: {
    sessionId: string;
    readableId: string;
    eventSeq?: number;
    referenceId: string;
    normalizedText: string;
  }): Promise<TtsAudioCacheRecord | null>;
  saveTtsAudioCache(record: TtsAudioCacheRecord): Promise<TtsAudioCacheRecord>;
  touchTtsAudioCache(key: string, accessedAt: string): Promise<void>;
  getSessionTtsBatchJob(sessionId: string): Promise<SessionTtsBatchJob | null>;
  saveSessionTtsBatchJob(job: SessionTtsBatchJob): Promise<SessionTtsBatchJob>;
}

export interface LlmCallStore {
  recordLlmCall(record: LlmCallRecord): Promise<void>;
  updateLlmCallContext(id: string, contextPatch: Record<string, unknown>): Promise<void>;
  listLlmCalls(query: LlmCallListQuery): Promise<LlmCallListResponse>;
}

export interface PromptTemplateService {
  getTemplate(name: string): Promise<string>;
  render(name: string, data: Record<string, unknown>): Promise<string>;
  versions(): Record<string, string>;
}

export interface OrchestratorTurnResult {
  events: Array<Omit<SessionEvent, "seq" | "sessionId">>;
  playerMessageInterpretations: QueuedPlayerMessageInterpretation[];
  usageCalls: Array<{
    id: string;
    agentId?: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    createdAt: string;
  }>;
}

export interface OrchestratorService {
  generateDraft(playerBrief: string, config: LlmConfig, toolContext?: ToolContext): Promise<SessionDraft>;
  runTick(
    session: Session,
    reason: string,
    contextBundle: NarrativeContextBundle,
    config: LlmConfig,
    options?: {
      turnId?: string;
      onPreviewEvent?: (event: OrchestratorPreviewEvent) => void;
    }
  ): Promise<OrchestratorTurnResult>;
}

export interface MemoryDebugService {
  getMemoryDebug(sessionId: string): Promise<MemoryDebugResponse>;
}
