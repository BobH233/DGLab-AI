export type InlineDelayPart =
  | {
    type: "text";
    text: string;
  }
  | {
    type: "delay";
    delayMs: number;
  };

export type StreamingInlineDelayState = {
  visibleSegments: InlineDelayPart[];
  pendingBuffer: string;
};

export type PreviewActionState = {
  index: number;
  actorAgentId?: string;
  tool?: string;
  targetScope?: string;
  textByPath: Record<string, StreamingInlineDelayState>;
  valueByPath: Record<string, unknown>;
  completedFields: string[];
  completed: boolean;
};

export type PreviewTurnSnapshot = {
  turnId: string;
  actions: PreviewActionState[];
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  turnControl?: {
    continue: boolean;
    endStory: boolean;
    needsHandoff: boolean;
  };
  playerBodyItemState?: string[];
  status: "streaming" | "completed" | "failed";
  errorMessage?: string;
};

const MIN_DELAY_MS = 200;
const MAX_DELAY_MS = 60_000;

function clampDelayMs(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_DELAY_MS;
  }
  return Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, Math.round(value)));
}

function pushTextSegment(parts: InlineDelayPart[], text: string): void {
  if (!text) {
    return;
  }
  const last = parts[parts.length - 1];
  if (last?.type === "text") {
    last.text += text;
    return;
  }
  parts.push({
    type: "text",
    text
  });
}

function mergeInlineDelayParts(parts: InlineDelayPart[]): InlineDelayPart[] {
  const merged: InlineDelayPart[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      pushTextSegment(merged, part.text);
      continue;
    }
    merged.push(part);
  }
  return merged;
}

function readDelayToken(source: string, start: number): {
  kind: "complete";
  end: number;
  delayMs: number;
} | {
  kind: "pending";
} | {
  kind: "invalid";
} {
  const openTag = "<delay>";
  const closeTag = "</delay>";
  const tail = source.slice(start);
  const lowerTail = tail.toLowerCase();

  if (tail.length < openTag.length) {
    return openTag.startsWith(lowerTail)
      ? { kind: "pending" }
      : { kind: "invalid" };
  }

  if (!lowerTail.startsWith(openTag)) {
    return { kind: "invalid" };
  }

  let index = start + openTag.length;
  while (index < source.length && /\s/.test(source[index]!)) {
    index += 1;
  }

  const digitStart = index;
  while (index < source.length && /\d/.test(source[index]!)) {
    index += 1;
  }

  if (digitStart === index) {
    return index >= source.length ? { kind: "pending" } : { kind: "invalid" };
  }

  while (index < source.length && /\s/.test(source[index]!)) {
    index += 1;
  }

  const closeTail = source.slice(index).toLowerCase();
  if (closeTail.length < closeTag.length) {
    return closeTag.startsWith(closeTail)
      ? { kind: "pending" }
      : { kind: "invalid" };
  }

  if (!closeTail.startsWith(closeTag)) {
    return { kind: "invalid" };
  }

  return {
    kind: "complete",
    end: index + closeTag.length,
    delayMs: clampDelayMs(Number(source.slice(digitStart, index).trim()))
  };
}

function consumeStreamingBuffer(source: string, flushAll: boolean): StreamingInlineDelayState {
  const visibleSegments: InlineDelayPart[] = [];
  let textBuffer = "";
  let index = 0;

  while (index < source.length) {
    const nextTagStart = source.indexOf("<", index);
    if (nextTagStart === -1) {
      textBuffer += source.slice(index);
      index = source.length;
      break;
    }

    textBuffer += source.slice(index, nextTagStart);
    const token = readDelayToken(source, nextTagStart);
    if (token.kind === "complete") {
      pushTextSegment(visibleSegments, textBuffer);
      textBuffer = "";
      visibleSegments.push({
        type: "delay",
        delayMs: token.delayMs
      });
      index = token.end;
      continue;
    }
    if (token.kind === "pending" && !flushAll) {
      index = nextTagStart;
      break;
    }

    textBuffer += "<";
    index = nextTagStart + 1;
  }

  pushTextSegment(visibleSegments, textBuffer);

  return {
    visibleSegments,
    pendingBuffer: flushAll ? "" : source.slice(index)
  };
}

function createStreamingInlineDelayState(): StreamingInlineDelayState {
  return {
    visibleSegments: [],
    pendingBuffer: ""
  };
}

function appendStreamingInlineDelay(
  state: StreamingInlineDelayState,
  delta: string
): StreamingInlineDelayState {
  const consumed = consumeStreamingBuffer(`${state.pendingBuffer}${delta}`, false);
  return {
    visibleSegments: mergeInlineDelayParts([...state.visibleSegments, ...consumed.visibleSegments]),
    pendingBuffer: consumed.pendingBuffer
  };
}

