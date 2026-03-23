import { flushPromises, mount } from "@vue/test-utils";
import type { Session, SessionTtsPerformanceState } from "@dglab-ai/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PerformanceModePage from "../PerformanceModePage.vue";

const apiMocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<Session>>(),
  getSessionTtsPerformance: vi.fn<() => Promise<SessionTtsPerformanceState>>(),
  startSessionTtsBatch: vi.fn(),
  cancelSessionTtsBatch: vi.fn(),
  getSessionReadableTts: vi.fn()
}));

vi.mock("../../api", () => ({
  api: {
    getSession: apiMocks.getSession,
    getSessionTtsPerformance: apiMocks.getSessionTtsPerformance,
    startSessionTtsBatch: apiMocks.startSessionTtsBatch,
    cancelSessionTtsBatch: apiMocks.cancelSessionTtsBatch,
    getSessionReadableTts: apiMocks.getSessionReadableTts
  }
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({
    params: {
      id: "session_1"
    }
  })
}));

class FakeAudio {
  public preload = "";
  public src = "";
  public currentTime = 0;
  public duration = 0;
  public onended: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public onloadedmetadata: (() => void) | null = null;
  public oncanplay: (() => void) | null = null;

  pause() {}
  load() {
    this.onloadedmetadata?.();
    this.oncanplay?.();
  }
  play() {
    return Promise.resolve();
  }
}

