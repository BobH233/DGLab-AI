import { describe, expect, it } from "vitest";
import {
  createEmptyMemoryState,
  createEmptyUsageStats,
  defaultToolStates,
  type LlmConfig,
  type Session,
  type SessionEvent
} from "@dglab-ai/shared";
import { MemoryContextAssembler } from "../services/MemoryContextAssembler.js";
import { MemoryService } from "../services/MemoryService.js";

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
    id: "session_memory",
    status: "active",
    title: "Memory Test",
    initialPrompt: "brief",
    draft: {
      title: "Memory Test",
      playerBrief: "brief",
      worldSummary: "world",
      openingSituation: "opening",
      playerState: "player state",
      suggestedPace: "pace",
      safetyFrame: "fiction only",
      agents: [
        {
          id: "director",
          name: "Director",
          role: "director",
          summary: "summary",
          persona: "persona",
          goals: ["goal"],
          style: ["calm"],
          boundaries: [],
          sortOrder: 0
        }
      ],
      sceneGoals: ["hold tension"],
      contentNotes: []
    },
    confirmedSetup: null,
    storyState: {
      location: "study",
      phase: "opening",
      tension: 4,
      summary: "scene summary",
      activeObjectives: ["hold tension"]
    },
    agentStates: {
      director: {
        mood: "focused",
        intent: "observe"
      }
    },
    memoryState: createEmptyMemoryState(),
    timerState: {
      enabled: false,
      intervalMs: 10000,
      queuedReasons: ["player_message"],
      queuedPlayerMessages: ["继续"],
      pendingWaits: []
    },
    usageTotals: createEmptyUsageStats(),
    llmConfigSnapshot: config,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSeq: 0
  };
}

function createSuccessfulTurn(seqBase: number, playerText: string, sceneSummary: string): SessionEvent[] {
  const now = new Date().toISOString();
  return [
    {
      sessionId: "session_memory",
      seq: seqBase,
      type: "player.message",
      source: "player",
      createdAt: now,
      payload: {
        text: playerText
      }
    },
    {
      sessionId: "session_memory",
      seq: seqBase + 1,
      type: "system.tick_started",
      source: "system",
      createdAt: now,
      payload: {
        reason: "player_message"
      }
    },
    {
      sessionId: "session_memory",
      seq: seqBase + 2,
      type: "agent.stage_direction",
      source: "agent",
      agentId: "director",
      createdAt: now,
      payload: {
        speaker: "Director",
        direction: "你看见他向前逼近了一步。"
      }
    },
    {
      sessionId: "session_memory",
      seq: seqBase + 3,
      type: "scene.updated",
      source: "agent",
      agentId: "director",
      createdAt: now,
      payload: {
        location: "study",
        phase: "teasing",
        tension: 6,
        summary: sceneSummary,
        activeObjectives: ["让你继续回应"]
      }
    },
    {
      sessionId: "session_memory",
      seq: seqBase + 4,
      type: "system.tick_completed",
      source: "system",
      createdAt: now,
      payload: {
        status: "active"
      }
    }
  ];
}

class FakeSummaryProvider {
  constructor(private readonly summaryText = "合并后的摘要") {}

  async completeJson<T>() {
    return {
      data: {
        scene: {
          phase: "teasing",
          location: "study",
          tension: 7,
          summary: this.summaryText
        },
        playerTrajectory: "玩家继续配合。",
        keyDevelopments: ["旧记忆已被压缩"],
        characterStates: ["导演维持推进节奏"],
        unresolvedThreads: ["让你继续回应"],
        carryForward: "继续保持试探节奏。"
      } as T,
      rawText: "{}",
      usage: {
        model: "summary-model",
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        calls: 1,
        lastModel: "summary-model",
        lastUpdatedAt: new Date().toISOString()
      }
    };
  }
}