function finalizeStreamingInlineDelay(state: StreamingInlineDelayState): StreamingInlineDelayState {
  const consumed = consumeStreamingBuffer(state.pendingBuffer, true);
  return {
    visibleSegments: mergeInlineDelayParts([...state.visibleSegments, ...consumed.visibleSegments]),
    pendingBuffer: ""
  };
}

function numberFromPayload(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function ensureAction(state: PreviewTurnSnapshot, index: number): PreviewActionState {
  let action = state.actions.find((item) => item.index === index);
  if (!action) {
    action = {
      index,
      textByPath: {},
      valueByPath: {},
      completedFields: [],
      completed: false
    };
    state.actions.push(action);
    state.actions.sort((left, right) => left.index - right.index);
  }
  return action;
}

function ensureTextState(action: PreviewActionState, path: string): StreamingInlineDelayState {
  const existing = action.textByPath[path];
  if (existing) {
    return existing;
  }
  const created = createStreamingInlineDelayState();
  action.textByPath[path] = created;
  return created;
}

export function applyPreviewSnapshotEvent(
  current: PreviewTurnSnapshot | null,
  type: string,
  payload: Record<string, unknown>
): PreviewTurnSnapshot | null {
  switch (type) {
    case "llm.turn.started":
      return {
        turnId: String(payload.turnId ?? ""),
        actions: [],
        model: typeof payload.model === "string" ? payload.model : undefined,
        status: "streaming"
      };
    case "llm.turn.failed":
      if (!current || current.turnId !== String(payload.turnId ?? "")) {
        return null;
      }
      return {
        ...current,
        status: "failed",
        errorMessage: typeof payload.message === "string" ? payload.message : undefined
      };
    case "llm.turn.completed":
      if (!current || current.turnId !== String(payload.turnId ?? "")) {
        return current;
      }
      return {
        ...current,
        model: typeof payload.model === "string" ? payload.model : current.model,
        promptTokens: numberFromPayload(payload.promptTokens) ?? current.promptTokens,
        completionTokens: numberFromPayload(payload.completionTokens) ?? current.completionTokens,
        totalTokens: numberFromPayload(payload.totalTokens) ?? current.totalTokens,
        status: "completed"
      };
    case "llm.turn.control":
      if (!current || current.turnId !== String(payload.turnId ?? "")) {
        return current;
      }
      return {
        ...current,
        turnControl: payload.value as PreviewTurnSnapshot["turnControl"]
      };
    case "llm.turn.player_body_item_state":
      if (!current || current.turnId !== String(payload.turnId ?? "")) {
        return current;
      }
      return {
        ...current,
        playerBodyItemState: Array.isArray(payload.value)
          ? payload.value.map((item) => String(item))
          : []
      };
    case "llm.action.started":
    case "llm.action.meta":
    case "llm.action.text.delta":
    case "llm.action.field.completed":
    case "llm.action.completed": {
      if (!current || current.turnId !== String(payload.turnId ?? "")) {
        return current;
      }

      const next: PreviewTurnSnapshot = {
        ...current,
        actions: current.actions.map((action) => ({
          ...action,
          textByPath: { ...action.textByPath },
          valueByPath: { ...action.valueByPath },
          completedFields: [...action.completedFields]
        }))
      };
      const index = Number(payload.index ?? -1);
      const action = ensureAction(next, index);

      if (type === "llm.action.meta") {
        action.actorAgentId = typeof payload.actorAgentId === "string" ? payload.actorAgentId : action.actorAgentId;
        action.tool = typeof payload.tool === "string" ? payload.tool : action.tool;
        action.targetScope = typeof payload.targetScope === "string" ? payload.targetScope : action.targetScope;
        return next;
      }

      if (type === "llm.action.text.delta") {
        const path = String(payload.path ?? "");
        const delta = String(payload.delta ?? "");
        action.textByPath[path] = appendStreamingInlineDelay(ensureTextState(action, path), delta);
        return next;
      }

      if (type === "llm.action.field.completed") {
        const path = String(payload.path ?? "");
        const existingTextState = action.textByPath[path];
        if (existingTextState) {
          action.textByPath[path] = finalizeStreamingInlineDelay(existingTextState);
        }
        if (payload.value !== undefined) {
          action.valueByPath[path] = payload.value;
        }
        if (!action.completedFields.includes(path)) {
          action.completedFields.push(path);
        }
        return next;
      }

      if (type === "llm.action.completed") {
        action.completed = true;
      }

      return next;
    }
    default:
      return current;
  }
}
