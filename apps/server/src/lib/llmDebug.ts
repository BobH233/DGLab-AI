export function isLlmDebugEnabled(): boolean {
  return process.env.LLM_DEBUG === "1" || process.env.DEBUG_LLM === "1";
}

type LiveStreamDebugContext = {
  model: string;
  strategy: string;
  kind?: string;
  sessionId?: string;
};

export function createLiveStreamDebugLogger(context: LiveStreamDebugContext): {
  writeTextDelta(delta: string): void;
  close(status: "completed" | "error"): void;
} {
  let started = false;
  let closed = false;
  let endedWithNewline = true;
  const suffixParts = [
    context.strategy,
    `model=${context.model}`,
    context.kind ? `kind=${context.kind}` : null,
    context.sessionId ? `session=${context.sessionId}` : null
  ].filter(Boolean);
  const suffix = suffixParts.join(" ");

  return {
    writeTextDelta(delta: string): void {
      if (!isLlmDebugEnabled() || !delta) {
        return;
      }
      if (!started) {
        started = true;
        console.log(`[LLM STREAM START] ${suffix}`);
      }
      process.stdout.write(delta);
      endedWithNewline = delta.endsWith("\n");
    },
    close(status: "completed" | "error"): void {
      if (!isLlmDebugEnabled() || !started || closed) {
        return;
      }
      closed = true;
      if (!endedWithNewline) {
        process.stdout.write("\n");
      }
      console.log(`[LLM STREAM END] ${status} ${suffix}`);
    }
  };
}
