import { z } from "zod";
import {
  createEmptyMemoryDebugState,
  createEmptyMemoryState,
  memoryStateSchema,
  type LlmConfig,
  type MemoryRunKind,
  type MemoryRunRecord,
  type NarrativeSummary,
  type NarrativeSummaryLevel,
  type NarrativeSummarySource,
  type Session,
  type SessionEvent
} from "@dglab-ai/shared";
import { createId } from "../lib/ids.js";
import type { LLMProvider } from "../types/contracts.js";
import { parseTurns, textOf, truncateText, uniqStrings, type ParsedTurn } from "./memoryUtils.js";

const summaryShapeSchema = z.object({
  scene: z.object({
    phase: z.string().default("opening"),
    location: z.string().default("未设定"),
    tension: z.number().min(0).max(10).default(3),
    summary: z.string().default("")
  }),
  playerTrajectory: z.string().default(""),
  keyDevelopments: z.array(z.string()).max(6).default([]),
  characterStates: z.array(z.string()).max(6).default([]),
  unresolvedThreads: z.array(z.string()).max(6).default([]),
  carryForward: z.string().default("")
});

type SummaryShape = z.infer<typeof summaryShapeSchema>;

function summarizerConfig(config: LlmConfig): LlmConfig {
  return {
    ...config,
    temperature: 0.2,
    maxTokens: Math.min(config.maxTokens, 350)
  };
}

function pushRun(session: Session, run: MemoryRunRecord): void {
  const currentDebug = session.memoryState.debug ?? createEmptyMemoryDebugState();
  session.memoryState.debug = {
    ...currentDebug,
    recentRuns: [...currentDebug.recentRuns, run].slice(-12)
  };
}

function mergeSummaryShapes(parts: SummaryShape[]): SummaryShape {
  const latest = parts[parts.length - 1] ?? {
    scene: {
      phase: "opening",
      location: "未设定",
      tension: 3,
      summary: ""
    },
    playerTrajectory: "",
    keyDevelopments: [],
    characterStates: [],
    unresolvedThreads: [],
    carryForward: ""
  };

  return {
    scene: latest.scene,
    playerTrajectory: parts.map((part) => part.playerTrajectory).filter(Boolean).slice(-2).join("；"),
    keyDevelopments: uniqStrings(parts.flatMap((part) => part.keyDevelopments), 6),
    characterStates: uniqStrings(parts.flatMap((part) => part.characterStates), 6),
    unresolvedThreads: uniqStrings(parts.flatMap((part) => part.unresolvedThreads), 6),
    carryForward: latest.carryForward || latest.scene.summary || latest.unresolvedThreads[0] || ""
  };
}

function summaryToShape(summary: NarrativeSummary): SummaryShape {
  return {
    scene: summary.scene,
    playerTrajectory: summary.playerTrajectory,
    keyDevelopments: summary.keyDevelopments,
    characterStates: summary.characterStates,
    unresolvedThreads: summary.unresolvedThreads,
    carryForward: summary.carryForward
  };
}

function buildSummary(
  level: NarrativeSummaryLevel,
  range: { fromSeq: number; toSeq: number; turnStart: number; turnEnd: number },
  createdAt: string,
  shape: SummaryShape,
  source: NarrativeSummarySource
): NarrativeSummary {
  return {
    id: createId(`memory_${level}`),
    level,
    fromSeq: range.fromSeq,
    toSeq: range.toSeq,
    turnStart: range.turnStart,
    turnEnd: range.turnEnd,
    createdAt,
    scene: shape.scene,
    playerTrajectory: shape.playerTrajectory,
    keyDevelopments: uniqStrings(shape.keyDevelopments, 6),
    characterStates: uniqStrings(shape.characterStates, 6),
    unresolvedThreads: uniqStrings(shape.unresolvedThreads, 6),
    carryForward: shape.carryForward,
    source
  };
}

