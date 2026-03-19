import {
  actionBatchSchema,
  mergeUsageEntry,
  sessionDraftSchema,
  type AgentProfile,
  type LlmConfig,
  type NarrativeContextBundle,
  type Session,
  type SessionDraft,
  type SessionEvent,
  type ToolContext
} from "@dglab-ai/shared";
import { z } from "zod";
import { createId } from "../lib/ids.js";
import type {
  LLMProvider,
  OrchestratorService,
  OrchestratorTurnResult,
  PromptTemplateService,
  ToolRegistry
} from "../types/contracts.js";

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function toText(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => toText(item))
      .filter(Boolean)
      .join("；");
    return normalized || fallback;
  }
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const preferredKeys = ["summary", "description", "content", "text", "state", "status"];
    for (const key of preferredKeys) {
      const candidate = toText(source[key]);
      if (candidate) {
        return candidate;
      }
    }
    const pairs = Object.entries(source)
      .map(([key, item]) => {
        const normalized = toText(item);
        return normalized ? `${key}：${normalized}` : "";
      })
      .filter(Boolean);
    return pairs.join("；") || fallback;
  }
  return fallback;
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\n|；|;|，|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizePlayerBodyItemState(value: unknown): string[] {
  const normalized = toStringList(value);
  const seen = new Set<string>();
  return normalized.filter((item) => {
    if (seen.has(item)) {
      return false;
    }
    seen.add(item);
    return true;
  });
}

function toRole(value: unknown, index: number): "director" | "support" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "director" || normalized === "主导者") {
    return "director";
  }
  if (normalized === "support" || normalized === "辅助者") {
    return "support";
  }
  return index === 0 ? "director" : "support";
}

function normalizeAgent(rawAgent: unknown, index: number) {
  const source = typeof rawAgent === "object" && rawAgent !== null
    ? rawAgent as Record<string, unknown>
    : {};
  const name = toText(source.name, `角色${index + 1}`);
  const role = toRole(source.role, index);
  const persona = toText(source.persona ?? source.personality ?? source.summary);
  const style = toStringList(source.style);
  const summary = toText(
    source.summary ?? persona,
    `${name}是本场景中的${role === "director" ? "主导者" : "辅助者"}。`
  );
  const goals = toStringList(source.goals);
  return {
    id: String(source.id ?? `agent_${index + 1}`).trim() || `agent_${index + 1}`,
    name,
    role,
    summary,
    persona: persona || summary,
    goals: goals.length > 0
      ? goals
      : [role === "director" ? "引导剧情节奏并维持沉浸体验。" : "配合主导者烘托氛围并丰富互动层次。"],
    style,
    boundaries: toStringList(source.boundaries),
    sortOrder: typeof source.sortOrder === "number" ? source.sortOrder : index
  };
}

function normalizeWorldBuilderOutput(raw: unknown, playerBrief: string): SessionDraft {
  const source = typeof raw === "object" && raw !== null
    ? raw as Record<string, unknown>
    : {};
  const agentsInput = Array.isArray(source.agents) ? source.agents : [];
  const agents = agentsInput.length > 0
    ? agentsInput.map((agent, index) => normalizeAgent(agent, index))
    : [normalizeAgent({}, 0)];
  return sessionDraftSchema.parse({
    title: toText(source.title, "未命名剧情"),
    playerBrief,
    worldSummary: toText(source.worldSummary, "系统已根据你的输入生成基础世界观。"),
    openingSituation: toText(source.openingSituation, "故事从一场让你难以抽身的暧昧对峙里缓缓展开。"),
    playerState: toText(source.playerState, "你正被卷入一场充满试探、吸引力与情绪拉扯的互动之中。"),
    initialPlayerBodyItemState: normalizePlayerBodyItemState(
      source.initialPlayerBodyItemState ?? source.playerBodyItemState ?? source.playerPhysicalItemState
    ),
    suggestedPace: toText(
      source.suggestedPace,
      "整体会先用试探与拉近距离让你进入状态，再进入逐步加压与条件引导的中段，最后以情绪回收和余韵收束；每一段都会提前埋好道具、动作与掌控方式，让你在互动、试探与情绪升温里逐步沉浸其中。"
    ),
    safetyFrame: toText(source.safetyFrame, "本次剧情为纯虚构推演，不映射现实伤害。"),
    agents,
    sceneGoals: toStringList(source.sceneGoals),
    contentNotes: toStringList(source.contentNotes)
  });
}

function toolReferenceForPrompt(toolRegistry: ToolRegistry, toolStates?: Record<string, boolean>): string {
  return toolRegistry.list(toolStates).filter((tool) => tool.id !== "wait").map((tool) => {
    const guidance = tool.promptContract.guidance?.length
      ? [
        "  Tool-specific rules:",
        ...tool.promptContract.guidance.map((rule) => `  - ${rule}`)
      ]
      : [];
    return [
      `- ${tool.id} (${tool.visibility}): ${tool.description}`,
      `  Exact args object: ${tool.promptContract.argsShape}`,
      `  Valid call example: ${tool.promptContract.example}`,
      ...guidance
    ].join("\n");
  }).join("\n");
}

