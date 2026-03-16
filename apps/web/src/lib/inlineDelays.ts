export type InlineDelayPart =
  | {
    type: "text";
    text: string;
  }
  | {
    type: "delay";
    delayMs: number;
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
