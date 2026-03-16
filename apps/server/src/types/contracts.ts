import type { Response } from "express";
import type { z, ZodTypeAny } from "zod";
import type {
  ActionBatch,
  AgentProfile,
  AppConfig,
  LlmConfig,
  Session,
  SessionDraft,
  SessionEvent,
  SseEvent,
  UsageEntry
} from "@dglab-ai/shared";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface ProviderUsage extends UsageEntry {
  model: string;
}

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
};

export interface ToolWorldPromptContribution {
  toolId: string;
  prompt: string;
}

export interface ToolPromptContract {
  argsShape: string;
  example: string;
}

export interface ToolDefinition<TArgs = unknown> {
  id: string;
  description: string;
  visibility: "public" | "system";
  inputSchema: ZodTypeAny;
  promptContract: ToolPromptContract;
  buildWorldPrompt?(context: ToolWorldPromptContext): string | null | undefined;
  execute(context: ToolExecutionContext, args: TArgs): Promise<ToolExecutionResult | void>;
}

export interface ToolRegistry {
  get(toolId: string): ToolDefinition | undefined;
  list(toolStates?: Record<string, boolean>): Array<Pick<ToolDefinition, "id" | "description" | "visibility" | "promptContract">>;
  getWorldPromptContributions(context: ToolWorldPromptContext, toolStates?: Record<string, boolean>): ToolWorldPromptContribution[];
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
  replaceSession(session: Session): Promise<void>;
  appendEvents(
    sessionId: string,
    startSeq: number,
    events: Array<Omit<SessionEvent, "seq" | "sessionId">>
  ): Promise<SessionEvent[]>;
  getEvents(sessionId: string, cursor?: number, limit?: number): Promise<SessionEvent[]>;
  listSchedulableSessions(): Promise<Session[]>;
}

export interface PromptTemplateService {
  getTemplate(name: string): Promise<string>;
  render(name: string, data: Record<string, unknown>): Promise<string>;
  versions(): Record<string, string>;
}

export interface OrchestratorTurnResult {
  events: Array<Omit<SessionEvent, "seq" | "sessionId">>;
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
  generateDraft(playerBrief: string, config: LlmConfig): Promise<SessionDraft>;
  runTick(
    session: Session,
    reason: string,
    recentEvents: SessionEvent[],
    config: LlmConfig
  ): Promise<OrchestratorTurnResult>;
}
