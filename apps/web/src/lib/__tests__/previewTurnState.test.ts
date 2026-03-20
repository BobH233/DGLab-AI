import { describe, expect, it } from "vitest";
import { applyPreviewEvent } from "../previewTurnState";

describe("previewTurnState", () => {
  it("stores the model when a preview turn starts", () => {
    const next = applyPreviewEvent(null, "llm.turn.started", {
      turnId: "tick_1",
      model: "gpt-5.4"
    });

    expect(next).toMatchObject({
      turnId: "tick_1",
      status: "streaming",
      model: "gpt-5.4"
    });
  });

  it("stores usage details when a preview turn completes", () => {
    const started = applyPreviewEvent(null, "llm.turn.started", {
      turnId: "tick_2",
      model: "gpt-5.4"
    });
    const completed = applyPreviewEvent(started, "llm.turn.completed", {
      turnId: "tick_2",
      model: "gpt-5.4",
      promptTokens: 9123,
      completionTokens: 6130,
      totalTokens: 15253
    });

    expect(completed).toMatchObject({
      turnId: "tick_2",
      status: "completed",
      model: "gpt-5.4",
      promptTokens: 9123,
      completionTokens: 6130,
      totalTokens: 15253
    });
  });
});