function buildInputRange(fromSeq: number, toSeq: number, turnStart: number, turnEnd: number): string {
  return `seq ${fromSeq}-${toSeq} | turns ${turnStart}-${turnEnd}`;
}

function createRun(
  kind: MemoryRunKind,
  outputLevel: NarrativeSummaryLevel,
  inputRange: string,
  startedAt: string,
  finishedAt: string,
  status: "success" | "failed" | "fallback",
  sourceModel: string | null,
  errorMessage: string | null
): MemoryRunRecord {
  return {
    id: createId("memory_run"),
    kind,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
    status,
    inputRange,
    outputLevel,
    sourceModel,
    errorMessage
  };
}

function extractSceneFromTurn(turn: ParsedTurn): SummaryShape["scene"] | null {
  const latestScene = [...turn.events].reverse().find((event) => event.type === "scene.updated");
  if (!latestScene) {
    return null;
  }
  return {
    phase: textOf(latestScene.payload.phase, "opening"),
    location: textOf(latestScene.payload.location, "未设定"),
    tension: Number(latestScene.payload.tension ?? 3),
    summary: textOf(latestScene.payload.summary)
  };
}

function ruleBasedTurnShape(session: Session, turn: ParsedTurn): SummaryShape {
  const scene = extractSceneFromTurn(turn) ?? {
    phase: session.storyState.phase,
    location: session.storyState.location,
    tension: session.storyState.tension,
    summary: ""
  };

  const playerMessages = turn.events
    .filter((event) => event.type === "player.message")
    .map((event) => truncateText(textOf(event.payload.text), 100));

  const keyDevelopments = uniqStrings([
    ...turn.events
      .filter((event) => event.type === "agent.story_effect")
      .map((event) => {
        const label = textOf(event.payload.label, "剧情变化");
        const description = truncateText(textOf(event.payload.description), 80);
        return description ? `${label}：${description}` : label;
      }),
    ...turn.events
      .filter((event) => event.type === "agent.stage_direction")
      .map((event) => `${textOf(event.payload.speaker, "角色")}：${truncateText(textOf(event.payload.direction), 90)}`),
    ...turn.events
      .filter((event) => event.type === "system.story_ended")
      .map((event) => `故事收束：${truncateText(textOf(event.payload.summary), 90)}`)
  ], 6);

  const characterStates = uniqStrings([
    ...turn.events
      .filter((event) => event.type === "agent.reasoning")
      .map((event) => `${textOf(event.payload.speaker, "角色")}：${truncateText(textOf(event.payload.summary), 90)}`),
    ...turn.events
      .filter((event) => event.type === "agent.speak_agent")
      .map((event) => `${textOf(event.payload.speaker, "角色")} 与 ${textOf(event.payload.targetAgentId, "其他角色")} 协调了下一拍节奏`)
  ], 6);

  const unresolvedThreads = uniqStrings(
    turn.events
      .filter((event) => event.type === "scene.updated")
      .flatMap((event) => Array.isArray(event.payload.activeObjectives)
        ? event.payload.activeObjectives.map((item) => textOf(item)).filter(Boolean)
        : []),
    6
  );

  return {
    scene: {
      ...scene,
      summary: scene.summary || truncateText(keyDevelopments[0] ?? characterStates[0] ?? "本轮剧情继续推进。", 120)
    },
    playerTrajectory: playerMessages.length > 0 ? `玩家表达：${playerMessages.join("；")}` : "",
    keyDevelopments,
    characterStates,
    unresolvedThreads,
    carryForward: unresolvedThreads[0] ?? scene.summary ?? ""
  };
}

function turnShapeIsInsufficient(shape: SummaryShape): boolean {
  return !shape.scene.summary
    || (shape.keyDevelopments.length === 0 && shape.characterStates.length === 0 && !shape.playerTrajectory);
}

