import { z } from "zod";

export const toolCatalog = [
  {
    id: "control_vibe_toy",
    name: "穿戴式震动小玩具",
    description: "允许角色调节玩家身上穿戴式震动小玩具的强度和模式。",
    required: false,
    defaultEnabled: true
  },
  {
    id: "speak_to_player",
    name: "角色对玩家说话",
    description: "角色向玩家输出对白。",
    required: true,
    defaultEnabled: true
  },
  {
    id: "speak_to_agent",
    name: "角色间对话",
    description: "角色之间交换对白或提示。",
    required: true,
    defaultEnabled: true
  },
  {
    id: "emit_reasoning_summary",
    name: "可见推理摘要",
    description: "输出可见的意图或推理摘要。",
    required: true,
    defaultEnabled: true
  },
  {
    id: "perform_stage_direction",
    name: "舞台动作",
    description: "输出面向玩家的动作或舞台描述。",
    required: true,
    defaultEnabled: true
  },
  {
    id: "wait",
    name: "短暂停顿",
    description: "在同一轮展示中插入节奏停顿。",
    required: true,
    defaultEnabled: true
  },
  {
    id: "apply_story_effect",
    name: "剧情效果",
    description: "施加剧情效果并更新氛围张力。",
    required: true,
    defaultEnabled: true
  },
  {
    id: "update_scene_state",
    name: "场景状态更新",
    description: "更新后续回合共享的场景状态。",
    required: true,
    defaultEnabled: true
  },
  {
    id: "end_story",
    name: "结束故事",
    description: "在满足条件时结束本次故事。",
    required: true,
    defaultEnabled: true
  }
] as const;

export type ToolCatalogEntry = typeof toolCatalog[number];
export type ToolStateMap = Record<string, boolean>;

export function defaultToolStates(): ToolStateMap {
  return Object.fromEntries(toolCatalog.map((tool) => [tool.id, tool.defaultEnabled]));
}

export function normalizeToolStates(toolStates?: Record<string, boolean>): ToolStateMap {
  const normalized = defaultToolStates();
  for (const tool of toolCatalog) {
    if (tool.required) {
      normalized[tool.id] = true;
      continue;
    }
    if (typeof toolStates?.[tool.id] === "boolean") {
      normalized[tool.id] = toolStates[tool.id];
    }
  }
  return normalized;
}

export function isToolRequired(toolId: string): boolean {
  return toolCatalog.some((tool) => tool.id === toolId && tool.required);
}

export function isToolEnabled(toolId: string, toolStates?: Record<string, boolean>): boolean {
  return normalizeToolStates(toolStates)[toolId] ?? true;
}

export const DEFAULT_MODEL_BACKEND_ID = "default-openai";
export const DEFAULT_MODEL_BACKEND_NAME = "默认后端";

export const llmConfigSchema = z.object({
  provider: z.literal("openai-compatible").default("openai-compatible"),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.9),
  maxTokens: z.number().int().positive().default(1200),
  topP: z.number().min(0).max(1).default(1),
  requestTimeoutMs: z.number().int().positive().default(120000),
  toolStates: z.record(z.boolean()).default(defaultToolStates())
});

export type LlmConfig = z.infer<typeof llmConfigSchema>;

export function createDefaultLlmConfig(): LlmConfig {
  return {
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "replace-me",
    model: "gpt-4.1-mini",
    temperature: 0.9,
    maxTokens: 1200,
    topP: 1,
    requestTimeoutMs: 120000,
    toolStates: defaultToolStates()
  };
}

export function normalizeLlmConfig(config: LlmConfig): LlmConfig {
  return {
    ...config,
    toolStates: normalizeToolStates(config.toolStates)
  };
}

export const modelBackendSchema = llmConfigSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1)
});

export type ModelBackend = z.infer<typeof modelBackendSchema>;

