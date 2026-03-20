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

const INLINE_DELAY_PATTERN = /<delay>\s*(\d+)\s*<\/delay>/gi;
const MIN_DELAY_MS = 200;
const MAX_DELAY_MS = 60_000;

function createDelayPattern(): RegExp {
  return new RegExp(INLINE_DELAY_PATTERN.source, INLINE_DELAY_PATTERN.flags);
}

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

export function splitInlineDelays(source: string): InlineDelayPart[] {
  const parts: InlineDelayPart[] = [];
  const pattern = createDelayPattern();
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const text = source.slice(lastIndex, match.index);
    if (text) {
      parts.push({
        type: "text",
        text
      });
    }
    parts.push({
      type: "delay",
      delayMs: clampDelayMs(Number(match[1]))
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < source.length) {
    parts.push({
      type: "text",
      text: source.slice(lastIndex)
    });
  }

  if (parts.length === 0) {
    return [{
      type: "text",
      text: source
    }];
  }

  return parts;
}

export function stripInlineDelays(source: string): string {
  return source.replace(createDelayPattern(), "");
}

export function hasInlineDelays(source: string): boolean {
  return createDelayPattern().test(source);
}

export function formatInlineDelayMs(ms: number): string {
  if (ms >= 1000) {
    const seconds = Math.max(0.1, ms / 1000);
    return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} 秒`;
  }
  return `${Math.max(0, Math.round(ms))} ms`;
}

export function createStreamingInlineDelayState(): StreamingInlineDelayState {
  return {
    visibleSegments: [],
    pendingBuffer: ""
  };
}

export function appendStreamingInlineDelay(
  state: StreamingInlineDelayState,
  delta: string
): StreamingInlineDelayState {
  const consumed = consumeStreamingBuffer(`${state.pendingBuffer}${delta}`, false);
  return {
    visibleSegments: mergeInlineDelayParts([...state.visibleSegments, ...consumed.visibleSegments]),
    pendingBuffer: consumed.pendingBuffer
  };
}

export function finalizeStreamingInlineDelay(state: StreamingInlineDelayState): StreamingInlineDelayState {
  const consumed = consumeStreamingBuffer(state.pendingBuffer, true);
  return {
    visibleSegments: mergeInlineDelayParts([...state.visibleSegments, ...consumed.visibleSegments]),
    pendingBuffer: ""
  };
}
