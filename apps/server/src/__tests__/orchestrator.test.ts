import { describe, expect, it } from "vitest";
import { createEmptyUsageStats, type ActionBatch, type LlmConfig, type Session, type SessionEvent } from "@dglab-ai/shared";
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
  requestTimeoutMs: 1000
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
    timerState: {
      enabled: false,
      intervalMs: 10000,
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
      ensembleTurn: "1",
      sceneSummarizer: "1"
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSeq: 0,
    lastSnapshotSeq: 0
  };
}

class FakePromptService {
  async getTemplate(name: string): Promise<string> {
    return `template:${name}`;
  }

  async render(name: string): Promise<string> {
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
            direction: "辅助者无声地合上了身后的门。"
          },
          whyVisible: "",
          targetScope: "scene"
        },
        {
          actorAgentId: "director",
          tool: "update_scene_state",
          args: {
            phase: "pressure",
            tension: 6,
            summary: "The director closes in."
          },
          whyVisible: "",
          targetScope: "scene"
        },
        {
          actorAgentId: "director",
          tool: "speak_to_player",
          args: {
            message: "回答我。"
          },
          whyVisible: "",
          targetScope: "player"
        }
      ],
      turnControl: {
        continue: true,
        endStory: false,
        needsHandoff: false
      }
    });
    const orchestrator = new DefaultOrchestratorService(
      provider,
      new FakePromptService(),
      createDefaultToolRegistry()
    );
    const session = createSession();
    const result = await orchestrator.runTick(session, "player_message", [] as SessionEvent[], config);

    expect(session.storyState.phase).toBe("pressure");
    expect(session.storyState.tension).toBe(6);
    expect(result.events.some((event) => event.type === "scene.updated")).toBe(true);
    expect(result.events.some((event) => event.type === "agent.stage_direction")).toBe(true);
    expect(result.events.some((event) => event.type === "agent.speak_player")).toBe(true);
    expect(session.usageTotals.session.totalTokens).toBe(30);
    expect(provider.calls).toBe(1);
    expect(result.usageCalls).toHaveLength(1);
  });
});
