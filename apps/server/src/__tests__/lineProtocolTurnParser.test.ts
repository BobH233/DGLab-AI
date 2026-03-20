import { describe, expect, it } from "vitest";
import { LineProtocolTurnParser } from "../infra/LineProtocolTurnParser.js";

describe("LineProtocolTurnParser", () => {
  it("reconstructs an action batch and emits preview deltas", () => {
    const previewEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const parser = new LineProtocolTurnParser({
      turnId: "tick_1",
      emitPreviewEvent: (event) => {
        previewEvents.push(event);
      }
    });

    parser.push([
      "@action {\"actorAgentId\":\"director\",\"tool\":\"perform_stage_direction\",\"targetScope\":\"scene\"}",
      "@field args.direction",
      "你看见她先是停了一下，",
      "又抬眼看向你。",
      "@endfield",
      "@endaction",
      "@turnControl {\"continue\":true,\"endStory\":false,\"needsHandoff\":false}",
      "@playerBodyItemState [\"你现在戴着一副眼罩\"]",
      "@done"
    ].join("\n"));

    const result = parser.finish();

    expect(result.data.actions).toHaveLength(1);
    expect(result.data.actions[0]?.args).toEqual({
      direction: "你看见她先是停了一下，\n又抬眼看向你。"
    });
    expect(result.data.playerBodyItemState).toEqual(["你现在戴着一副眼罩"]);
    expect(previewEvents.some((event) => event.type === "llm.action.meta")).toBe(true);
    expect(previewEvents.filter((event) => event.type === "llm.action.text.delta")).not.toHaveLength(0);
  });

  it("parses JSON literals for non-text fields", () => {
    const parser = new LineProtocolTurnParser({
      turnId: "tick_2"
    });

    parser.push([
      "@action {\"actorAgentId\":\"director\",\"tool\":\"update_scene_state\"}",
      "@field args.tension",
      "7",
      "@endfield",
      "@field args.activeObjectives",
      "[\"继续施压\",\"逼你抬头\"]",
      "@endfield",
      "@endaction",
      "@turnControl {\"continue\":true,\"endStory\":false,\"needsHandoff\":false}",
      "@playerBodyItemState []",
      "@done"
    ].join("\n"));

    const result = parser.finish();

    expect(result.data.actions[0]?.args).toEqual({
      tension: 7,
      activeObjectives: ["继续施压", "逼你抬头"]
    });
  });
});
