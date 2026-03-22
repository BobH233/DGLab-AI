import { describe, expect, it } from "vitest";
import {
  appendStreamingInlineDelay,
  createStreamingInlineDelayState,
  finalizeStreamingInlineDelay,
  trimInlineDisplayParts
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

  it("keeps partial emotion tags hidden until the full tag is complete", () => {
    let state = createStreamingInlineDelayState();
    state = appendStreamingInlineDelay(state, "你好呀<emo_");

    expect(state.visibleSegments).toEqual([
      {
        type: "text",
        text: "你好呀"
      }
    ]);
    expect(state.pendingBuffer).toBe("<emo_");

    state = appendStreamingInlineDelay(state, "inst>excited</emo_inst>终于又见到你了。");

    expect(state.visibleSegments).toEqual([
      {
        type: "text",
        text: "你好呀"
      },
      {
        type: "emotion",
        value: "excited"
      },
      {
        type: "text",
        text: "终于又见到你了。"
      }
    ]);
    expect(state.pendingBuffer).toBe("");
  });

  it("falls back to plain text when an emotion tag is invalid", () => {
    let state = createStreamingInlineDelayState();
    state = appendStreamingInlineDelay(state, "<emo_inst>   </emo_inst>");
    state = finalizeStreamingInlineDelay(state);

    expect(state.visibleSegments).toEqual([
      {
        type: "text",
        text: "<emo_inst>   </emo_inst>"
      }
    ]);
  });

  it("removes whitespace-only separators between consecutive emotion tags", () => {
    expect(trimInlineDisplayParts([
      {
        type: "emotion",
        value: "cold tone"
      },
      {
        type: "text",
        text: " "
      },
      {
        type: "emotion",
        value: "slow"
      }
    ])).toEqual([
      {
        type: "emotion",
        value: "cold tone"
      },
      {
        type: "emotion",
        value: "slow"
      }
    ]);
  });
});
