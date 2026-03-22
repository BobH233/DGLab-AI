export type InlineDisplayPart =
  | {
    type: "text";
    text: string;
  }
  | {
    type: "emotion";
    value: string;
  };

export type InlineDelayPart =
  | InlineDisplayPart
  | {
    type: "delay";
    delayMs: number;
  };

export type StreamingInlineDelayState = {
  visibleSegments: InlineDelayPart[];
  pendingBuffer: string;
};

const INLINE_DELAY_PATTERN = /<delay>\s*(\d+)\s*<\/delay>/gi;
const INLINE_EMOTION_PATTERN = /<emo_inst>([\s\S]*?)<\/emo_inst>/gi;
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

export function pushInlineDisplayPart(parts: InlineDisplayPart[], part: InlineDisplayPart): void {
  if (part.type === "text") {
    if (!part.text) {
      return;
    }
    const last = parts[parts.length - 1];
    if (last?.type === "text") {
      last.text += part.text;
      return;
    }
  }
  parts.push(part);
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

function createEmotionPattern(): RegExp {
  return new RegExp(INLINE_EMOTION_PATTERN.source, INLINE_EMOTION_PATTERN.flags);
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

function readEmotionToken(source: string, start: number): {
  kind: "complete";
  end: number;
  value: string;
} | {
  kind: "pending";
} | {
  kind: "invalid";
} {
  const openTag = "<emo_inst>";
  const closeTag = "</emo_inst>";
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

  const contentStart = start + openTag.length;
  const lowerSource = source.toLowerCase();
  const closeIndex = lowerSource.indexOf(closeTag, contentStart);
  if (closeIndex === -1) {
    return { kind: "pending" };
  }

  const value = source.slice(contentStart, closeIndex).trim();
  if (!value) {
    return { kind: "invalid" };
  }

  return {
    kind: "complete",
    end: closeIndex + closeTag.length,
    value
  };
}

function readInlineToken(source: string, start: number): {
  kind: "complete";
  end: number;
  part: Exclude<InlineDelayPart, { type: "text" }>;
} | {
  kind: "pending";
} | {
  kind: "invalid";
} {
  const delayToken = readDelayToken(source, start);
  if (delayToken.kind === "complete") {
    return {
      kind: "complete",
      end: delayToken.end,
      part: {
        type: "delay",
        delayMs: delayToken.delayMs
      }
    };
  }
  if (delayToken.kind === "pending") {
    return delayToken;
  }

  const emotionToken = readEmotionToken(source, start);
  if (emotionToken.kind === "complete") {
    return {
      kind: "complete",
      end: emotionToken.end,
      part: {
        type: "emotion",
        value: emotionToken.value
      }
    };
  }
  if (emotionToken.kind === "pending") {
    return emotionToken;
  }

  return { kind: "invalid" };
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
    const token = readInlineToken(source, nextTagStart);
    if (token.kind === "complete") {
      pushTextSegment(visibleSegments, textBuffer);
      textBuffer = "";
      visibleSegments.push(token.part);
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
  return consumeStreamingBuffer(source, true).visibleSegments;
}

export function stripInlineDelays(source: string): string {
  return source
    .replace(createDelayPattern(), "")
    .replace(createEmotionPattern(), "")
    .trim();
}

export function hasInlineDelays(source: string): boolean {
  return createDelayPattern().test(source) || createEmotionPattern().test(source);
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

export function extractInlineDisplayParts(parts: InlineDelayPart[]): InlineDisplayPart[] {
  const extracted: InlineDisplayPart[] = [];
  for (const part of parts) {
    if (part.type === "delay") {
      continue;
    }
    pushInlineDisplayPart(extracted, part);
  }
  return extracted;
}

export function trimInlineDisplayParts(parts: InlineDisplayPart[]): InlineDisplayPart[] {
  const trimmed = parts.map((part) => ({ ...part }));
  while (trimmed[0]?.type === "text") {
    const nextText = trimmed[0].text.replace(/^\s+/, "");
    if (nextText) {
      trimmed[0].text = nextText;
      break;
    }
    trimmed.shift();
  }
  while (trimmed[trimmed.length - 1]?.type === "text") {
    const lastIndex = trimmed.length - 1;
    const lastPart = trimmed[lastIndex];
    if (!lastPart || lastPart.type !== "text") {
      break;
    }
    const nextText = lastPart.text.replace(/\s+$/, "");
    if (nextText) {
      trimmed[lastIndex] = {
        ...lastPart,
        text: nextText
      };
      break;
    }
    trimmed.pop();
  }
  return trimmed.reduce<InlineDisplayPart[]>((merged, part) => {
    const previous = merged[merged.length - 1];
    if (
      part.type === "text"
      && !part.text.trim()
      && previous?.type === "emotion"
    ) {
      return merged;
    }
    if (
      part.type === "emotion"
      && previous?.type === "text"
      && !previous.text.trim()
    ) {
      merged.pop();
    }
    pushInlineDisplayPart(merged, part);
    return merged;
  }, []);
}

export function inlineDisplayPartsToText(parts: InlineDisplayPart[]): string {
  return parts
    .filter((part): part is Extract<InlineDisplayPart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function hasInlineDisplayContent(parts: InlineDisplayPart[]): boolean {
  return parts.some((part) => part.type === "emotion" || part.text.trim().length > 0);
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
