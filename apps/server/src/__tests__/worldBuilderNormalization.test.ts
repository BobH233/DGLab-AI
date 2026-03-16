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
  public renders: Array<{ name: string; data: Record<string, unknown> }> = [];

  async getTemplate(name: string): Promise<string> {
    return `template:${name}`;
  }

  async render(name: string, data: Record<string, unknown>): Promise<string> {
    this.renders.push({ name, data });
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
            style: "慵懒，暧昧"
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
    expect(draft.agents[0].style).toEqual(["慵懒", "暧昧"]);
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
    expect(draft.openingSituation).toContain("暧昧对峙");
    expect(draft.playerState).toContain("你正被卷入一场充满试探");
    expect(draft.suggestedPace).toContain("让你在互动、试探与情绪升温里逐步沉浸其中");
  });

  it("injects enabled tool world hooks into the world builder prompt", async () => {
    const prompts = new FakePromptService();
    const orchestrator = new DefaultOrchestratorService(
      new FakeProvider({}),
      prompts,
      createDefaultToolRegistry()
    );

    await orchestrator.generateDraft("玩家简介", config);

    const worldBuilderRender = prompts.renders.find((entry) => entry.name === "world_builder");
    expect(worldBuilderRender?.data.toolWorldHooks).toContain("control_vibe_toy");
    expect(worldBuilderRender?.data.toolWorldHooks).toContain("震动小玩具");
  });
});