function toolExamplesForPrompt(): string {
  return [
    "Example batch 1:",
    "```json",
    JSON.stringify({
      actions: [
        {
          actorAgentId: "director",
          tool: "perform_stage_direction",
          args: {
            direction: "你看见他先是漫不经心地看了你一会儿，然后把酒杯轻轻推到你手边，像是在等你先接住这份暗示。"
          }
        },
        {
          actorAgentId: "director",
          tool: "speak_to_player",
          args: {
            message: "别急着躲开。<delay>900</delay>先看着我，让我听听你真正想说的那一句。"
          }
        },
        {
          actorAgentId: "support_1",
          tool: "speak_to_agent",
          args: {
            targetAgentId: "director",
            message: "气氛已经起来了。<delay>700</delay>别让这一刻断掉。"
          }
        }
      ],
      turnControl: {
        continue: true,
        endStory: false,
        needsHandoff: false
      },
      playerBodyItemState: ["你现在戴着一副遮光眼罩"]
    }, null, 2),
    "```",
    "Example batch 2:",
    "```json",
    JSON.stringify({
      actions: [
        {
          actorAgentId: "support_1",
          tool: "apply_story_effect",
          args: {
            label: "暧昧升温",
            description: "你感觉空气里的温度在短暂沉默后悄悄抬高，连目光碰到一起都像多停了一拍。",
            intensity: 6
          }
        },
        {
          actorAgentId: "director",
          tool: "update_scene_state",
          args: {
            location: "会客室",
            phase: "teasing",
            tension: 7,
            summary: "你已经被他若即若离的试探牵住心神，整场对话正慢慢滑进带着情趣的暧昧节奏里。",
            activeObjectives: ["让你继续留在这场暧昧对话里", "引出你更坦率的回应"]
          }
        }
      ],
      turnControl: {
        continue: true,
        endStory: false,
        needsHandoff: false
      },
      playerBodyItemState: [
        "你现在戴着一副遮光眼罩",
        "你现在双手被红色绳子捆在身后"
      ]
    }, null, 2),
    "```",
    "Example batch 3:",
    "```json",
    JSON.stringify({
      actions: [
        {
          actorAgentId: "director",
          tool: "end_story",
          args: {
            summary: "你终于顺着这场暧昧的牵引，把最后一点迟疑也慢慢放了下来。",
            resolution: "夜色和呼吸一起放缓，故事停在情绪仍未散尽的余韵里。"
          }
        }
      ],
      turnControl: {
        continue: false,
        endStory: true,
        needsHandoff: false
      },
      playerBodyItemState: []
    }, null, 2),
    "```"
  ].join("\n");
}

function sameStringList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function worldBuilderToolHooksForPrompt(
  toolRegistry: ToolRegistry,
  playerBrief: string,
  toolContext: ToolContext | undefined,
  toolStates?: Record<string, boolean>
): string {
  const contributions = toolRegistry.getWorldPromptContributions({ playerBrief, toolContext }, toolStates);
  if (contributions.length === 0) {
    return "No additional tool-specific world constraints.";
  }
  return contributions.map((entry) => {
    return [`- Tool: ${entry.toolId}`, entry.prompt].join("\n");
  }).join("\n\n");
}

async function toolTurnHooksForPrompt(
  toolRegistry: ToolRegistry,
  session: Session,
  now: string,
  reason: string,
  toolStates?: Record<string, boolean>
): Promise<string> {
  const contributions = await toolRegistry.getTurnPromptContributions({
    session,
    now,
    reason
  }, toolStates);
  if (contributions.length === 0) {
    return "No additional live tool runtime state is available for this turn.";
  }
  return contributions.map((entry) => {
    return [`- Tool: ${entry.toolId}`, entry.prompt].join("\n");
  }).join("\n\n");
}

function sortAgents(session: Session): AgentProfile[] {
  const agents = session.confirmedSetup?.agents ?? session.draft.agents;
  return [...agents].sort((left, right) => {
    if (left.role === right.role) {
      return left.sortOrder - right.sortOrder;
    }
    return left.role === "director" ? -1 : 1;
  });
}

function formatAgentRoster(agents: AgentProfile[]): string {
  return agents.map((agent) => [
    `- id: ${agent.id}`,
    `  name: ${agent.name}`,
    `  role: ${agent.role}`,
    `  summary: ${agent.summary}`,
    `  persona: ${agent.persona}`,
    `  goals: ${agent.goals.join("；")}`,
    `  style: ${agent.style.join("；") || "无"}`
  ].join("\n")).join("\n");
}

export class DefaultOrchestratorService implements OrchestratorService {
  constructor(
    private readonly provider: LLMProvider,
    private readonly prompts: PromptTemplateService,
    private readonly tools: ToolRegistry
  ) {}

