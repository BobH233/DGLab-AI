import { describe, expect, it } from "vitest";
import { hasInlineDelays, splitInlineDelays, stripInlineDelays } from "../inlineDelays";

describe("inlineDelays", () => {
  it("splits text and delay tags into playback parts", () => {
    expect(splitInlineDelays("先别急。<delay>1000</delay>再抬头看我。")).toEqual([
      {
        type: "text",
        text: "先别急。"
      },
      {
        type: "delay",
        delayMs: 1000
      },
      {
        type: "text",
        text: "再抬头看我。"
      }
    ]);
  });

  it("clamps invalid delays and removes tags from display text", () => {
    expect(splitInlineDelays("A<delay>999999</delay>B")).toEqual([
      {
        type: "text",
        text: "A"
      },
      {
        type: "delay",
        delayMs: 60000
      },
      {
        type: "text",
        text: "B"
      }
    ]);
    expect(stripInlineDelays("A<delay>800</delay>B")).toBe("AB");
    expect(hasInlineDelays("A<delay>800</delay>B")).toBe(true);
    expect(hasInlineDelays("AB")).toBe(false);
  });
});
