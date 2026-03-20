import { z } from "zod";

function nullToUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => value === null ? undefined : value, schema.optional());
}

export const toolCatalog = [
  {
    id: "control_vibe_toy",
    name: "穿戴式震动小玩具",
    description: "允许角色调节玩家身上穿戴式震动小玩具的强度和模式。",
    required: false,
    defaultEnabled: true
  },
  {
    id: "control_e_stim_toy",
    name: "情趣电击器",
    description: "允许角色调节前端本地连接的情趣电击器通道强度、波形，或触发一键开火。",
    required: false,
    defaultEnabled: false
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
export const reasoningEffortSchema = z.enum(["low", "medium", "high"]);
export type ReasoningEffort = z.infer<typeof reasoningEffortSchema>;
export const reasoningEffortOptions = reasoningEffortSchema.options;

export const llmConfigSchema = z.object({
  provider: z.literal("openai-compatible").default("openai-compatible"),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.9),
  reasoningEffort: reasoningEffortSchema.default("medium"),
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
    reasoningEffort: "medium",
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
    reasoningEffort: backend.reasoningEffort,
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
  lastModel: nullToUndefined(z.string()),
  lastUpdatedAt: nullToUndefined(z.string().datetime())
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

export const llmCallStatusSchema = z.enum(["success", "error"]);
export type LlmCallStatus = z.infer<typeof llmCallStatusSchema>;

export const llmCallRecordSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1).default("openai-compatible"),
  model: z.string().min(1),
  kind: z.string().min(1).default("unknown"),
  schemaName: z.string().min(1),
  status: llmCallStatusSchema.default("success"),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative().default(0),
  completionTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
  sessionId: nullToUndefined(z.string()),
  context: z.record(z.unknown()).default({}),
  errorMessage: z.string().nullable().default(null)
});

export type LlmCallRecord = z.infer<typeof llmCallRecordSchema>;

export const llmCallListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export type LlmCallListQuery = z.infer<typeof llmCallListQuerySchema>;

