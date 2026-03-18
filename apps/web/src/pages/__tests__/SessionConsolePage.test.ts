import { flushPromises, mount } from "@vue/test-utils";
import type { Session, SessionEvent } from "@dglab-ai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SessionConsolePage from "../SessionConsolePage.vue";

const apiMocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<Session>>(),
  getEvents: vi.fn<() => Promise<SessionEvent[]>>(),
  streamUrl: vi.fn(() => "http://example.test/stream"),
  postMessage: vi.fn(),
  retrySession: vi.fn(),
  updateTimer: vi.fn(),
  requestAutoTick: vi.fn<() => Promise<Session>>()
}));

vi.mock("../../api", () => ({
  api: {
    getSession: apiMocks.getSession,
    getEvents: apiMocks.getEvents,
    streamUrl: apiMocks.streamUrl,
    postMessage: apiMocks.postMessage,
    retrySession: apiMocks.retrySession,
    updateTimer: apiMocks.updateTimer,
    requestAutoTick: apiMocks.requestAutoTick
  }
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({
    params: {
      id: "session_1"
    }
  })
}));

class FakeEventSource {
  constructor(_url: string) {}
  addEventListener() {}
  close() {}
}

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session_1",
    status: "active",
    title: "测试会话",
    initialPrompt: "brief",
    draft: {
      title: "测试会话",
      playerBrief: "brief",
      worldSummary: "world",
      openingSituation: "opening",
      playerState: "player",
      suggestedPace: "slow",
      safetyFrame: "fiction",
      agents: [],
      sceneGoals: [],
      contentNotes: []
    },
    confirmedSetup: null,
    storyState: {
      location: "study",
      phase: "teasing",
      tension: 6,
      summary: "场景摘要",
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
      enabled: true,
      intervalMs: 5000,
      inFlight: false,
      nextTickAt: "2026-03-17T12:00:05.000Z",
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
    lastSeq: 0,
    ...overrides
  };
}

function normalizedText(wrapper: ReturnType<typeof mount>): string {
  return wrapper.text().replace(/\s+/g, " ").trim();
}

describe("SessionConsolePage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T12:00:00.000Z"));
    vi.resetAllMocks();
    vi.stubGlobal("EventSource", FakeEventSource);
    apiMocks.getEvents.mockResolvedValue([]);
    apiMocks.requestAutoTick.mockResolvedValue(createSession({
      timerState: {
        enabled: true,
        intervalMs: 5000,
        inFlight: false,
        nextTickAt: "2026-03-17T12:00:05.000Z",
        queuedReasons: [],
        queuedPlayerMessages: [],
        pendingWaits: []
      }
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the auto-advance countdown in the automation panel", async () => {
    apiMocks.getSession.mockResolvedValue(createSession());

    const wrapper = mount(SessionConsolePage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();

    expect(normalizedText(wrapper)).toContain("约 5.0 秒 后自动推进");
    expect(normalizedText(wrapper)).toContain("下一次计划触发时间");
  });

  it("explains that auto-advance will defer while the current tick is still running", async () => {
    apiMocks.getSession.mockResolvedValue(createSession());
    apiMocks.getEvents.mockResolvedValue([
      {
        sessionId: "session_1",
        seq: 1,
        type: "system.tick_started",
        source: "system",
        createdAt: "2026-03-17T12:00:00.000Z",
        payload: {
          reason: "player_message"
        }
      }
    ]);

    const wrapper = mount(SessionConsolePage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();

    expect(normalizedText(wrapper)).toContain("Thinking");
    expect(normalizedText(wrapper)).toContain("约 5.0 秒 后自动推进");
    expect(normalizedText(wrapper)).toContain("如果计时到点，会顺延 5.0 秒，不会并发触发");
  });

  it("requests an auto tick from the frontend when the countdown is due", async () => {
    apiMocks.getSession.mockResolvedValue(createSession({
      timerState: {
        enabled: true,
        intervalMs: 5000,
        inFlight: false,
        nextTickAt: "2026-03-17T11:59:59.000Z",
        queuedReasons: [],
        queuedPlayerMessages: [],
        pendingWaits: []
      }
    }));

    mount(SessionConsolePage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();
    await vi.advanceTimersByTimeAsync(300);

    expect(apiMocks.requestAutoTick).toHaveBeenCalledWith("session_1");
  });

  it("opens the print page and requests autoprint from a single click", async () => {
    apiMocks.getSession.mockResolvedValue(createSession());
    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);

    const wrapper = mount(SessionConsolePage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();
    await wrapper.get('button.button.secondary[type="button"]').trigger("click");

    expect(openSpy).toHaveBeenCalledWith(
      "/sessions/session_1/print?orientation=portrait&autoprint=1",
      "_blank",
      "noopener"
    );

    openSpy.mockRestore();
  });
});
