import { flushPromises, mount } from "@vue/test-utils";
import type { Session, SessionEvent } from "@dglab-ai/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SessionPrintPage from "../SessionPrintPage.vue";

const apiMocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<Session>>(),
  getEvents: vi.fn<() => Promise<SessionEvent[]>>()
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
    }
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
        calls: 0
      },
      byAgent: {},
      byCall: []
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
      }
    ]);
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
    expect(wrapper.text()).toContain("世界背景");
    expect(wrapper.text()).toContain("Alice");
    expect(wrapper.text()).toContain("欢迎来到新的场景。");
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
});