export const llmCallListResponseSchema = z.object({
  items: z.array(llmCallRecordSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative()
});

export type LlmCallListResponse = z.infer<typeof llmCallListResponseSchema>;

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

export const requiredPlayerBodyItemStateSchema = z.array(z.string().min(1));
export const playerBodyItemStateSchema = requiredPlayerBodyItemStateSchema.default([]);
export type PlayerBodyItemState = z.infer<typeof playerBodyItemStateSchema>;

export const sessionDraftSchema = z.object({
  title: z.string().min(1),
  playerBrief: z.string().min(1),
  worldSummary: z.string().min(1),
  openingSituation: z.string().min(1),
  playerState: z.string().min(1),
  initialPlayerBodyItemState: playerBodyItemStateSchema,
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
  lastPlayerMessageAt: nullToUndefined(z.string().datetime())
});

export type StoryState = z.infer<typeof storyStateSchema>;

export const agentRuntimeStateSchema = z.object({
  mood: z.string().default("focused"),
  intent: z.string().default("observe"),
  lastActedAt: nullToUndefined(z.string().datetime())
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
  inFlight: z.boolean().default(false),
  nextTickAt: nullToUndefined(z.string().datetime()),
  queuedReasons: z.array(z.string()).default([]),
  queuedPlayerMessages: z.array(z.string()).default([]),
  pendingWaits: z.array(waitHandleSchema).default([])
});

export type TimerState = z.infer<typeof timerStateSchema>;

export const narrativeSummaryLevelSchema = z.enum(["turn", "episode", "archive"]);
export type NarrativeSummaryLevel = z.infer<typeof narrativeSummaryLevelSchema>;

export const narrativeSummarySourceSchema = z.enum(["derived", "llm_compacted"]);
export type NarrativeSummarySource = z.infer<typeof narrativeSummarySourceSchema>;

export const narrativeSummarySceneSchema = z.object({
  phase: z.string().default("opening"),
  location: z.string().default("未设定"),
  tension: z.number().min(0).max(10).default(3),
  summary: z.string().default("")
});

export type NarrativeSummaryScene = z.infer<typeof narrativeSummarySceneSchema>;

export const narrativeSummarySchema = z.object({
  id: z.string().min(1),
  level: narrativeSummaryLevelSchema,
  fromSeq: z.number().int().nonnegative(),
  toSeq: z.number().int().nonnegative(),
  turnStart: z.number().int().nonnegative(),
  turnEnd: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  scene: narrativeSummarySceneSchema,
  playerTrajectory: z.string().default(""),
  keyDevelopments: z.array(z.string().min(1)).default([]),
  characterStates: z.array(z.string().min(1)).default([]),
  unresolvedThreads: z.array(z.string().min(1)).default([]),
  carryForward: z.string().default(""),
  source: narrativeSummarySourceSchema.default("derived")
});

export type NarrativeSummary = z.infer<typeof narrativeSummarySchema>;

export const memoryPolicySchema = z.object({
  rawTurnsToKeep: z.number().int().positive().default(2),
  turnsPerEpisode: z.number().int().positive().default(4),
  maxTurnSummariesBeforeMerge: z.number().int().positive().default(6),
  maxEpisodeSummaries: z.number().int().positive().default(6),
  archiveCharBudget: z.number().int().positive().default(1200),
  episodeCharBudget: z.number().int().positive().default(1800),
  turnCharBudget: z.number().int().positive().default(1800),
  rawEventCharBudget: z.number().int().positive().default(3500)
});

export type MemoryPolicy = z.infer<typeof memoryPolicySchema>;

export const memoryRunKindSchema = z.enum(["turn_refresh", "turn_to_episode", "episode_to_archive"]);
export type MemoryRunKind = z.infer<typeof memoryRunKindSchema>;

export const memoryRunStatusSchema = z.enum(["success", "failed", "fallback"]);
export type MemoryRunStatus = z.infer<typeof memoryRunStatusSchema>;

export const memoryRunRecordSchema = z.object({
  id: z.string().min(1),
  kind: memoryRunKindSchema,
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  status: memoryRunStatusSchema,
  inputRange: z.string().min(1),
  outputLevel: narrativeSummaryLevelSchema,
  sourceModel: z.string().nullable().default(null),
  errorMessage: z.string().nullable().default(null)
});

export type MemoryRunRecord = z.infer<typeof memoryRunRecordSchema>;

export const memoryDebugStateSchema = z.object({
  lastRefreshAt: z.string().datetime().optional(),
  lastRefreshStatus: z.enum(["idle", "success", "failed"]).default("idle"),
  lastRefreshError: z.string().nullable().default(null),
  lastCompactionAt: z.string().datetime().nullable().default(null),
  lastCompactionMode: z.enum(["turn_to_episode", "episode_to_archive"]).nullable().default(null),
  recentRuns: z.array(memoryRunRecordSchema).max(12).default([])
});

export type MemoryDebugState = z.infer<typeof memoryDebugStateSchema>;

export function createDefaultMemoryPolicy(): MemoryPolicy {
  return memoryPolicySchema.parse({});
}

export function createEmptyMemoryDebugState(): MemoryDebugState {
  return memoryDebugStateSchema.parse({});
}

export const memoryStateSchema = z.object({
  version: z.number().int().positive().default(1),
  lastProcessedSeq: z.number().int().nonnegative().default(0),
  policy: memoryPolicySchema.default(createDefaultMemoryPolicy()),
  archiveSummary: narrativeSummarySchema.nullable().default(null),
  episodeSummaries: z.array(narrativeSummarySchema).default([]),
  turnSummaries: z.array(narrativeSummarySchema).default([]),
  debug: memoryDebugStateSchema.default(createEmptyMemoryDebugState())
});

export type MemoryState = z.infer<typeof memoryStateSchema>;

export function createEmptyMemoryState(): MemoryState {
  return memoryStateSchema.parse({});
}

export const promptVersionsSchema = z.object({
  sharedSafety: z.string(),
  toolContract: z.string(),
  worldBuilder: z.string(),
  ensembleTurn: nullToUndefined(z.string())
});

export type PromptVersions = z.infer<typeof promptVersionsSchema>;

export const sessionStatusSchema = z.enum(["draft", "active", "ended"]);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const eStimPulseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1)
});