describe("MemoryService", () => {
  it("creates a turn summary from a successful turn", async () => {
    const service = new MemoryService(new FakeSummaryProvider() as never);
    const session = createSession();
    const events = createSuccessfulTurn(1, "别停。", "你已经被慢慢牵进他的节奏里。");

    const changed = await service.refreshSessionMemory(session, events, config);

    expect(changed).toBe(true);
    expect(session.memoryState.turnSummaries).toHaveLength(1);
    expect(session.memoryState.turnSummaries[0]?.scene.summary).toContain("牵进他的节奏");
    expect(session.memoryState.lastProcessedSeq).toBe(5);
    expect(session.memoryState.debug.lastRefreshStatus).toBe("success");
  });

  it("compacts old turn summaries into an episode summary once the threshold is exceeded", async () => {
    const service = new MemoryService(new FakeSummaryProvider("episode summary") as never);
    const session = createSession();
    session.memoryState.policy.maxTurnSummariesBeforeMerge = 1;
    session.memoryState.policy.turnsPerEpisode = 2;
    session.memoryState.turnSummaries = [
      {
        id: "turn_1",
        level: "turn",
        fromSeq: 1,
        toSeq: 5,
        turnStart: 2,
        turnEnd: 5,
        createdAt: new Date().toISOString(),
        scene: {
          phase: "opening",
          location: "study",
          tension: 4,
          summary: "第一轮摘要"
        },
        playerTrajectory: "玩家试探回应。",
        keyDevelopments: ["第一轮发展"],
        characterStates: ["导演继续观察"],
        unresolvedThreads: ["继续试探"],
        carryForward: "保持拉扯。",
        source: "derived"
      },
      {
        id: "turn_2",
        level: "turn",
        fromSeq: 6,
        toSeq: 10,
        turnStart: 7,
        turnEnd: 10,
        createdAt: new Date().toISOString(),
        scene: {
          phase: "teasing",
          location: "study",
          tension: 5,
          summary: "第二轮摘要"
        },
        playerTrajectory: "玩家没有退开。",
        keyDevelopments: ["第二轮发展"],
        characterStates: ["导演继续逼近"],
        unresolvedThreads: ["等待玩家更明确表态"],
        carryForward: "继续推进。",
        source: "derived"
      }
    ];

    const changed = await service.refreshSessionMemory(
      session,
      createSuccessfulTurn(11, "继续。", "第三轮让气氛继续升温。"),
      config
    );

    expect(changed).toBe(true);
    expect(session.memoryState.episodeSummaries).toHaveLength(1);
    expect(session.memoryState.episodeSummaries[0]?.scene.summary).toContain("episode summary");
    expect(session.memoryState.turnSummaries).toHaveLength(1);
    expect(session.memoryState.debug.lastCompactionMode).toBe("turn_to_episode");
  });
});

describe("MemoryContextAssembler", () => {
  it("keeps the most recent successful raw turns in the assembled context", () => {
    const assembler = new MemoryContextAssembler();
    const session = createSession();
    session.memoryState.archiveSummary = {
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
      playerTrajectory: "玩家已被卷入局势。",
      keyDevelopments: ["开局事实已沉淀"],
      characterStates: ["导演仍占主导"],
      unresolvedThreads: ["等待你继续回应"],
      carryForward: "维持牵引感。",
      source: "derived"
    };

    const events = [
      ...createSuccessfulTurn(1, "第一轮", "第一轮推进。"),
      ...createSuccessfulTurn(6, "第二轮", "第二轮推进。"),
      ...createSuccessfulTurn(11, "第三轮", "第三轮推进。")
    ];

    const bundle = assembler.assemble(session, events, "player_message");

    expect(bundle.archiveBlock).toContain("archive summary");
    expect(bundle.recentRawTurns).toHaveLength(2);
    expect(bundle.recentRawTurns[0]?.fromSeq).toBe(6);
    expect(bundle.recentRawTurns[1]?.fromSeq).toBe(11);
    expect(bundle.recentRawTurnsBlock).toContain("第二轮");
    expect(bundle.recentRawTurnsBlock).toContain("第三轮");
    expect(bundle.playerMessagesBlock).toContain("第一轮");
    expect(bundle.playerMessagesBlock).toContain("第三轮");
  });
});