function llmSummaryPrompt(kind: "turn" | "compaction", input: string): Array<{ role: "system" | "user"; content: string }> {
  const systemContent = kind === "turn"
    ? [
      "You summarize one completed story turn for long-context memory.",
      "Focus on durable continuity facts, emotional shifts, objectives, and what matters for future turns.",
      "Do not preserve verbatim dialogue unless needed for continuity.",
      "Return only JSON."
    ].join("\n")
    : [
      "You compact older story memory summaries into a smaller long-context memory block.",
      "Keep only durable continuity facts, emotional state, unresolved threads, and the best carry-forward guidance.",
      "Prefer compression over detail. Do not preserve verbatim dialogue.",
      "Return only JSON."
    ].join("\n");

  return [
    {
      role: "system",
      content: systemContent
    },
    {
      role: "user",
      content: input
    }
  ];
}

export class MemoryService {
  constructor(private readonly provider: LLMProvider) {}

  async refreshSessionMemory(
    session: Session,
    events: SessionEvent[],
    config: LlmConfig
  ): Promise<boolean> {
    session.memoryState = memoryStateSchema.parse(session.memoryState ?? createEmptyMemoryState());
    const turns = parseTurns(events).filter((turn) => turn.success && turn.toSeq > session.memoryState.lastProcessedSeq);
    if (turns.length === 0) {
      return false;
    }

    session.memoryState.debug.lastCompactionMode = null;
    for (const turn of turns) {
      const summary = await this.createTurnSummary(session, turn, config);
      session.memoryState.turnSummaries.push(summary);
      session.memoryState.lastProcessedSeq = Math.max(session.memoryState.lastProcessedSeq, turn.toSeq);
    }

    while (session.memoryState.turnSummaries.length > session.memoryState.policy.maxTurnSummariesBeforeMerge) {
      await this.compactTurnsToEpisode(session, config);
    }

    while (session.memoryState.episodeSummaries.length > session.memoryState.policy.maxEpisodeSummaries) {
      await this.compactEpisodesToArchive(session, config);
    }

    session.memoryState.debug.lastRefreshAt = new Date().toISOString();
    session.memoryState.debug.lastRefreshStatus = "success";
    session.memoryState.debug.lastRefreshError = null;
    if (session.memoryState.debug.lastCompactionMode) {
      session.memoryState.debug.lastCompactionAt = session.memoryState.debug.lastRefreshAt;
    }
    return true;
  }

  markRefreshFailure(session: Session, error: unknown): void {
    session.memoryState = memoryStateSchema.parse(session.memoryState ?? createEmptyMemoryState());
    session.memoryState.debug.lastRefreshAt = new Date().toISOString();
    session.memoryState.debug.lastRefreshStatus = "failed";
    session.memoryState.debug.lastRefreshError = error instanceof Error ? error.message : String(error);
  }

  private async createTurnSummary(
    session: Session,
    turn: ParsedTurn,
    config: LlmConfig
  ): Promise<NarrativeSummary> {
    const startedAt = new Date().toISOString();
    const inputRange = buildInputRange(turn.fromSeq, turn.toSeq, turn.turnStart, turn.turnEnd);
    const derived = ruleBasedTurnShape(session, turn);
    if (!turnShapeIsInsufficient(derived)) {
      const finishedAt = new Date().toISOString();
      pushRun(session, createRun("turn_refresh", "turn", inputRange, startedAt, finishedAt, "success", null, null));
      return buildSummary("turn", turn, finishedAt, derived, "derived");
    }

    const fallbackInput = [
      "Turn events:",
      ...turn.events.map((event) => `${event.type}: ${JSON.stringify(event.payload)}`)
    ].join("\n");

    try {
      const response = await this.provider.completeJson({
        modelConfig: summarizerConfig(config),
        messages: llmSummaryPrompt("turn", fallbackInput),
        schema: summaryShapeSchema,
        schemaName: "turn_memory_summary",
        usageContext: {
          kind: "memory-turn-summary",
          sessionId: session.id,
          fromSeq: turn.fromSeq,
          toSeq: turn.toSeq
        }
      });
      const finishedAt = new Date().toISOString();
      pushRun(session, createRun("turn_refresh", "turn", inputRange, startedAt, finishedAt, "fallback", response.usage.model, null));
      return buildSummary("turn", turn, finishedAt, summaryShapeSchema.parse(response.data), "llm_compacted");
    } catch (error) {
      const finishedAt = new Date().toISOString();
      pushRun(session, createRun(
        "turn_refresh",
        "turn",
        inputRange,
        startedAt,
        finishedAt,
        "fallback",
        null,
        error instanceof Error ? error.message : String(error)
      ));
      return buildSummary("turn", turn, finishedAt, derived, "derived");
    }
  }