export type EStimPulse = z.infer<typeof eStimPulseSchema>;

export const eStimChannelStateSchema = z.object({
  enabled: z.boolean().default(true),
  strength: z.number().int().nonnegative().default(0),
  limit: z.number().int().nonnegative().default(0),
  tempStrength: z.number().int().nonnegative().default(0),
  currentPulseId: nullToUndefined(z.string().min(1)),
  currentPulseName: nullToUndefined(z.string().min(1)),
  fireStrengthLimit: z.number().int().nonnegative().optional()
});

export type EStimChannelState = z.infer<typeof eStimChannelStateSchema>;

export const eStimToolContextSchema = z.object({
  gameConnectionCodeLabel: nullToUndefined(z.string().min(1)),
  bChannelEnabled: z.boolean().default(false),
  channelPlacements: z.object({
    a: nullToUndefined(z.string().min(1)),
    b: nullToUndefined(z.string().min(1))
  }).default({}),
  allowedPulses: z.array(eStimPulseSchema).default([]),
  lastSyncedAt: nullToUndefined(z.string().datetime()),
  runtime: z.object({
    a: eStimChannelStateSchema,
    b: eStimChannelStateSchema.optional()
  }).optional()
});

export type EStimToolContext = z.infer<typeof eStimToolContextSchema>;

export const toolContextSchema = z.object({
  eStim: nullToUndefined(eStimToolContextSchema)
});

export type ToolContext = z.infer<typeof toolContextSchema>;

export const sessionSchema = z.object({
  id: z.string(),
  status: sessionStatusSchema,
  title: z.string().min(1),
  initialPrompt: z.string().min(1),
  draft: sessionDraftSchema,
  confirmedSetup: sessionDraftSchema.nullable(),
  playerBodyItemState: playerBodyItemStateSchema,
  storyState: storyStateSchema,
  agentStates: z.record(agentRuntimeStateSchema),
  memoryState: memoryStateSchema.default(createEmptyMemoryState()),
  timerState: timerStateSchema,
  usageTotals: usageStatsSchema,
  toolContext: nullToUndefined(toolContextSchema),
  llmConfigSnapshot: nullToUndefined(llmConfigSchema),
  promptVersions: nullToUndefined(promptVersionsSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastSeq: z.number().int().nonnegative().default(0)
});

export type Session = z.infer<typeof sessionSchema>;

export const memoryContextStatsSchema = z.object({
  charCounts: z.object({
    archive: z.number().int().nonnegative().default(0),
    episodes: z.number().int().nonnegative().default(0),
    turns: z.number().int().nonnegative().default(0),
    rawTurns: z.number().int().nonnegative().default(0),
    playerMessages: z.number().int().nonnegative().default(0),
    tickContext: z.number().int().nonnegative().default(0),
    coreState: z.number().int().nonnegative().default(0)
  }),
  droppedBlocks: z.array(z.string()).default([]),
  rawTurnsIncluded: z.number().int().nonnegative().default(0),
  episodeCountIncluded: z.number().int().nonnegative().default(0),
  turnSummaryCountIncluded: z.number().int().nonnegative().default(0),
  usedFallback: z.boolean().default(false)
});

export type MemoryContextStats = z.infer<typeof memoryContextStatsSchema>;

export const eventTypeSchema = z.enum([
  "session.created",
  "draft.generated",
  "draft.updated",
  "session.confirmed",
  "player.body_item_state_updated",
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
  agentId: nullToUndefined(z.string()),
  createdAt: z.string().datetime(),
  payload: z.record(z.unknown())
});

export type SessionEvent = z.infer<typeof sessionEventSchema>;

export const recentRawTurnSchema = z.object({
  id: z.string().min(1),
  fromSeq: z.number().int().nonnegative(),
  toSeq: z.number().int().nonnegative(),
  turnStart: z.number().int().nonnegative(),
  turnEnd: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
  events: z.array(sessionEventSchema)
});

export type RecentRawTurn = z.infer<typeof recentRawTurnSchema>;

export const narrativeContextBundleSchema = z.object({
  coreState: z.object({
    sessionDraft: z.string(),
    storyState: z.string(),
    agentStates: z.string(),
    playerBodyItemState: z.string()
  }),
  archiveBlock: z.string(),
  episodeBlocks: z.array(z.string()),
  turnSummaryBlocks: z.array(z.string()),
  recentRawTurns: z.array(recentRawTurnSchema),
  recentRawTurnsBlock: z.string(),
  playerMessagesBlock: z.string(),
  tickContextBlock: z.string(),
  stats: memoryContextStatsSchema
});

export type NarrativeContextBundle = z.infer<typeof narrativeContextBundleSchema>;

export const memoryDebugResponseSchema = z.object({
  sessionId: z.string(),
  memoryState: memoryStateSchema,
  recentRawTurns: z.array(recentRawTurnSchema),
  assembledContext: narrativeContextBundleSchema,
  storyStateSnapshot: storyStateSchema,
  queueSnapshot: z.object({
    queuedPlayerMessages: z.array(z.string()),
    queuedReasons: z.array(z.string())
  })
});

export type MemoryDebugResponse = z.infer<typeof memoryDebugResponseSchema>;

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
  handoffTo: nullToUndefined(z.string())
});

