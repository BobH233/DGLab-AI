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

  it("stores completed preview field values for non-stream text and scene-state cards", () => {
    const started = applyPreviewEvent(null, "llm.turn.started", {
      turnId: "tick_3",
      model: "gpt-5.4"
    });
    const withMeta = applyPreviewEvent(started, "llm.action.meta", {
      turnId: "tick_3",
      index: 0,
      tool: "update_scene_state",
      actorAgentId: "director",
      targetScope: "scene"
    });
    const withValue = applyPreviewEvent(withMeta, "llm.action.field.completed", {
      turnId: "tick_3",
      index: 0,
      path: "args.tension",
      value: 7
    });

    expect(withValue?.actions[0]?.valueByPath).toEqual({
      "args.tension": 7
    });
    expect(withValue?.actions[0]?.completedFields).toEqual(["args.tension"]);
  });
});