export function createDefaultModelBackend(): ModelBackend {
  return {
    id: DEFAULT_MODEL_BACKEND_ID,
    name: DEFAULT_MODEL_BACKEND_NAME,
    ...createDefaultLlmConfig()
  };
}

export function normalizeModelBackend(backend: ModelBackend): ModelBackend {
  return {
    ...backend,
    name: backend.name.trim() || DEFAULT_MODEL_BACKEND_NAME,
    ...normalizeLlmConfig(backend)
  };
}

export const appConfigSchema = z.object({
  activeBackendId: z.string().min(1),
  backends: z.array(modelBackendSchema).min(1)
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export function createDefaultAppConfig(): AppConfig {
  const backend = createDefaultModelBackend();
  return {
    activeBackendId: backend.id,
    backends: [backend]
  };
}

export function extractLlmConfig(backend: ModelBackend): LlmConfig {
  return normalizeLlmConfig({
    provider: backend.provider,
    baseUrl: backend.baseUrl,
    apiKey: backend.apiKey,
    model: backend.model,
    temperature: backend.temperature,
    maxTokens: backend.maxTokens,
    topP: backend.topP,
    requestTimeoutMs: backend.requestTimeoutMs,
    toolStates: backend.toolStates
  });
}

export function normalizeAppConfig(config: AppConfig | LlmConfig): AppConfig {
  if ("backends" in config) {
    const normalizedBackends = config.backends.reduce<ModelBackend[]>((result, backend, index) => {
      const normalized = normalizeModelBackend(backend);
      const uniqueId = result.some((item) => item.id === normalized.id)
        ? `${normalized.id}-${index + 1}`
        : normalized.id;
      result.push({
        ...normalized,
        id: uniqueId
      });
      return result;
    }, []);
    const fallbackBackend = normalizedBackends[0] ?? createDefaultModelBackend();
    const activeBackend = normalizedBackends.find((backend) => backend.id === config.activeBackendId) ?? fallbackBackend;
    return {
      activeBackendId: activeBackend.id,
      backends: normalizedBackends.length > 0 ? normalizedBackends : [fallbackBackend]
    };
  }

  const legacyBackend = normalizeModelBackend({
    id: DEFAULT_MODEL_BACKEND_ID,
    name: DEFAULT_MODEL_BACKEND_NAME,
    ...config
  });
  return {
    activeBackendId: legacyBackend.id,
    backends: [legacyBackend]
  };
}

export function findActiveModelBackend(config: AppConfig): ModelBackend {
  return config.backends.find((backend) => backend.id === config.activeBackendId) ?? config.backends[0] ?? createDefaultModelBackend();
}

export const usageEntrySchema = z.object({
  promptTokens: z.number().int().nonnegative().default(0),
  completionTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
  calls: z.number().int().nonnegative().default(0),
  lastModel: z.string().optional(),
  lastUpdatedAt: z.string().datetime().optional()
});

export type UsageEntry = z.infer<typeof usageEntrySchema>;

export const usageStatsSchema = z.object({
  session: usageEntrySchema.default({}),
  byAgent: z.record(usageEntrySchema).default({}),
  byCall: z.array(
    z.object({
      id: z.string(),
      agentId: z.string().optional(),
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(),
      model: z.string(),
      createdAt: z.string().datetime()
    })
  ).default([])
});

export type UsageStats = z.infer<typeof usageStatsSchema>;

export const agentRoleSchema = z.enum(["director", "support"]);
export type AgentRole = z.infer<typeof agentRoleSchema>;

export const agentProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: agentRoleSchema,
  summary: z.string().min(1),
  persona: z.string().min(1),
  goals: z.array(z.string().min(1)).min(1),
  style: z.array(z.string().min(1)).default([]),
  boundaries: z.array(z.string().min(1)).default([]),
  sortOrder: z.number().int().nonnegative().default(0)
});

export type AgentProfile = z.infer<typeof agentProfileSchema>;