export type TurnControl = z.infer<typeof turnControlSchema>;

export const actionBatchSchema = z.object({
  actions: z.array(toolCallSchema).max(24),
  turnControl: turnControlSchema,
  playerBodyItemState: requiredPlayerBodyItemStateSchema
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

export const sessionToolContextRequestSchema = z.object({
  toolContext: nullToUndefined(toolContextSchema)
});

export type SessionToolContextRequest = z.infer<typeof sessionToolContextRequestSchema>;

export const createDraftRequestSchema = z.object({
  playerBrief: z.string().min(1),
  toolContext: nullToUndefined(toolContextSchema)
});

export type CreateDraftRequest = z.infer<typeof createDraftRequestSchema>;

export const updateDraftRequestSchema = z.object({
  title: z.string().optional(),
  worldSummary: z.string().optional(),
  openingSituation: z.string().optional(),
  playerState: z.string().optional(),
  initialPlayerBodyItemState: playerBodyItemStateSchema.optional(),
  suggestedPace: z.string().optional(),
  safetyFrame: z.string().optional(),
  sceneGoals: z.array(z.string()).optional(),
  contentNotes: z.array(z.string()).optional(),
  agents: z.array(agentProfileSchema).optional()
});

export type UpdateDraftRequest = z.infer<typeof updateDraftRequestSchema>;

export const postMessageRequestSchema = z.object({
  text: z.string().min(1),
  toolContext: nullToUndefined(toolContextSchema)
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
    "llm.turn.started",
    "llm.action.started",
    "llm.action.meta",
    "llm.action.text.delta",
    "llm.action.field.completed",
    "llm.action.completed",
    "llm.reasoning_summary.delta",
    "llm.preview.snapshot",
    "llm.turn.control",
    "llm.turn.player_body_item_state",
    "llm.turn.completed",
    "llm.turn.failed",
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
    sharedSafety: "1.3.0",
    toolContract: "3.0.0",
    worldBuilder: "1.6.0",
    ensembleTurn: "1.6.0"
  };
}
