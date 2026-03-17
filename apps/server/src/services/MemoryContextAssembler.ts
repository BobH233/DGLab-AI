import {
  narrativeContextBundleSchema,
  type NarrativeContextBundle,
  type NarrativeSummary,
  type RecentRawTurn,
  type Session,
  type SessionEvent
} from "@dglab-ai/shared";
import { formatEventLine, parseTurns, toRecentRawTurn } from "./memoryUtils.js";

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function summaryToBlock(summary: NarrativeSummary, label: string): string {
  return [
    `${label}`,
    `range: seq ${summary.fromSeq}-${summary.toSeq} | turns ${summary.turnStart}-${summary.turnEnd}`,
    `scene: [${summary.scene.phase}] ${summary.scene.location} | tension ${summary.scene.tension}`,
    `scene_summary: ${summary.scene.summary || "无"}`,
    `player_trajectory: ${summary.playerTrajectory || "无"}`,
    `key_developments: ${summary.keyDevelopments.join("；") || "无"}`,
    `character_states: ${summary.characterStates.join("；") || "无"}`,
    `unresolved_threads: ${summary.unresolvedThreads.join("；") || "无"}`,
    `carry_forward: ${summary.carryForward || "无"}`,
    `source: ${summary.source}`
  ].join("\n");
}

function rawTurnToBlock(turn: RecentRawTurn): string {
  return [
    `turn seq ${turn.fromSeq}-${turn.toSeq}`,
    ...turn.events.map((event) => formatEventLine(event))
  ].join("\n");
}

function playerMessagesToBlock(events: SessionEvent[]): string {
  const messages = events
    .filter((event) => event.type === "player.message")
    .map((event) => `[${event.seq}] ${typeof event.payload.text === "string" ? event.payload.text : String(event.payload.text ?? "")}`);
  return messages.length > 0 ? messages.join("\n\n") : "No player messages yet.";
}

function selectNewestBlocks<T>(
  items: T[],
  budget: number,
  toBlock: (item: T) => string,
  droppedLabel: (item: T) => string
): { selected: T[]; blocks: string[]; dropped: string[] } {
  const selected: T[] = [];
  const blocks: string[] = [];
  const dropped: string[] = [];
  let used = 0;

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]!;
    const block = toBlock(item);
    const nextUsed = used + block.length;
    if (selected.length > 0 && nextUsed > budget) {
      dropped.push(droppedLabel(item));
      continue;
    }
    selected.unshift(item);
    blocks.unshift(block);
    used = nextUsed;
  }

  return {
    selected,
    blocks,
    dropped
  };
}

export class MemoryContextAssembler {
  assemble(
    session: Session,
    events: SessionEvent[],
    reason: string
  ): NarrativeContextBundle {
    const successfulTurns = parseTurns(events).filter((turn) => turn.success);
    const recentRawTurns = successfulTurns
      .slice(-session.memoryState.policy.rawTurnsToKeep)
      .map(toRecentRawTurn);

    const archiveBlock = session.memoryState.archiveSummary
      ? summaryToBlock(session.memoryState.archiveSummary, "Archive Summary")
      : "No archive summary yet.";

    const selectedEpisodes = selectNewestBlocks(
      session.memoryState.episodeSummaries,
      session.memoryState.policy.episodeCharBudget,
      (summary) => summaryToBlock(summary, `Episode Summary ${summary.turnStart}-${summary.turnEnd}`),
      (summary) => `episode:${summary.id}`
    );

    const selectedTurnSummaries = selectNewestBlocks(
      session.memoryState.turnSummaries,
      session.memoryState.policy.turnCharBudget,
      (summary) => summaryToBlock(summary, `Turn Summary ${summary.turnStart}-${summary.turnEnd}`),
      (summary) => `turn:${summary.id}`
    );

    const selectedRawTurns = selectNewestBlocks(
      recentRawTurns,
      session.memoryState.policy.rawEventCharBudget,
      rawTurnToBlock,
      (turn) => `raw:${turn.id}`
    );
    const playerMessagesBlock = playerMessagesToBlock(events);

    const tickContextBlock = stringify({
      reason,
      queuedPlayerMessages: session.timerState.queuedPlayerMessages,
      queuedReasons: session.timerState.queuedReasons
    });

    const coreState = {
      sessionDraft: stringify(session.confirmedSetup ?? session.draft),
      storyState: stringify(session.storyState),
      agentStates: stringify(session.agentStates)
    };

    return narrativeContextBundleSchema.parse({
      coreState,
      archiveBlock,
      episodeBlocks: selectedEpisodes.blocks,
      turnSummaryBlocks: selectedTurnSummaries.blocks,
      recentRawTurns: selectedRawTurns.selected,
      recentRawTurnsBlock: selectedRawTurns.blocks.length > 0
        ? selectedRawTurns.blocks.join("\n\n")
        : "No recent raw turns retained.",
      playerMessagesBlock,
      tickContextBlock,
      stats: {
        charCounts: {
          archive: archiveBlock.length,
          episodes: selectedEpisodes.blocks.join("").length,
          turns: selectedTurnSummaries.blocks.join("").length,
          rawTurns: selectedRawTurns.blocks.join("").length,
          playerMessages: playerMessagesBlock.length,
          tickContext: tickContextBlock.length,
          coreState: coreState.sessionDraft.length + coreState.storyState.length + coreState.agentStates.length
        },
        droppedBlocks: [
          ...selectedEpisodes.dropped,
          ...selectedTurnSummaries.dropped,
          ...selectedRawTurns.dropped
        ],
        rawTurnsIncluded: selectedRawTurns.selected.length,
        episodeCountIncluded: selectedEpisodes.selected.length,
        turnSummaryCountIncluded: selectedTurnSummaries.selected.length,
        usedFallback: session.memoryState.debug.recentRuns.some((run) => run.status === "fallback")
      }
    });
  }
}