export const sessionDraftSchema = z.object({
  title: z.string().min(1),
  playerBrief: z.string().min(1),
  worldSummary: z.string().min(1),
  openingSituation: z.string().min(1),
  playerState: z.string().min(1),
  suggestedPace: z.string().min(1),
  safetyFrame: z.string().min(1),
  agents: z.array(agentProfileSchema).min(1),
  sceneGoals: z.array(z.string().min(1)).default([]),
  contentNotes: z.array(z.string().min(1)).default([])
});

export type SessionDraft = z.infer<typeof sessionDraftSchema>;

export const storyStateSchema = z.object({
  location: z.string().default("未设定"),
  phase: z.string().default("opening"),
  tension: z.number().min(0).max(10).default(3),
  summary: z.string().default(""),
  activeObjectives: z.array(z.string()).default([]),
  lastPlayerMessageAt: z.string().datetime().optional()
});

export type StoryState = z.infer<typeof storyStateSchema>;

export const agentRuntimeStateSchema = z.object({
  mood: z.string().default("focused"),
  intent: z.string().default("observe"),
  lastActedAt: z.string().datetime().optional()
});

export type AgentRuntimeState = z.infer<typeof agentRuntimeStateSchema>;

export const waitHandleSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  runAt: z.string().datetime(),
  reason: z.string().min(1)
});

export type WaitHandle = z.infer<typeof waitHandleSchema>;

export const timerStateSchema = z.object({
  enabled: z.boolean().default(false),
  intervalMs: z.number().int().positive().default(10000),
  nextTickAt: z.string().datetime().optional(),
  queuedReasons: z.array(z.string()).default([]),
  queuedPlayerMessages: z.array(z.string()).default([]),
  pendingWaits: z.array(waitHandleSchema).default([])
});

export type TimerState = z.infer<typeof timerStateSchema>;

export const promptVersionsSchema = z.object({
  sharedSafety: z.string(),
  toolContract: z.string(),
  worldBuilder: z.string(),
  directorAgent: z.string().optional(),
  supportAgent: z.string().optional(),
  ensembleTurn: z.string().optional()
});

export type PromptVersions = z.infer<typeof promptVersionsSchema>;

export const sessionStatusSchema = z.enum(["draft", "active", "ended"]);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const sessionSchema = z.object({
  id: z.string(),
  status: sessionStatusSchema,
  title: z.string().min(1),
  initialPrompt: z.string().min(1),
  draft: sessionDraftSchema,
  confirmedSetup: sessionDraftSchema.nullable(),
  storyState: storyStateSchema,
  agentStates: z.record(agentRuntimeStateSchema),
  timerState: timerStateSchema,
  usageTotals: usageStatsSchema,
  llmConfigSnapshot: llmConfigSchema.optional(),
  promptVersions: promptVersionsSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastSeq: z.number().int().nonnegative().default(0)
});

export type Session = z.infer<typeof sessionSchema>;

export const eventTypeSchema = z.enum([
  "session.created",
  "draft.generated",
  "draft.updated",
  "session.confirmed",
  "player.message",
  "agent.device_control",
  "agent.speak_player",
  "agent.speak_agent",
  "agent.reasoning",
  "agent.stage_direction",
  "agent.story_effect",
  "scene.updated",
  "system.tick_started",
  "system.tick_failed",
  "system.tick_completed",
  "system.timer_updated",
  "system.wait_scheduled",
  "system.story_ended",
  "system.usage_recorded"
]);

export type SessionEventType = z.infer<typeof eventTypeSchema>;

export const sessionEventSchema = z.object({
  sessionId: z.string(),
  seq: z.number().int().nonnegative(),
  type: eventTypeSchema,
  source: z.enum(["player", "agent", "system"]),
  agentId: z.string().optional(),
  createdAt: z.string().datetime(),
  payload: z.record(z.unknown())
});

export type SessionEvent = z.infer<typeof sessionEventSchema>;

export const channelMessageSchema = z.object({
  source: z.enum(["player", "system"]),
  body: z.string().min(1),
  createdAt: z.string().datetime()
});