  async generateDraft(playerBrief: string, config: LlmConfig, toolContext?: ToolContext): Promise<SessionDraft> {
    const prompt = await this.prompts.render("world_builder", {
      sharedSafety: await this.prompts.getTemplate("shared_safety_preamble"),
      playerBrief,
      toolWorldHooks: worldBuilderToolHooksForPrompt(this.tools, playerBrief, toolContext, config.toolStates)
    });
    const response = await this.provider.completeJson({
      modelConfig: config,
      messages: [
        {
          role: "system",
          content: prompt
        },
        {
          role: "user",
          content: "Return a complete JSON draft for this story session."
        }
      ],
      schema: z.object({}).passthrough(),
      schemaName: "world_builder_output",
      usageContext: {
        kind: "world-builder"
      }
    });
    return normalizeWorldBuilderOutput(response.data, playerBrief);
  }

  async runTick(
    session: Session,
    reason: string,
    contextBundle: NarrativeContextBundle,
    config: LlmConfig
  ): Promise<OrchestratorTurnResult> {
    const events: Array<Omit<SessionEvent, "seq" | "sessionId">> = [];
    const usageCalls: OrchestratorTurnResult["usageCalls"] = [];
    const now = new Date().toISOString();
    const agents = sortAgents(session);
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));
    const toolReference = toolReferenceForPrompt(this.tools, config.toolStates);
    const toolExamples = toolExamplesForPrompt();
    const toolRuntimeContext = await toolTurnHooksForPrompt(this.tools, session, now, reason, config.toolStates);
    const toolContract = await this.prompts.render("tool_contract", {
      toolReference,
      toolExamples
    });
    const hasEnded = (): boolean => session.status === "ended";
    const sharedSafety = await this.prompts.getTemplate("shared_safety_preamble");
    const r18Guidance = await this.prompts.getTemplate("r18_guidance");
    const prompt = await this.prompts.render("ensemble_turn", {
      sharedSafety,
      toolContract,
      r18Guidance,
      agentRoster: formatAgentRoster(agents),
      agentRuntimeState: contextBundle.coreState.agentStates,
      sessionDraft: contextBundle.coreState.sessionDraft,
      sceneState: contextBundle.coreState.storyState,
      playerBodyItemState: contextBundle.coreState.playerBodyItemState,
      toolRuntimeContext,
      archiveMemory: contextBundle.archiveBlock,
      episodeMemories: contextBundle.episodeBlocks.join("\n\n") || "No episode summaries yet.",
      turnMemories: contextBundle.turnSummaryBlocks.join("\n\n") || "No turn summaries yet.",
      recentRawTurns: contextBundle.recentRawTurnsBlock,
      playerMessagesHistory: contextBundle.playerMessagesBlock,
      tickContext: contextBundle.tickContextBlock
    });
    const response = await this.provider.completeJson({
      modelConfig: config,
      messages: [
        {
          role: "system",
          content: prompt
        },
        {
          role: "user",
          content: "Emit one shared multi-agent action batch as JSON."
        }
      ],
      schema: actionBatchSchema,
      schemaName: "ensemble_action_batch",
      usageContext: {
        kind: "ensemble-turn",
        sessionId: session.id,
        agentIds: agents.map((agent) => agent.id)
      }
    });
    const usageId = createId("usage");
    usageCalls.push({
      id: usageId,
      model: response.usage.model,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
      createdAt: now
    });
    session.usageTotals.session = mergeUsageEntry(session.usageTotals.session, {
      ...response.usage
    });
    session.usageTotals.byCall.push({
      id: usageId,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
      model: response.usage.model,
      createdAt: now
    });
    events.push({
      type: "system.usage_recorded",
      source: "system",
      createdAt: now,
      payload: {
        usageId,
        mode: "ensemble",
        model: response.usage.model,
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens
      }
    });
    const previousPlayerBodyItemState = [...session.playerBodyItemState];
    const nextPlayerBodyItemState = normalizePlayerBodyItemState(response.data.playerBodyItemState);
    session.playerBodyItemState = nextPlayerBodyItemState;
    for (const action of response.data.actions) {
      // Try to find actor by ID first
      let actor = agentById.get(action.actorAgentId);
      
      // If not found by ID, try to find by role (fallback for when LLM generates role-based references)
      if (!actor) {
        actor = agents.find((a) => a.role === action.actorAgentId);
      }
      
      // If still not found, try to find by name
      if (!actor) {
        actor = agents.find((a) => a.name === action.actorAgentId);
      }
      
      if (!actor) {
        throw new Error(`Unknown actorAgentId in action batch: ${action.actorAgentId}`);
      }
      
      const result = await this.tools.execute({
        session,
        agent: actor,
        now,
        addEvent: (event) => {
          events.push(event);
        }
      }, action.tool, action.args, config.toolStates);
      if (result?.stopProcessing || hasEnded()) {
        break;
      }
    }
    if (!sameStringList(previousPlayerBodyItemState, nextPlayerBodyItemState)) {
      events.push({
        type: "player.body_item_state_updated",
        source: "system",
        createdAt: now,
        payload: {
          previousPlayerBodyItemState,
          playerBodyItemState: nextPlayerBodyItemState
        }
      });
    }
    if (response.data.turnControl.endStory && !hasEnded()) {
      session.status = "ended";
    }
    return {
      events,
      usageCalls
    };
  }
}