function createSession(): Session {
  return {
    id: "session_1",
    status: "active",
    title: "演出测试会话",
    initialPrompt: "brief",
    draft: {
      title: "演出测试会话",
      playerBrief: "brief",
      worldSummary: "世界背景段落",
      openingSituation: "开场局势段落",
      playerState: "玩家处境段落",
      initialPlayerBodyItemState: [],
      suggestedPace: "slow",
      safetyFrame: "fiction",
      agents: [],
      sceneGoals: [],
      contentNotes: []
    },
    confirmedSetup: null,
    playerBodyItemState: [],
    storyState: {
      location: "房间",
      phase: "opening",
      tension: 3,
      summary: "摘要",
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
    createdAt: "2026-03-23T10:00:00.000Z",
    updatedAt: "2026-03-23T10:00:00.000Z",
    lastSeq: 4
  };
}

function createPerformanceState(): SessionTtsPerformanceState {
  return {
    sessionId: "session_1",
    ttsBaseUrlConfigured: true,
    totalReadableCount: 6,
    cachedReadableCount: 4,
    readyReadableCount: 4,
    missingReadableCount: 2,
    missingVoiceSpeakers: [],
    readyForFullPlayback: false,
    batchJob: null,
    items: [
      {
        readable: {
          id: "setup:worldSummary",
          source: "setup",
          kind: "world_summary",
          title: "世界背景",
          kicker: "背景",
          displaySpeaker: "旁白",
          ttsSpeaker: "旁白",
          text: "世界背景段落",
          createdAt: "2026-03-23T10:00:00.000Z"
        },
        cacheKey: "setup-world",
        hasVoiceMapping: true,
        referenceId: "narrator",
        isCached: true,
        durationMs: 1800,
        readyForPlayback: true
      },
      {
        readable: {
          id: "event:1",
          source: "event",
          kind: "stage_direction",
          seq: 1,
          eventType: "agent.stage_direction",
          title: "丽莎 的动作",
          kicker: "舞台动作",
          displaySpeaker: "丽莎",
          ttsSpeaker: "旁白",
          text: "她轻轻扶住你的肩。",
          createdAt: "2026-03-23T10:00:30.000Z"
        },
        cacheKey: "event-1",
        hasVoiceMapping: true,
        referenceId: "narrator",
        isCached: true,
        durationMs: 900,
        readyForPlayback: true
      },
      {
        readable: {
          id: "event:2",
          source: "event",
          kind: "story_effect",
          seq: 2,
          eventType: "agent.story_effect",
          title: "灯光变化",
          kicker: "剧情变化",
          displaySpeaker: "旁白",
          ttsSpeaker: "旁白",
          text: "房间的灯光忽然暗了下来。",
          createdAt: "2026-03-23T10:00:40.000Z"
        },
        cacheKey: "event-2",
        hasVoiceMapping: true,
        referenceId: "narrator",
        isCached: true,
        durationMs: 700,
        readyForPlayback: true
      },
      {
        readable: {
          id: "setup:openingSituation",
          source: "setup",
          kind: "opening_situation",
          title: "开场局势",
          kicker: "开场",
          displaySpeaker: "旁白",
          ttsSpeaker: "旁白",
          text: "开场局势段落",
          createdAt: "2026-03-23T10:00:00.000Z"
        },
        cacheKey: "setup-opening",
        hasVoiceMapping: true,
        referenceId: "narrator",
        isCached: true,
        durationMs: 1600,
        readyForPlayback: true
      },
      {
        readable: {
          id: "setup:playerState",
          source: "setup",
          kind: "player_state",
          title: "玩家处境",
          kicker: "视角",
          displaySpeaker: "旁白",
          ttsSpeaker: "旁白",
          text: "玩家处境段落",
          createdAt: "2026-03-23T10:00:00.000Z"
        },
        cacheKey: "setup-player",
        hasVoiceMapping: true,
        referenceId: "narrator",
        isCached: false,
        readyForPlayback: false
      },
      {
        readable: {
          id: "event:4",
          source: "event",
          kind: "character_speech",
          seq: 4,
          eventType: "agent.speak_player",
          title: "丽莎",
          kicker: "角色发言",
          displaySpeaker: "丽莎",
          ttsSpeaker: "丽莎",
          text: "你今晚得乖一点。",
          createdAt: "2026-03-23T10:01:00.000Z"
        },
        cacheKey: "event-4",
        hasVoiceMapping: true,
        referenceId: "lisa",
        isCached: false,
        readyForPlayback: false
      }
    ]
  };
}

describe("PerformanceModePage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("Audio", FakeAudio);
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn(() => "blob:preview-audio"),
      configurable: true
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: vi.fn(),
      configurable: true
    });
    apiMocks.getSession.mockResolvedValue(createSession());
    apiMocks.getSessionTtsPerformance.mockResolvedValue(createPerformanceState());
    apiMocks.getSessionReadableTts.mockResolvedValue(new Blob(["fake-audio"], { type: "audio/mpeg" }));
  });

  it("renders setup cards and the batch generation action", async () => {
    const wrapper = mount(PerformanceModePage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();

    expect(wrapper.text()).toContain("世界背景");
    expect(wrapper.text()).toContain("开场局势");
    expect(wrapper.text()).toContain("玩家处境");
    expect(wrapper.text()).toContain("生成缺失的全文 TTS");
    expect(wrapper.text()).toContain("还不能开始全文播放");
  });

  it("recalculates total duration when stage directions and story effects are toggled", async () => {
    const readyPerformance = createPerformanceState();
    readyPerformance.readyForFullPlayback = true;
    readyPerformance.cachedReadableCount = readyPerformance.totalReadableCount;
    readyPerformance.readyReadableCount = readyPerformance.totalReadableCount;
    readyPerformance.missingReadableCount = 0;
    readyPerformance.items = readyPerformance.items.map((item) => ({
      ...item,
      isCached: true,
      readyForPlayback: true,
      durationMs: item.durationMs ?? 1200
    }));
    apiMocks.getSessionTtsPerformance.mockResolvedValue(readyPerformance);

    const wrapper = mount(PerformanceModePage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();

    expect(wrapper.get('[data-testid="performance-total-duration"]').text()).toBe("00:09");

    await wrapper.get('[data-testid="performance-stage-direction-toggle"]').setValue(false);
    await flushPromises();
    expect(wrapper.get('[data-testid="performance-total-duration"]').text()).toBe("00:08");

    await wrapper.get('[data-testid="performance-story-effect-toggle"]').setValue(false);
    await flushPromises();
    expect(wrapper.get('[data-testid="performance-total-duration"]').text()).toBe("00:07");
  });

  it("unlocks playback when skipped card types are the only unreadied items", async () => {
    const selectivePerformance = createPerformanceState();
    selectivePerformance.items = selectivePerformance.items.map((item) => {
      if (item.readable.kind === "stage_direction" || item.readable.kind === "story_effect") {
        return {
          ...item,
          isCached: false,
          readyForPlayback: false,
          durationMs: undefined
        };
      }
      return {
        ...item,
        isCached: true,
        readyForPlayback: true,
        durationMs: item.durationMs ?? 1200
      };
    });
    selectivePerformance.cachedReadableCount = 4;
    selectivePerformance.readyReadableCount = 4;
    selectivePerformance.missingReadableCount = 2;
    selectivePerformance.readyForFullPlayback = false;
    apiMocks.getSessionTtsPerformance.mockResolvedValue(selectivePerformance);

    const wrapper = mount(PerformanceModePage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();

    expect(wrapper.get('[data-testid="performance-play-toggle"]').attributes("disabled")).toBeDefined();

    await wrapper.get('[data-testid="performance-stage-direction-toggle"]').setValue(false);
    await wrapper.get('[data-testid="performance-story-effect-toggle"]').setValue(false);
    await flushPromises();

    expect(wrapper.get('[data-testid="performance-play-toggle"]').attributes("disabled")).toBeUndefined();
  });

  it("allows double-click preview for a cached card even before full playback is ready", async () => {
    const wrapper = mount(PerformanceModePage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();

    const firstCard = wrapper.findAll(".performance-card")[0];
    expect(firstCard.exists()).toBe(true);

    await firstCard.trigger("dblclick");
    await flushPromises();

    expect(apiMocks.getSessionReadableTts).toHaveBeenCalledWith("session_1", "setup:worldSummary");
    expect(wrapper.get('input[type="range"]').attributes("disabled")).toBeUndefined();
  });
});
