import { mount, flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { MemoryDebugResponse, Session } from "@dglab-ai/shared";
import SessionMemoryDebugPage from "../SessionMemoryDebugPage.vue";

const apiMocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<Session>>(),
  getMemoryDebug: vi.fn<() => Promise<MemoryDebugResponse>>(),
  streamUrl: vi.fn(() => "http://example.test/stream")
}));

vi.mock("../../api", () => ({
  api: {
    getSession: apiMocks.getSession,
    getMemoryDebug: apiMocks.getMemoryDebug,
    streamUrl: apiMocks.streamUrl
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

describe("SessionMemoryDebugPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  it("renders memory overview and prompt preview blocks", async () => {
    apiMocks.getSession.mockResolvedValue({
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
        activeObjectives: ["继续回应"]
      },
      agentStates: {},
      memoryState: {
        version: 1,
        lastProcessedSeq: 15,
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
          lastRefreshAt: new Date().toISOString(),
          lastRefreshStatus: "success",
          lastRefreshError: null,
          lastCompactionAt: null,
          lastCompactionMode: null,
          recentRuns: []
        }
      },
      timerState: {
        enabled: false,
        intervalMs: 10000,
        inFlight: false,
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSeq: 15
    } as Session);

    apiMocks.getMemoryDebug.mockResolvedValue({
      sessionId: "session_1",
      memoryState: {
        version: 1,
        lastProcessedSeq: 15,
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
        archiveSummary: {
          id: "archive_1",
          level: "archive",
          fromSeq: 1,
          toSeq: 10,
          turnStart: 1,
          turnEnd: 10,
          createdAt: new Date().toISOString(),
          scene: {
            phase: "opening",
            location: "study",
            tension: 4,
            summary: "archive summary"
          },
          playerTrajectory: "玩家被卷入局势。",
          keyDevelopments: ["开局已沉淀"],
          characterStates: ["导演主导"],
          unresolvedThreads: ["等待回应"],
          carryForward: "继续推进。",
          source: "derived"
        },
        episodeSummaries: [],
        turnSummaries: [],
        debug: {
          lastRefreshAt: new Date().toISOString(),
          lastRefreshStatus: "success",
          lastRefreshError: null,
          lastCompactionAt: null,
          lastCompactionMode: null,
          recentRuns: [
            {
              id: "run_1",
              kind: "turn_refresh",
              startedAt: new Date().toISOString(),
              finishedAt: new Date().toISOString(),
              durationMs: 12,
              status: "success",
              inputRange: "seq 11-15",
              outputLevel: "turn",
              sourceModel: null,
              errorMessage: null
            }
          ]
        }
      },
      recentRawTurns: [
        {
          id: "turn_3",
          fromSeq: 11,
          toSeq: 15,
          turnStart: 12,
          turnEnd: 15,
          eventCount: 5,
          events: []
        }
      ],
      assembledContext: {
        coreState: {
          sessionDraft: "{}",
          storyState: "{}",
          agentStates: "{}"
        },
        archiveBlock: "Archive Summary\narchive summary",
        episodeBlocks: [],
        turnSummaryBlocks: [],
        recentRawTurns: [
          {
            id: "turn_3",
            fromSeq: 11,
            toSeq: 15,
            turnStart: 12,
            turnEnd: 15,
            eventCount: 5,
            events: []
          }
        ],
        recentRawTurnsBlock: "turn seq 11-15",
        playerMessagesBlock: "[11] 继续。",
        tickContextBlock: "{\"reason\":\"debug_preview\"}",
        stats: {
          charCounts: {
            archive: 20,
            episodes: 0,
            turns: 0,
            rawTurns: 14,
            playerMessages: 7,
            tickContext: 24,
            coreState: 6
          },
          droppedBlocks: [],
          rawTurnsIncluded: 1,
          episodeCountIncluded: 0,
          turnSummaryCountIncluded: 0,
          usedFallback: false
        }
      },
      storyStateSnapshot: {
        location: "study",
        phase: "teasing",
        tension: 6,
        summary: "场景摘要",
        activeObjectives: ["继续回应"]
      },
      queueSnapshot: {
        queuedPlayerMessages: [],
        queuedReasons: []
      }
    });

    const wrapper = mount(SessionMemoryDebugPage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();

    expect(wrapper.text()).toContain("测试会话");
    expect(wrapper.text()).toContain("Memory Debug");
    expect(wrapper.text()).toContain("lastProcessedSeq");
    expect(wrapper.text()).toContain("Archive Summary");
    expect(wrapper.text()).toContain("archive summary");
    expect(wrapper.text()).toContain("Prompt Preview");
    expect(wrapper.text()).toContain("Player Ledger");
    expect(wrapper.text()).toContain("Run History");
  });
});
