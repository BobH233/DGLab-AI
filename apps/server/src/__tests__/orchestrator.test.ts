import { describe, expect, it } from "vitest";
import { createEmptyMemoryState, createEmptyUsageStats, defaultToolStates, type ActionBatch, type LlmConfig, type NarrativeContextBundle, type Session } from "@dglab-ai/shared";
import { DefaultOrchestratorService } from "../services/OrchestratorService.js";
import { createDefaultToolRegistry } from "../tools/defaultTools.js";

const config: LlmConfig = {
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "test",
  model: "test-model",
  temperature: 0.7,
  maxTokens: 500,
  topP: 1,
  requestTimeoutMs: 1000,
  toolStates: defaultToolStates()
};

function createSession(): Session {
  return {
    id: "session_test",
    status: "active",
    title: "Test",
    initialPrompt: "brief",
    draft: {
      title: "Test",
      playerBrief: "brief",
      worldSummary: "world",
      openingSituation: "opening",
      playerState: "player state",
      initialPlayerBodyItemState: ["你现在戴着一副遮光眼罩"],
      suggestedPace: "slow burn",
      safetyFrame: "fiction only",
      agents: [
        {
          id: "director",
          name: "Director",
          role: "director",
          summary: "summary",
          persona: "calculating",
          goals: ["control"],
          style: ["cold"],
          boundaries: [],
          sortOrder: 0
        },
        {
          id: "support_1",
          name: "Support",
          role: "support",
          summary: "support summary",
          persona: "observant",
          goals: ["intensify"],
          style: ["quiet"],
          boundaries: [],
          sortOrder: 1
        }
      ],
      sceneGoals: ["goal"],
      contentNotes: []
    },
    confirmedSetup: {
      title: "Test",
      playerBrief: "brief",
      worldSummary: "world",
      openingSituation: "opening",
      playerState: "player state",
      initialPlayerBodyItemState: ["你现在戴着一副遮光眼罩"],
      suggestedPace: "slow burn",
      safetyFrame: "fiction only",
      agents: [
        {
          id: "director",
          name: "Director",
          role: "director",
          summary: "summary",
          persona: "calculating",
          goals: ["control"],
          style: ["cold"],
          boundaries: [],
          sortOrder: 0
        },
        {
          id: "support_1",
          name: "Support",
          role: "support",
          summary: "support summary",
          persona: "observant",
          goals: ["intensify"],
          style: ["quiet"],
          boundaries: [],
          sortOrder: 1
        }
      ],
      sceneGoals: ["goal"],
      contentNotes: []
    },
    playerBodyItemState: ["你现在戴着一副遮光眼罩"],
    storyState: {
      location: "cell",
      phase: "opening",
      tension: 3,
      summary: "opening",
      activeObjectives: ["goal"]
    },
    agentStates: {
      director: {
        mood: "focused",
        intent: "observe"
      },
      support_1: {
        mood: "focused",
        intent: "observe"
      }
    },
    memoryState: createEmptyMemoryState(),
    timerState: {
      enabled: false,
      intervalMs: 10000,
      inFlight: false,
      queuedReasons: ["player_message"],
      queuedPlayerMessages: ["你好"],
      pendingWaits: []
    },
    usageTotals: createEmptyUsageStats(),
    llmConfigSnapshot: config,
    promptVersions: {
      sharedSafety: "1",
      toolContract: "1",
      worldBuilder: "1",
      directorAgent: "1",
      supportAgent: "1",
      ensembleTurn: "1"
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSeq: 0
  };
}

class FakePromptService {
  public renders: Array<{ name: string; data: Record<string, unknown> }> = [];

  async getTemplate(name: string): Promise<string> {
    return `template:${name}`;
  }

  async render(name: string, data: Record<string, unknown> = {}): Promise<string> {
    this.renders.push({ name, data });
    return `rendered:${name}`;
  }

  versions() {
    return {};
  }
}

class FakeProvider {
  public calls = 0;

  constructor(private readonly batch: ActionBatch) {}

  async completeJson<T>() {
    this.calls += 1;
    return {
      data: this.batch as T,
      rawText: JSON.stringify(this.batch),
      usage: {
        model: "test-model",
        promptTokens: 12,
        completionTokens: 18,
        totalTokens: 30,
        calls: 1,
        lastModel: "test-model",
        lastUpdatedAt: new Date().toISOString()
      }
    };
  }
}

describe("DefaultOrchestratorService", () => {
  it("executes a single shared action batch and mutates session state", async () => {
    const provider = new FakeProvider({
      actions: [
        {
          actorAgentId: "support_1",
          tool: "perform_stage_direction",
          args: {
            direction: "你看见辅助者无声地把灯光调暗了一点，像是在替这一刻留出更柔软的余地。"
          },
          whyVisible: "",
          targetScope: "scene"
        },
        {
          actorAgentId: "director",
          tool: "update_scene_state",
          args: {
            phase: "teasing",
            tension: 6,
            summary: "你已经被他不紧不慢的语气牵住心神，气氛正慢慢变得暧昧起来。"
          },
          whyVisible: "",
          targetScope: "scene"
        },
        {
          actorAgentId: "director",
          tool: "speak_to_player",
          args: {
            message: "别急着移开视线，让我先听你把这句话说完。"
          },
          whyVisible: "",
          targetScope: "player"
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
    });
    const orchestrator = new DefaultOrchestratorService(
      provider,
      new FakePromptService(),
      createDefaultToolRegistry()
    );
    const session = createSession();
    const contextBundle: NarrativeContextBundle = {
      coreState: {
        sessionDraft: "{}",
        storyState: "{}",
        agentStates: "{}",
        playerBodyItemState: "[]"
      },
      archiveBlock: "No archive summary yet.",
      episodeBlocks: [],
      turnSummaryBlocks: [],
      recentRawTurns: [],
      recentRawTurnsBlock: "No recent raw turns retained.",
      playerMessagesBlock: "No player messages yet.",
      tickContextBlock: "{\"reason\":\"player_message\"}",
      stats: {
        charCounts: {
          archive: 0,
          episodes: 0,
          turns: 0,
          rawTurns: 0,
          playerMessages: 0,
          tickContext: 0,
          coreState: 0
        },
        droppedBlocks: [],
        rawTurnsIncluded: 0,
        episodeCountIncluded: 0,
        turnSummaryCountIncluded: 0,
        usedFallback: false
      }
    };
    const result = await orchestrator.runTick(session, "player_message", contextBundle, config);

    expect(session.storyState.phase).toBe("teasing");
    expect(session.storyState.tension).toBe(6);
    expect(session.playerBodyItemState).toEqual([
      "你现在戴着一副遮光眼罩",
      "你现在双手被红色绳子捆在身后"
    ]);
    expect(result.events.some((event) => event.type === "scene.updated")).toBe(true);
    expect(result.events.some((event) => event.type === "player.body_item_state_updated")).toBe(true);
    expect(result.events.some((event) => event.type === "agent.stage_direction")).toBe(true);
    expect(result.events.some((event) => event.type === "agent.speak_player")).toBe(true);
    expect(session.usageTotals.session.totalTokens).toBe(30);
    expect(provider.calls).toBe(1);
    expect(result.usageCalls).toHaveLength(1);
  });

  it("injects live tool runtime state into the ensemble prompt when a tool provides it", async () => {
    const provider = new FakeProvider({
      actions: [],
      turnControl: {
        continue: true,
        endStory: false,
        needsHandoff: false
      },
      playerBodyItemState: ["你现在戴着一副遮光眼罩"]
    });
    const promptService = new FakePromptService();
    const toolRegistry = createDefaultToolRegistry();
    const session = createSession();
    const now = new Date().toISOString();

    await toolRegistry.execute({
      session,
      agent: session.draft.agents[0],
      now,
      addEvent: () => undefined
    }, "control_vibe_toy", {
      intensityPercent: 72,
      mode: "pulse"
    });

    const orchestrator = new DefaultOrchestratorService(
      provider,
      promptService,
      toolRegistry
    );
    const contextBundle: NarrativeContextBundle = {
      coreState: {
        sessionDraft: "{}",
        storyState: "{}",
        agentStates: "{}",
        playerBodyItemState: "[]"
      },
      archiveBlock: "No archive summary yet.",
      episodeBlocks: [],
      turnSummaryBlocks: [],
      recentRawTurns: [],
      recentRawTurnsBlock: "No recent raw turns retained.",
      playerMessagesBlock: "No player messages yet.",
      tickContextBlock: "{\"reason\":\"player_message\"}",
      stats: {
        charCounts: {
          archive: 0,
          episodes: 0,
          turns: 0,
          rawTurns: 0,
          playerMessages: 0,
          tickContext: 0,
          coreState: 0
        },
        droppedBlocks: [],
        rawTurnsIncluded: 0,
        episodeCountIncluded: 0,
        turnSummaryCountIncluded: 0,
        usedFallback: false
      }
    };

    await orchestrator.runTick(session, "player_message", contextBundle, config);

    const ensembleRender = promptService.renders.find((entry) => entry.name === "ensemble_turn");

    expect(String(ensembleRender?.data.toolRuntimeContext)).toContain("control_vibe_toy");
    expect(String(ensembleRender?.data.toolRuntimeContext)).toContain("强度 72%");
    expect(String(ensembleRender?.data.toolRuntimeContext)).toContain("模式：pulse");
  });
});
