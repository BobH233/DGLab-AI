import { z } from "zod";

export const llmConfigSchema = z.object({
  provider: z.literal("openai-compatible").default("openai-compatible"),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.9),
  maxTokens: z.number().int().positive().default(1200),
  topP: z.number().min(0).max(1).default(1),
  requestTimeoutMs: z.number().int().positive().default(120000)
});

export type LlmConfig = z.infer<typeof llmConfigSchema>;

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
  ensembleTurn: z.string().optional(),
  sceneSummarizer: z.string()
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
  lastSeq: z.number().int().nonnegative().default(0),
  lastSnapshotSeq: z.number().int().nonnegative().default(0)
});

export type Session = z.infer<typeof sessionSchema>;

export const eventTypeSchema = z.enum([
  "session.created",
  "draft.generated",
  "draft.updated",
  "session.confirmed",
  "player.message",
  "agent.speak_player",
  "agent.speak_agent",
  "agent.reasoning",
  "agent.stage_direction",
  "agent.story_effect",
  "scene.updated",
  "system.tick_started",
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

export const sessionSnapshotSchema = z.object({
  sessionId: z.string(),
  seq: z.number().int().nonnegative(),
  storyState: storyStateSchema,
  agentStates: z.record(agentRuntimeStateSchema),
  recentSummary: z.string(),
  timerState: timerStateSchema,
  usageTotals: usageStatsSchema,
  promptVersions: promptVersionsSchema.optional(),
  llmConfigSnapshot: llmConfigSchema.optional(),
  createdAt: z.string().datetime()
});

export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;

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
    sharedSafety: "1.1.0",
    toolContract: "2.2.0",
    worldBuilder: "1.1.0",
    directorAgent: "1.1.0",
    supportAgent: "1.1.0",
    ensembleTurn: "1.1.0",
    sceneSummarizer: "1.1.0"
  };
}