  private async compactTurnsToEpisode(session: Session, config: LlmConfig): Promise<void> {
    const chunk = session.memoryState.turnSummaries.slice(0, session.memoryState.policy.turnsPerEpisode);
    if (chunk.length === 0) {
      return;
    }
    const summary = await this.compactSummaryChunk(session, chunk, "episode", "turn_to_episode", config);
    session.memoryState.turnSummaries = session.memoryState.turnSummaries.slice(chunk.length);
    session.memoryState.episodeSummaries.push(summary);
    session.memoryState.debug.lastCompactionMode = "turn_to_episode";
  }

  private async compactEpisodesToArchive(session: Session, config: LlmConfig): Promise<void> {
    const chunk = session.memoryState.episodeSummaries.slice(0, 3);
    if (chunk.length === 0) {
      return;
    }
    const baseItems = session.memoryState.archiveSummary ? [session.memoryState.archiveSummary, ...chunk] : chunk;
    session.memoryState.archiveSummary = await this.compactSummaryChunk(session, baseItems, "archive", "episode_to_archive", config);
    session.memoryState.episodeSummaries = session.memoryState.episodeSummaries.slice(chunk.length);
    session.memoryState.debug.lastCompactionMode = "episode_to_archive";
  }

  private async compactSummaryChunk(
    session: Session,
    summaries: NarrativeSummary[],
    outputLevel: NarrativeSummaryLevel,
    runKind: MemoryRunKind,
    config: LlmConfig
  ): Promise<NarrativeSummary> {
    const startedAt = new Date().toISOString();
    const range = {
      fromSeq: summaries[0]!.fromSeq,
      toSeq: summaries[summaries.length - 1]!.toSeq,
      turnStart: summaries[0]!.turnStart,
      turnEnd: summaries[summaries.length - 1]!.turnEnd
    };
    const inputRange = buildInputRange(range.fromSeq, range.toSeq, range.turnStart, range.turnEnd);
    const fallbackShape = mergeSummaryShapes(summaries.map(summaryToShape));

    try {
      const response = await this.provider.completeJson({
        modelConfig: summarizerConfig(config),
        messages: llmSummaryPrompt(
          "compaction",
          summaries.map((summary) => JSON.stringify(summary, null, 2)).join("\n\n")
        ),
        schema: summaryShapeSchema,
        schemaName: `${outputLevel}_memory_summary`,
        usageContext: {
          kind: `memory-${runKind}`,
          sessionId: session.id,
          fromSeq: range.fromSeq,
          toSeq: range.toSeq
        }
      });
      const finishedAt = new Date().toISOString();
      pushRun(session, createRun(runKind, outputLevel, inputRange, startedAt, finishedAt, "success", response.usage.model, null));
      return buildSummary(outputLevel, range, finishedAt, summaryShapeSchema.parse(response.data), "llm_compacted");
    } catch (error) {
      const finishedAt = new Date().toISOString();
      pushRun(session, createRun(
        runKind,
        outputLevel,
        inputRange,
        startedAt,
        finishedAt,
        "fallback",
        null,
        error instanceof Error ? error.message : String(error)
      ));
      return buildSummary(outputLevel, range, finishedAt, fallbackShape, "derived");
    }
  }
}
