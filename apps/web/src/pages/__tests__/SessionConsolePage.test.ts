import { flushPromises, mount } from "@vue/test-utils";
import { createDefaultAppConfig, defaultToolStates, type Session, type SessionEvent } from "@dglab-ai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConfigStore } from "../../configStore";
import SessionConsolePage from "../SessionConsolePage.vue";

const apiMocks = vi.hoisted(() => ({
  getAppConfig: vi.fn(),
  getSession: vi.fn<() => Promise<Session>>(),
  getEvents: vi.fn<() => Promise<SessionEvent[]>>(),
  streamUrl: vi.fn(() => "http://example.test/stream"),
  postMessage: vi.fn(),
  retrySession: vi.fn(),
  updateTimer: vi.fn(),
  requestAutoTick: vi.fn<() => Promise<Session>>()
}));

const localStorageState = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageState.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageState.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    localStorageState.delete(key);
  })
};

vi.mock("../../api", () => ({
  api: {
    getAppConfig: apiMocks.getAppConfig,
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
  static instances: FakeEventSource[] = [];
  private readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor(_url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string, payload: Record<string, unknown>) {
    const listeners = this.listeners.get(type) ?? [];
    const event = {
      data: JSON.stringify(payload)
    } as MessageEvent;
    for (const listener of listeners) {
      listener(event);
    }
  }

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
      initialPlayerBodyItemState: ["你现在戴着一副眼罩"],
      suggestedPace: "slow",
      safetyFrame: "fiction",
      agents: [],
      sceneGoals: [],
      contentNotes: []
    },
    confirmedSetup: null,
    playerBodyItemState: ["你现在戴着一副眼罩"],
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

function createPlayablePlayerTtsConfig() {
  return {
    ...createDefaultAppConfig(),
    tts: {
      baseUrl: "http://tts.example.test",
      roleMappings: [
        {
          id: "player-voice",
          characterName: "玩家",
          referenceId: "player_ref"
        }
      ]
    }
  };
}

describe("SessionConsolePage", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T12:00:00.000Z"));
    vi.resetAllMocks();
    localStorageState.clear();
    localStorageMock.getItem.mockImplementation((key: string) => localStorageState.get(key) ?? null);
    localStorageMock.setItem.mockImplementation((key: string, value: string) => {
      localStorageState.set(key, value);
    });
    localStorageMock.removeItem.mockImplementation((key: string) => {
      localStorageState.delete(key);
    });
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      configurable: true
    });
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    apiMocks.getAppConfig.mockResolvedValue(createDefaultAppConfig());
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
    globalThis.fetch = originalFetch;
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
    expect(normalizedText(wrapper)).toContain("玩家身体道具");
    expect(normalizedText(wrapper)).toContain("你现在戴着一副眼罩");
  });

  it("hides the player TTS button until the current tick finishes", async () => {
    apiMocks.getAppConfig.mockResolvedValue(createPlayablePlayerTtsConfig());
    await useConfigStore().reloadConfig();
    apiMocks.getSession.mockResolvedValue(createSession({
      timerState: {
        enabled: true,
        intervalMs: 5000,
        inFlight: true,
        nextTickAt: "2026-03-17T12:00:05.000Z",
        queuedReasons: ["player_message"],
        queuedPlayerMessages: ["心海大人……我！当时明明不应该像你说的这样做，如果我不制止，会更糟糕！"],
        pendingWaits: []
      }
    }));
    apiMocks.getEvents.mockResolvedValue([
      {
        sessionId: "session_1",
        seq: 15,
        type: "player.message",
        source: "player",
        createdAt: "2026-03-17T12:00:06.000Z",
        payload: {
          text: "心海大人……我！当时明明不应该像你说的这样做，如果我不制止，会更糟糕！"
        }
      },
      {
        sessionId: "session_1",
        seq: 16,
        type: "system.tick_started",
        source: "system",
        createdAt: "2026-03-17T12:00:06.200Z",
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

    expect(wrapper.find('.timeline-item[data-kind="player"] .tts-trigger').exists()).toBe(false);

    FakeEventSource.instances[0]?.emit("event.appended", {
      event: {
        sessionId: "session_1",
        seq: 17,
        type: "system.tick_completed",
        source: "system",
        createdAt: "2026-03-17T12:00:07.000Z",
        payload: {
          reason: "player_message",
          status: "active"
        }
      }
    });
    await flushPromises();

    expect(wrapper.find('.timeline-item[data-kind="player"] .tts-trigger').exists()).toBe(true);
  });

  it("submits the composer when Enter is pressed", async () => {
    apiMocks.getSession.mockResolvedValue(createSession());
    apiMocks.postMessage.mockResolvedValue(undefined);

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

    const textarea = wrapper.get("textarea.composer");
    await textarea.setValue("  现在过来。  ");

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true
    });
    textarea.element.dispatchEvent(event);
    await flushPromises();

    expect(event.defaultPrevented).toBe(true);
    expect(apiMocks.postMessage).toHaveBeenCalledTimes(1);
    expect(apiMocks.postMessage.mock.calls[0]?.[0]).toBe("session_1");
    expect(apiMocks.postMessage.mock.calls[0]?.[1]).toBe("现在过来。");
    expect((textarea.element as HTMLTextAreaElement).value).toBe("");
  });

  it("keeps Shift+Enter available for multiline input", async () => {
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

    const textarea = wrapper.get("textarea.composer");
    await textarea.setValue("第一行");

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    textarea.element.dispatchEvent(event);
    await flushPromises();

    expect(event.defaultPrevented).toBe(false);
    expect(apiMocks.postMessage).not.toHaveBeenCalled();
    expect((textarea.element as HTMLTextAreaElement).value).toBe("第一行");
  });

  it("disables the composer while a streaming tick is in flight", async () => {
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

    FakeEventSource.instances[0]?.emit("llm.turn.started", {
      turnId: "tick_busy",
      model: "gpt-5.4"
    });

    await flushPromises();

    const textarea = wrapper.get("textarea.composer");
    const button = wrapper.get(".composer-actions .button.primary");

    expect((textarea.element as HTMLTextAreaElement).disabled).toBe(true);
    expect((button.element as HTMLButtonElement).disabled).toBe(true);
    expect(normalizedText(wrapper)).toContain("当前正在推演，请等待这一轮结束后再发送新消息。");
  });

  it("does not submit a message when Enter is pressed during streaming", async () => {
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

    FakeEventSource.instances[0]?.emit("llm.turn.started", {
      turnId: "tick_busy_2",
      model: "gpt-5.4"
    });

    await flushPromises();

    const textarea = wrapper.get("textarea.composer");
    await textarea.setValue("现在先别发出去");

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true
    });
    textarea.element.dispatchEvent(event);
    await flushPromises();

    expect(event.defaultPrevented).toBe(true);
    expect(apiMocks.postMessage).not.toHaveBeenCalled();
  });

  it("renders the floating e-stim viewer when the current session enables the tool", async () => {
    window.localStorage.setItem("dglabai.e_stim_config", JSON.stringify({
      gameConnectionCode: "488b55d9-acb2-4e3f-bd36-b05547b30c10@http://localhost:8920",
      bChannelEnabled: true,
      channelPlacements: {
        a: "",
        b: ""
      },
      availablePulses: [],
      allowedPulseIds: []
    }));
    apiMocks.getSession.mockResolvedValue(createSession({
      llmConfigSnapshot: {
        provider: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "test-key",
        model: "gpt-4.1-mini",
        temperature: 0.9,
        reasoningEffort: "medium",
        maxTokens: 1200,
        topP: 1,
        requestTimeoutMs: 120000,
        toolStates: {
          ...defaultToolStates(),
          control_e_stim_toy: true
        }
      }
    }));

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

    const iframe = wrapper.find('[data-testid="e-stim-floating-overlay"] iframe');
    expect(iframe.exists()).toBe(true);
    expect(iframe.attributes("src")).toBe(
      "http://localhost:8920/viewer.html?clientId=488b55d9-acb2-4e3f-bd36-b05547b30c10&layout=dual#/"
    );
  });

  it("restores the floating e-stim viewer position from local storage", async () => {
    window.localStorage.setItem("dglabai.e_stim_config", JSON.stringify({
      gameConnectionCode: "488b55d9-acb2-4e3f-bd36-b05547b30c10@http://localhost:8920",
      bChannelEnabled: true,
      channelPlacements: {
        a: "",
        b: ""
      },
      availablePulses: [],
      allowedPulseIds: []
    }));
    window.localStorage.setItem("dglabai.e_stim_overlay_position", JSON.stringify({
      x: 140,
      y: 210
    }));
    apiMocks.getSession.mockResolvedValue(createSession({
      llmConfigSnapshot: {
        provider: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "test-key",
        model: "gpt-4.1-mini",
        temperature: 0.9,
        reasoningEffort: "medium",
        maxTokens: 1200,
        topP: 1,
        requestTimeoutMs: 120000,
        toolStates: {
          ...defaultToolStates(),
          control_e_stim_toy: true
        }
      }
    }));

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

    const overlay = wrapper.get('[data-testid="e-stim-floating-overlay"]');
    expect(overlay.attributes("style")).toContain("left: 140px;");
    expect(overlay.attributes("style")).toContain("top: 210px;");
  });

  it("collapses the floating e-stim viewer when the drag bar is clicked without dragging", async () => {
    window.localStorage.setItem("dglabai.e_stim_config", JSON.stringify({
      gameConnectionCode: "488b55d9-acb2-4e3f-bd36-b05547b30c10@http://localhost:8920",
      bChannelEnabled: true,
      channelPlacements: {
        a: "",
        b: ""
      },
      availablePulses: [],
      allowedPulseIds: []
    }));
    apiMocks.getSession.mockResolvedValue(createSession({
      llmConfigSnapshot: {
        provider: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "test-key",
        model: "gpt-4.1-mini",
        temperature: 0.9,
        reasoningEffort: "medium",
        maxTokens: 1200,
        topP: 1,
        requestTimeoutMs: 120000,
        toolStates: {
          ...defaultToolStates(),
          control_e_stim_toy: true
        }
      }
    }));

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

    const dragbar = wrapper.get(".e-stim-floating-overlay__dragbar");
    await dragbar.trigger("pointerdown", {
      button: 0,
      pointerId: 7,
      clientX: 220,
      clientY: 160
    });
    await dragbar.trigger("pointerup", {
      button: 0,
      pointerId: 7,
      clientX: 220,
      clientY: 160
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="e-stim-floating-overlay"] iframe').exists()).toBe(false);
    expect(wrapper.get('[data-testid="e-stim-floating-overlay"]').classes()).toContain("e-stim-floating-overlay--collapsed");
    expect(normalizedText(wrapper)).toContain("点击展开 / 拖动");
    expect(window.localStorage.getItem("dglabai.e_stim_overlay_collapsed")).toBe("true");
  });

  it("restores the floating e-stim viewer collapsed state from local storage", async () => {
    window.localStorage.setItem("dglabai.e_stim_config", JSON.stringify({
      gameConnectionCode: "488b55d9-acb2-4e3f-bd36-b05547b30c10@http://localhost:8920",
      bChannelEnabled: true,
      channelPlacements: {
        a: "",
        b: ""
      },
      availablePulses: [],
      allowedPulseIds: []
    }));
    window.localStorage.setItem("dglabai.e_stim_overlay_collapsed", "true");
    apiMocks.getSession.mockResolvedValue(createSession({
      llmConfigSnapshot: {
        provider: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "test-key",
        model: "gpt-4.1-mini",
        temperature: 0.9,
        reasoningEffort: "medium",
        maxTokens: 1200,
        topP: 1,
        requestTimeoutMs: 120000,
        toolStates: {
          ...defaultToolStates(),
          control_e_stim_toy: true
        }
      }
    }));

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

    const overlay = wrapper.get('[data-testid="e-stim-floating-overlay"]');
    expect(overlay.classes()).toContain("e-stim-floating-overlay--collapsed");
    expect(overlay.find("iframe").exists()).toBe(false);
    expect(normalizedText(wrapper)).toContain("点击展开 / 拖动");
  });

  it("keeps the floating e-stim viewer expanded after a real drag", async () => {
    window.localStorage.setItem("dglabai.e_stim_config", JSON.stringify({
      gameConnectionCode: "488b55d9-acb2-4e3f-bd36-b05547b30c10@http://localhost:8920",
      bChannelEnabled: true,
      channelPlacements: {
        a: "",
        b: ""
      },
      availablePulses: [],
      allowedPulseIds: []
    }));
    apiMocks.getSession.mockResolvedValue(createSession({
      llmConfigSnapshot: {
        provider: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "test-key",
        model: "gpt-4.1-mini",
        temperature: 0.9,
        reasoningEffort: "medium",
        maxTokens: 1200,
        topP: 1,
        requestTimeoutMs: 120000,
        toolStates: {
          ...defaultToolStates(),
          control_e_stim_toy: true
        }
      }
    }));

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

    const overlay = wrapper.get('[data-testid="e-stim-floating-overlay"]');
    const dragbar = wrapper.get(".e-stim-floating-overlay__dragbar");
    await dragbar.trigger("pointerdown", {
      button: 0,
      pointerId: 9,
      clientX: 220,
      clientY: 160
    });
    await dragbar.trigger("pointermove", {
      pointerId: 9,
      clientX: 260,
      clientY: 200
    });
    await dragbar.trigger("pointerup", {
      button: 0,
      pointerId: 9,
      clientX: 260,
      clientY: 200
    });
    await flushPromises();

    expect(overlay.find("iframe").exists()).toBe(true);
    expect(overlay.classes()).not.toContain("e-stim-floating-overlay--collapsed");
    expect(overlay.attributes("style")).not.toContain("left: 24px;");
    expect(overlay.attributes("style")).not.toContain("top: 132px;");
  });

  it("keeps the floating e-stim viewer hidden when the current session has not enabled the tool", async () => {
    window.localStorage.setItem("dglabai.e_stim_config", JSON.stringify({
      gameConnectionCode: "488b55d9-acb2-4e3f-bd36-b05547b30c10@http://localhost:8920",
      bChannelEnabled: true,
      channelPlacements: {
        a: "",
        b: ""
      },
      availablePulses: [],
      allowedPulseIds: []
    }));
    apiMocks.getSession.mockResolvedValue(createSession({
      llmConfigSnapshot: {
        provider: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "test-key",
        model: "gpt-4.1-mini",
        temperature: 0.9,
        reasoningEffort: "medium",
        maxTokens: 1200,
        topP: 1,
        requestTimeoutMs: 120000,
        toolStates: {
          ...defaultToolStates(),
          control_e_stim_toy: false
        }
      }
    }));

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

    expect(wrapper.find('[data-testid="e-stim-floating-overlay"]').exists()).toBe(false);
  });

  it("strips inline display tags from the session summary header", async () => {
    apiMocks.getSession.mockResolvedValue(createSession({
      storyState: {
        location: "study",
        phase: "teasing",
        tension: 6,
        summary: "先别急。<delay>800</delay><emo_inst>excited</emo_inst>抬头看我。",
        activeObjectives: []
      }
    }));

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

    expect(normalizedText(wrapper)).toContain("先别急。抬头看我。");
    expect(normalizedText(wrapper)).not.toContain("<delay>");
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

    expect(normalizedText(wrapper)).toContain("正在思考中");
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

    expect(apiMocks.requestAutoTick).toHaveBeenCalledWith("session_1", undefined);
  });

  it("subscribes to the stream before initial data finishes loading so the first preview is not missed", async () => {
    let resolveSession!: (value: Session) => void;
    let resolveEvents!: (value: SessionEvent[]) => void;
    apiMocks.getSession.mockImplementation(() => new Promise((resolve) => {
      resolveSession = resolve;
    }));
    apiMocks.getEvents.mockImplementation(() => new Promise((resolve) => {
      resolveEvents = resolve;
    }));

    const wrapper = mount(SessionConsolePage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    expect(FakeEventSource.instances).toHaveLength(1);
    FakeEventSource.instances[0]?.emit("llm.turn.started", {
      turnId: "tick_1",
      model: "gpt-5.4"
    });
    FakeEventSource.instances[0]?.emit("llm.reasoning_summary.delta", {
      turnId: "tick_1",
      delta: "先判断她会不会继续嘴硬。"
    });
    FakeEventSource.instances[0]?.emit("llm.action.meta", {
      turnId: "tick_1",
      index: 0,
      actorAgentId: "director_1",
      tool: "speak_to_player",
      targetScope: "player"
    });
    FakeEventSource.instances[0]?.emit("llm.action.text.delta", {
      turnId: "tick_1",
      index: 0,
      path: "args.message",
      delta: "先看着我。"
    });

    resolveSession(createSession({
      confirmedSetup: {
        ...createSession().draft,
        agents: [
          {
            id: "director_1",
            name: "珊瑚宫心海",
            role: "director",
            summary: "主导者",
            persona: "冷静",
            goals: ["推进"],
            style: [],
            boundaries: [],
            sortOrder: 0
          }
        ]
      }
    }));
    resolveEvents([]);

    await flushPromises();

    expect(normalizedText(wrapper)).toContain("正在思考中");
    expect(normalizedText(wrapper)).toContain("先判断她会不会继续嘴硬。");
    expect(normalizedText(wrapper)).toContain("先看着我。");
    expect(normalizedText(wrapper)).toContain("对你说");
  });

  it("restores an in-flight preview snapshot after reconnect", async () => {
    apiMocks.getSession.mockResolvedValue(createSession({
      confirmedSetup: {
        ...createSession().draft,
        agents: [
          {
            id: "director_1",
            name: "珊瑚宫心海",
            role: "director",
            summary: "主导者",
            persona: "冷静",
            goals: ["推进"],
            style: [],
            boundaries: [],
            sortOrder: 0
          }
        ]
      }
    }));

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

    FakeEventSource.instances[0]?.emit("llm.preview.snapshot", {
      previewTurn: {
        turnId: "tick_1",
        status: "streaming",
        model: "gpt-5.4",
        reasoningSummaryText: "我先顺着她的情绪往前推一点。",
        actions: [
          {
            index: 0,
            actorAgentId: "director_1",
            tool: "speak_to_player",
            targetScope: "player",
            textByPath: {
              "args.message": {
                visibleSegments: [
                  {
                    type: "text",
                    text: "刷新后也能接着看。"
                  }
                ],
                pendingBuffer: ""
              }
            },
            valueByPath: {},
            completedFields: [],
            completed: false
          }
        ]
      }
    });

    await flushPromises();

    expect(normalizedText(wrapper)).toContain("正在思考中");
    expect(normalizedText(wrapper)).toContain("我先顺着她的情绪往前推一点。");
    expect(normalizedText(wrapper)).toContain("刷新后也能接着看。");
    expect(normalizedText(wrapper)).toContain("对你说");
  });

  it("hides the live reasoning summary once the streaming tick is committed", async () => {
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

    FakeEventSource.instances[0]?.emit("llm.turn.started", {
      turnId: "tick_3",
      model: "gpt-5.4"
    });
    FakeEventSource.instances[0]?.emit("llm.reasoning_summary.delta", {
      turnId: "tick_3",
      delta: "先确认这一轮该怎么收束。"
    });

    await flushPromises();
    expect(normalizedText(wrapper)).toContain("先确认这一轮该怎么收束。");

    FakeEventSource.instances[0]?.emit("event.appended", {
      event: {
        sessionId: "session_1",
        seq: 1,
        type: "system.tick_completed",
        source: "system",
        createdAt: "2026-03-17T12:00:02.000Z",
        payload: {
          reason: "player_message",
          status: "active"
        }
      }
    });

    await flushPromises();
    expect(normalizedText(wrapper)).not.toContain("先确认这一轮该怎么收束。");
  });

  it("persists the surprise mode toggle per session", async () => {
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

    const toggle = wrapper.get('[data-testid="surprise-mode-toggle"]');
    expect((toggle.element as HTMLInputElement).checked).toBe(false);

    await toggle.setValue(true);

    expect(localStorageState.get("dglabai.surprise_mode.session_1")).toBe("true");

    wrapper.unmount();

    const nextWrapper = mount(SessionConsolePage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();

    expect((nextWrapper.get('[data-testid="surprise-mode-toggle"]').element as HTMLInputElement).checked).toBe(true);
    expect(normalizedText(nextWrapper)).toContain("惊喜模式");
    expect(normalizedText(nextWrapper)).toContain("已开启");
  });

  it("applies the surprise mask to streaming reasoning content when enabled", async () => {
    apiMocks.getSession.mockResolvedValue(createSession({
      confirmedSetup: {
        ...createSession().draft,
        agents: [
          {
            id: "director_1",
            name: "珊瑚宫心海",
            role: "director",
            summary: "主导者",
            persona: "冷静",
            goals: ["推进"],
            style: [],
            boundaries: [],
            sortOrder: 0
          }
        ]
      }
    }));

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
    await wrapper.get('[data-testid="surprise-mode-toggle"]').setValue(true);

    FakeEventSource.instances[0]?.emit("llm.preview.snapshot", {
      previewTurn: {
        turnId: "tick_surprise",
        status: "streaming",
        model: "gpt-5.4",
        reasoningSummaryText: "我先把这一轮节奏压住。",
        actions: [
          {
            index: 0,
            actorAgentId: "director_1",
            tool: "speak_to_player",
            targetScope: "player",
            textByPath: {
              "args.message": {
                visibleSegments: [
                  {
                    type: "text",
                    text: "先别急着回答。"
                  }
                ],
                pendingBuffer: ""
              }
            },
            valueByPath: {},
            completedFields: [],
            completed: false
          }
        ]
      }
    });

    await flushPromises();

    expect(wrapper.get('[data-testid="reasoning-summary-content"]').classes()).toContain("surprise-mask");
    expect(wrapper.get('.timeline-item[data-preview="true"] .event-main span').classes()).toContain("surprise-mask");
    expect(normalizedText(wrapper)).toContain("珊瑚宫心海");
  });

  it("updates the page-level preview card when e-stim field-completed events arrive", async () => {
    apiMocks.getSession.mockResolvedValue(createSession({
      confirmedSetup: {
        ...createSession().draft,
        agents: [
          {
            id: "director_1",
            name: "珊瑚宫心海",
            role: "director",
            summary: "主导者",
            persona: "冷静",
            goals: ["推进"],
            style: [],
            boundaries: [],
            sortOrder: 0
          }
        ]
      }
    }));

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

    FakeEventSource.instances[0]?.emit("llm.turn.started", {
      turnId: "tick_1",
      model: "gpt-5.4"
    });
    FakeEventSource.instances[0]?.emit("llm.action.meta", {
      turnId: "tick_1",
      index: 0,
      actorAgentId: "director_1",
      tool: "control_e_stim_toy",
      targetScope: "scene"
    });

    await flushPromises();
    expect(normalizedText(wrapper)).toContain("正在编写控制参数");

    FakeEventSource.instances[0]?.emit("llm.action.field.completed", {
      turnId: "tick_1",
      index: 0,
      path: "args.command",
      value: "fire"
    });
    FakeEventSource.instances[0]?.emit("llm.action.field.completed", {
      turnId: "tick_1",
      index: 0,
      path: "args.durationMs",
      value: 2500
    });
    FakeEventSource.instances[0]?.emit("llm.action.field.completed", {
      turnId: "tick_1",
      index: 0,
      path: "args.override",
      value: true
    });
    FakeEventSource.instances[0]?.emit("llm.action.field.completed", {
      turnId: "tick_1",
      index: 0,
      path: "args.channels",
      value: {
        a: {
          enabled: true,
          intensityPercent: 35,
          pulseName: "快速按捏"
        },
        b: {
          enabled: false
        }
      }
    });

    await flushPromises();

    const text = normalizedText(wrapper);
    expect(text).toContain("珊瑚宫心海 调用了 情趣电击器");
    expect(text).toContain("一键开火");
    expect(text).toContain("2500 ms");
    expect(text).toContain("覆盖模式");
    expect(text).toContain("A 通道");
    expect(text).toContain("B 通道");
    expect(text).not.toContain("正在编写控制参数");
  });

  it("updates the page-level preview card when e-stim params arrive as a single args object", async () => {
    apiMocks.getSession.mockResolvedValue(createSession({
      confirmedSetup: {
        ...createSession().draft,
        agents: [
          {
            id: "director_1",
            name: "珊瑚宫心海",
            role: "director",
            summary: "主导者",
            persona: "冷静",
            goals: ["推进"],
            style: [],
            boundaries: [],
            sortOrder: 0
          }
        ]
      }
    }));

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

    FakeEventSource.instances[0]?.emit("llm.turn.started", {
      turnId: "tick_2",
      model: "gpt-5.4"
    });
    FakeEventSource.instances[0]?.emit("llm.action.meta", {
      turnId: "tick_2",
      index: 0,
      actorAgentId: "director_1",
      tool: "control_e_stim_toy",
      targetScope: "scene"
    });
    FakeEventSource.instances[0]?.emit("llm.action.field.completed", {
      turnId: "tick_2",
      index: 0,
      path: "args",
      value: {
        command: "fire",
        durationMs: 3500,
        override: true,
        channels: {
          a: {
            enabled: true,
            intensityPercent: 45,
            pulseName: "压缩"
          },
          b: {
            enabled: true,
            intensityPercent: 40,
            pulseName: "颗粒摩擦"
          }
        }
      }
    });

    await flushPromises();

    const text = normalizedText(wrapper);
    expect(text).toContain("珊瑚宫心海 调用了 情趣电击器");
    expect(text).toContain("一键开火");
    expect(text).toContain("3500 ms");
    expect(text).toContain("A 通道");
    expect(text).toContain("波形 压缩");
    expect(text).toContain("B 通道");
    expect(text).toContain("波形 颗粒摩擦");
    expect(text).not.toContain("正在编写控制参数");
  });

  it("persists local e-stim execution details and restores them after remount", async () => {
    const createdAt = "2026-03-17T12:00:03.000Z";
    const deviceEvent: SessionEvent = {
      sessionId: "session_1",
      seq: 7,
      type: "agent.device_control",
      source: "agent",
      agentId: "director_1",
      createdAt,
      payload: {
        speaker: "珊瑚宫心海",
        action: "control_e_stim_toy",
        deviceId: "e_stim_toy",
        deviceName: "情趣电击器",
        command: "fire",
        durationMs: 1800,
        channels: {
          a: {
            enabled: true,
            intensityPercent: 45
          }
        },
        status: "frontend_pending"
      }
    };

    window.localStorage.setItem("dglabai.e_stim_config", JSON.stringify({
      gameConnectionCode: "client-1@http://localhost:8920",
      bChannelEnabled: false,
      channelPlacements: {
        a: "",
        b: ""
      },
      intensityCurve: {
        preset: "linear",
        points: [
          { inputPercent: 0, outputPercent: 0 },
          { inputPercent: 25, outputPercent: 25 },
          { inputPercent: 50, outputPercent: 50 },
          { inputPercent: 75, outputPercent: 75 },
          { inputPercent: 100, outputPercent: 100 }
        ]
      },
      availablePulses: [],
      allowedPulseIds: []
    }));
    apiMocks.getSession.mockResolvedValue(createSession());
    apiMocks.getEvents.mockResolvedValue([]);
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: () => "application/json"
        },
        text: async () => JSON.stringify({
          status: 1,
          clientStrength: {
            a: {
              strength: 0,
              limit: 100
            }
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: () => "application/json"
        },
        text: async () => JSON.stringify({
          status: 1,
          code: "OK"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: () => "application/json"
        },
        text: async () => JSON.stringify({
          status: 1,
          clientStrength: {
            a: {
              strength: 45,
              limit: 100
            }
          }
        })
      }) as typeof fetch;

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
    FakeEventSource.instances[0]?.emit("event.appended", {
      event: deviceEvent
    });
    await flushPromises();

    const persistedRaw = localStorageState.get("dglabai.e_stim_execution_states.session_1");
    expect(persistedRaw).toBeTruthy();
    expect(persistedRaw).toContain("\"httpStatus\":200");
    expect(persistedRaw).toContain("/api/v2/game/client-1/action/fire");

    wrapper.unmount();

    apiMocks.getEvents.mockResolvedValue([deviceEvent]);
    const nextWrapper = mount(SessionConsolePage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();

    expect(normalizedText(nextWrapper)).toContain("珊瑚宫心海 调用了 情趣电击器");
    expect(normalizedText(nextWrapper)).toContain("已调用本地 API");
    expect(normalizedText(nextWrapper)).toContain("查看本地执行详情");
    expect(normalizedText(nextWrapper)).toContain("HTTP 200");
  });
});
