import { flushPromises, mount } from "@vue/test-utils";
import type { Session, SessionEvent } from "@dglab-ai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SessionPrintPage from "../SessionPrintPage.vue";

const apiMocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<Session>>(),
  getEvents: vi.fn<() => Promise<SessionEvent[]>>()
}));

const routeState = vi.hoisted(() => ({
  query: {} as Record<string, string>
}));

vi.mock("../../api", () => ({
  api: {
    getSession: apiMocks.getSession,
    getEvents: apiMocks.getEvents
  }
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({
    params: {
      id: "session_1"
    },
    query: routeState.query
  }),
  useRouter: () => ({
    replace: vi.fn(async () => undefined)
  })
}));

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session_1",
    status: "active",
    title: "打印测试会话",
    initialPrompt: "brief",
    draft: {
      title: "打印测试会话",
      playerBrief: "brief",
      worldSummary: "这里是世界背景",
      openingSituation: "这里是开场局势",
      playerState: "这里是玩家处境",
      initialPlayerBodyItemState: ["你现在戴着一副眼罩"],
      suggestedPace: "slow",
      safetyFrame: "fiction",
      agents: [
        {
          id: "agent_1",
          name: "Alice",
          role: "director",
          summary: "负责主导剧情",
          persona: "冷静",
          goals: ["推进剧情"],
          style: ["克制"],
          boundaries: [],
          sortOrder: 0
        }
      ],
      sceneGoals: [],
      contentNotes: []
    },
    confirmedSetup: null,
    playerBodyItemState: ["你现在戴着一副眼罩"],
    storyState: {
      location: "studio",
      phase: "opening",
      tension: 4,
      summary: "这里是当前场景摘要",
      activeObjectives: []
    },
    agentStates: {},
    memoryState: {
      version: 1,
      lastProcessedSeq: 0,
      policy: {
        rawTurnsToKeep: 2,
        turnsPerEpisode: 4,
        maxTurnSummariesBeforeMerge: 6,
        maxEpisodeSummaries: 6,
        archiveCharBudget: 1200,
        episodeCharBudget: 1800,
        turnCharBudget: 1800,
        rawEventCharBudget: 3500
      },
      archiveSummary: null,
      episodeSummaries: [],
      turnSummaries: [],
      debug: {
        lastRefreshStatus: "idle",
        lastRefreshError: null,
        lastCompactionAt: null,
        lastCompactionMode: null,
        recentRuns: []
      }
    },
    timerState: {
      enabled: false,
      intervalMs: 5000,
      inFlight: false,
      nextTickAt: undefined,
      queuedReasons: [],
      queuedPlayerMessages: [],
      pendingWaits: []
    },
    usageTotals: {
      session: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        calls: 0,
        lastModel: "gpt-5.4-mini"
      },
      byAgent: {},
      byCall: [
        {
          id: "call_1",
          promptTokens: 120,
          completionTokens: 64,
          totalTokens: 184,
          model: "gpt-5.4-mini",
          createdAt: "2026-03-17T12:05:00.000Z"
        },
        {
          id: "call_2",
          promptTokens: 80,
          completionTokens: 40,
          totalTokens: 120,
          model: "gpt-4.1-mini",
          createdAt: "2026-03-17T12:06:00.000Z"
        }
      ]
    },
    llmConfigSnapshot: {
      provider: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-5.4-mini",
      temperature: 1,
      maxTokens: 1200,
      topP: 1,
      requestTimeoutMs: 120000,
      toolStates: {}
    },
    createdAt: "2026-03-17T12:00:00.000Z",
    updatedAt: "2026-03-17T12:00:00.000Z",
    lastSeq: 1,
    ...overrides
  };
}

describe("SessionPrintPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    routeState.query = {};
    apiMocks.getSession.mockResolvedValue(createSession());
    apiMocks.getEvents.mockResolvedValue([
      {
        sessionId: "session_1",
        seq: 1,
        type: "agent.speak_player",
        source: "agent",
        agentId: "agent_1",
        createdAt: "2026-03-17T12:05:00.000Z",
        payload: {
          speaker: "Alice",
          message: "欢迎来到新的场景。"
        }
      },
      {
        sessionId: "session_1",
        seq: 2,
        type: "system.timer_updated",
        source: "system",
        createdAt: "2026-03-17T12:05:10.000Z",
        payload: {
          enabled: true,
          intervalMs: 5000
        }
      },
      {
        sessionId: "session_1",
        seq: 3,
        type: "system.usage_recorded",
        source: "system",
        createdAt: "2026-03-17T12:05:20.000Z",
        payload: {
          totalTokens: 184,
          model: "gpt-5.4-mini"
        }
      },
      {
        sessionId: "session_1",
        seq: 4,
        type: "system.tick_failed",
        source: "system",
        createdAt: "2026-03-17T12:05:30.000Z",
        payload: {
          message: "推进失败",
          retryable: true
        }
      }
    ]);
  });

  afterEach(() => {
    document.head.querySelectorAll('style[data-print-orientation="session-print"]').forEach((element) => {
      element.remove();
    });
  });

  it("renders a print-friendly summary of the session", async () => {
    const wrapper = mount(SessionPrintPage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();

    expect(wrapper.text()).toContain("打印测试会话");
    expect(wrapper.text()).toContain("当前打印模式为竖版");
    expect(wrapper.text()).toContain("世界背景");
    expect(wrapper.text()).toContain("当前玩家身体道具");
    expect(wrapper.text()).toContain("你现在戴着一副眼罩");
    expect(wrapper.text()).toContain("Alice");
    expect(wrapper.text()).toContain("欢迎来到新的场景。");
    expect(wrapper.text()).toContain("会话使用的后端模型");
    expect(wrapper.text()).toContain("openai-compatible");
    expect(wrapper.text()).toContain("https://api.openai.com/v1");
    expect(wrapper.text()).toContain("gpt-5.4-mini");
    expect(wrapper.text()).toContain("gpt-4.1-mini");
    expect(wrapper.text()).not.toContain("自动推进已开启");
    expect(wrapper.text()).not.toContain("184 tokens");
    expect(wrapper.text()).not.toContain("推进失败");
  });

  it("invokes window.print when the export button is clicked", async () => {
    const printSpy = vi.fn();
    vi.stubGlobal("print", printSpy);

    const wrapper = mount(SessionPrintPage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();
    await wrapper.get("button.button.primary").trigger("click");

    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it("auto prints when opened from the one-click print button", async () => {
    const printSpy = vi.fn();
    vi.stubGlobal("print", printSpy);
    routeState.query = {
      autoprint: "1",
      orientation: "landscape"
    };

    mount(SessionPrintPage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();

    expect(printSpy).toHaveBeenCalledTimes(1);
    const styleElement = document.head.querySelector('style[data-print-orientation="session-print"]');
    expect(styleElement?.textContent).toContain("size: A4 landscape");
  });

  it("injects a portrait print rule by default", async () => {
    mount(SessionPrintPage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();

    const styleElement = document.head.querySelector('style[data-print-orientation="session-print"]');
    expect(styleElement?.textContent).toContain("size: A4 portrait");
  });
});
