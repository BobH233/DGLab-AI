import { describe, expect, it } from "vitest";
import {
  appendStreamingInlineDelay,
  createStreamingInlineDelayState,
  finalizeStreamingInlineDelay
} from "../inlineDelays";

describe("streaming inline delays", () => {
  it("keeps partial delay tags hidden until the full tag is complete", () => {
    let state = createStreamingInlineDelayState();
    state = appendStreamingInlineDelay(state, "站直。<del");

    expect(state.visibleSegments).toEqual([
      {
        type: "text",
        text: "站直。"
      }
    ]);
    expect(state.pendingBuffer).toBe("<del");

    state = appendStreamingInlineDelay(state, "ay>800</delay>肩放平。");

    expect(state.visibleSegments).toEqual([
      {
        type: "text",
        text: "站直。"
      },
      {
        type: "delay",
        delayMs: 800
      },
      {
        type: "text",
        text: "肩放平。"
      }
    ]);
    expect(state.pendingBuffer).toBe("");
  });

  it("falls back to plain text when delay-like content is invalid", () => {
    let state = createStreamingInlineDelayState();
    state = appendStreamingInlineDelay(state, "<delay>abc</delay>");
    state = finalizeStreamingInlineDelay(state);

    expect(state.visibleSegments).toEqual([
      {
        type: "text",
        text: "<delay>abc</delay>"
      }
    ]);
  });
});
