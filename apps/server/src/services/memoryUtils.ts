import type { RecentRawTurn, SessionEvent } from "@dglab-ai/shared";

export type ParsedTurn = {
  id: string;
  fromSeq: number;
  toSeq: number;
  turnStart: number;
  turnEnd: number;
  success: boolean;
  events: SessionEvent[];
};

export function parseTurns(events: SessionEvent[]): ParsedTurn[] {
  const turns: ParsedTurn[] = [];
  let prelude: SessionEvent[] = [];
  let current: SessionEvent[] | null = null;
  let turnStart = 0;

  for (const event of events) {
    if (!current) {
      if (event.type === "system.tick_started") {
        current = [...prelude, event];
        turnStart = event.seq;
        prelude = [];
        continue;
      }
      prelude.push(event);
      continue;
    }

    current.push(event);

    if (event.type === "system.tick_completed" || event.type === "system.tick_failed") {
      turns.push({
        id: `turn:${turnStart}:${event.seq}`,
        fromSeq: current[0]?.seq ?? turnStart,
        toSeq: event.seq,
        turnStart,
        turnEnd: event.seq,
        success: event.type === "system.tick_completed",
        events: current
      });
      current = null;
    }
  }

  return turns;
}

export function toRecentRawTurn(turn: ParsedTurn): RecentRawTurn {
  return {
    id: turn.id,
    fromSeq: turn.fromSeq,
    toSeq: turn.toSeq,
    turnStart: turn.turnStart,
    turnEnd: turn.turnEnd,
    eventCount: turn.events.length,
    events: turn.events
  };
}

export function textOf(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => textOf(item))
      .filter(Boolean)
      .join("；");
    return normalized || fallback;
  }
  if (typeof value === "object") {
    const pairs = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const normalized = textOf(item);
        return normalized ? `${key}:${normalized}` : "";
      })
      .filter(Boolean);
    return pairs.join("；") || fallback;
  }
  return fallback;
}

export function truncateText(value: string, maxLength = 120): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function uniqStrings(values: string[], limit = 6): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.map((item) => item.trim()).filter(Boolean)) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

export function formatEventLine(event: SessionEvent): string {
  switch (event.type) {
    case "player.message":
      return `[${event.seq}] 玩家: ${truncateText(textOf(event.payload.text), 180)}`;
    case "agent.speak_player":
      return `[${event.seq}] ${textOf(event.payload.speaker, "角色")} 对玩家说: ${truncateText(textOf(event.payload.message), 180)}`;
    case "agent.speak_agent":
      return `[${event.seq}] ${textOf(event.payload.speaker, "角色")} 对 ${textOf(event.payload.targetAgentId, "其他角色")} 说: ${truncateText(textOf(event.payload.message), 180)}`;
    case "agent.reasoning":
      return `[${event.seq}] ${textOf(event.payload.speaker, "角色")} 的意图: ${truncateText(textOf(event.payload.summary), 180)}`;
    case "agent.stage_direction":
      return `[${event.seq}] ${textOf(event.payload.speaker, "角色")} 动作: ${truncateText(textOf(event.payload.direction), 180)}`;
    case "agent.story_effect":
      return `[${event.seq}] 剧情效果 ${textOf(event.payload.label, "未命名")}: ${truncateText(textOf(event.payload.description), 180)}`;
    case "scene.updated":
      return `[${event.seq}] 场景更新: phase=${textOf(event.payload.phase, "unknown")} | location=${textOf(event.payload.location, "unknown")} | tension=${textOf(event.payload.tension, "")} | summary=${truncateText(textOf(event.payload.summary), 180)}`;
    case "system.tick_started":
      return `[${event.seq}] 系统开始推演: ${textOf(event.payload.reason, "unknown")}`;
    case "system.tick_completed":
      return `[${event.seq}] 系统完成推演: ${textOf(event.payload.status, "unknown")}`;
    case "system.tick_failed":
      return `[${event.seq}] 系统推演失败: ${truncateText(textOf(event.payload.message), 180)}`;
    case "system.story_ended":
      return `[${event.seq}] 故事结束: ${truncateText(textOf(event.payload.summary), 180)}`;
    default:
      return `[${event.seq}] ${event.type}: ${truncateText(textOf(event.payload), 180)}`;
  }
}