export type ChannelMessage = z.infer<typeof channelMessageSchema>;

export const toolVisibilitySchema = z.enum(["public", "system"]);

export const toolCallSchema = z.object({
  actorAgentId: z.string().min(1),
  tool: z.string().min(1),
  args: z.record(z.unknown()),
  whyVisible: z.string().default(""),
  targetScope: z.enum(["player", "agents", "scene", "system"]).default("scene")
});

export type ToolCall = z.infer<typeof toolCallSchema>;

export const turnControlSchema = z.object({
  continue: z.boolean().default(true),
  endStory: z.boolean().default(false),
  needsHandoff: z.boolean().default(false),
  handoffTo: z.string().optional()
});

export type TurnControl = z.infer<typeof turnControlSchema>;

export const actionBatchSchema = z.object({
  actions: z.array(toolCallSchema).max(24),
  turnControl: turnControlSchema
});

export type ActionBatch = z.infer<typeof actionBatchSchema>;

export const worldBuilderOutputSchema = sessionDraftSchema.extend({
  title: z.string().min(1)
});

export type WorldBuilderOutput = z.infer<typeof worldBuilderOutputSchema>;

export const timerUpdateSchema = z.object({
  enabled: z.boolean(),
  intervalMs: z.number().int().positive().optional()
});

export type TimerUpdate = z.infer<typeof timerUpdateSchema>;

export const createDraftRequestSchema = z.object({
  playerBrief: z.string().min(1)
});

export type CreateDraftRequest = z.infer<typeof createDraftRequestSchema>;

export const updateDraftRequestSchema = z.object({
  title: z.string().optional(),
  worldSummary: z.string().optional(),
  openingSituation: z.string().optional(),
  playerState: z.string().optional(),
  suggestedPace: z.string().optional(),
  safetyFrame: z.string().optional(),
  sceneGoals: z.array(z.string()).optional(),
  contentNotes: z.array(z.string()).optional(),
  agents: z.array(agentProfileSchema).optional()
});

export type UpdateDraftRequest = z.infer<typeof updateDraftRequestSchema>;

export const postMessageRequestSchema = z.object({
  text: z.string().min(1)
});

export type PostMessageRequest = z.infer<typeof postMessageRequestSchema>;

export const sessionListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: sessionStatusSchema,
  updatedAt: z.string().datetime(),
  createdAt: z.string().datetime()
});

export type SessionListItem = z.infer<typeof sessionListItemSchema>;

export const sseEventSchema = z.object({
  type: z.enum([
    "session.updated",
    "event.appended",
    "tick.started",
    "tick.completed",
    "usage.updated",
    "timer.updated",
    "error"
  ]),
  sessionId: z.string(),
  payload: z.record(z.unknown())
});

export type SseEvent = z.infer<typeof sseEventSchema>;

export function createEmptyUsageEntry(): UsageEntry {
  return usageEntrySchema.parse({});
}

export function createEmptyUsageStats(): UsageStats {
  return usageStatsSchema.parse({});
}

export function mergeUsageEntry(base: UsageEntry, next: Partial<UsageEntry>): UsageEntry {
  return usageEntrySchema.parse({
    promptTokens: base.promptTokens + (next.promptTokens ?? 0),
    completionTokens: base.completionTokens + (next.completionTokens ?? 0),
    totalTokens: base.totalTokens + (next.totalTokens ?? 0),
    calls: base.calls + (next.calls ?? 0),
    lastModel: next.lastModel ?? base.lastModel,
    lastUpdatedAt: next.lastUpdatedAt ?? base.lastUpdatedAt
  });
}

export function defaultPromptVersions(): PromptVersions {
  return {
    sharedSafety: "1.2.0",
    toolContract: "2.3.0",
    worldBuilder: "1.4.0",
    directorAgent: "1.2.0",
    supportAgent: "1.2.0",
    ensembleTurn: "1.3.0"
  };
}
