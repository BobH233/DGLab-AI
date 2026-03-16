import { describe, expect, it } from "vitest";
import type { LlmConfig } from "@dglab-ai/shared";
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
  constructor(private readonly payload: Record<string, unknown>) {}

  async completeJson<T>() {
    return {
      data: this.payload as T,
      rawText: "",
      usage: {
        model: "test-model",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        calls: 1,
        lastModel: "test-model",
        lastUpdatedAt: new Date().toISOString()
      }
    };
  }
}

describe("world builder normalization", () => {
  it("normalizes loose model output into a valid session draft", async () => {
    const orchestrator = new DefaultOrchestratorService(
      new FakeProvider({
        title: "测试草案",
        worldSummary: "世界",
        openingSituation: "开场",
        playerState: "状态",
        suggestedPace: "节奏",
        safetyFrame: "虚构",
        sceneGoals: ["目标一"],
        contentNotes: "备注一，备注二",
        agents: [
          {
            name: "塞西莉亚",
            role: "Director",
            personality: "冷酷主导者",
            style: "慵懒，压迫"
          }
        ]
      }),
      new FakePromptService(),
      createDefaultToolRegistry()
    );
    const draft = await orchestrator.generateDraft("玩家简介", config);

    expect(draft.playerBrief).toBe("玩家简介");
    expect(draft.contentNotes).toEqual(["备注一", "备注二"]);
    expect(draft.agents[0].role).toBe("director");
    expect(draft.agents[0].persona).toBe("冷酷主导者");
    expect(draft.agents[0].style).toEqual(["慵懒", "压迫"]);
    expect(draft.agents[0].goals.length).toBeGreaterThan(0);
    expect(draft.agents[0].id).toBe("agent_1");
  });

  it("uses second-person fallback copy for player-facing draft fields", async () => {
    const orchestrator = new DefaultOrchestratorService(
      new FakeProvider({}),
      new FakePromptService(),
      createDefaultToolRegistry()
    );
    const draft = await orchestrator.generateDraft("玩家简介", config);

    expect(draft.worldSummary).toContain("你的输入");
    expect(draft.openingSituation).toContain("你被压制");
    expect(draft.playerState).toContain("你当前处于被动");
    expect(draft.suggestedPace).toContain("让你在对话与局势变化里逐步感到压力累积");
  });
});
