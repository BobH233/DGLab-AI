import { afterEach, describe, expect, it, vi } from "vitest";
import { LineProtocolTurnParser } from "../infra/LineProtocolTurnParser.js";

describe("LineProtocolTurnParser", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

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
      "@playerMessageInterpretations []",
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
      "@playerMessageInterpretations []",
      "@playerBodyItemState []",
      "@done"
    ].join("\n"));

    const result = parser.finish();

    expect(result.data.actions[0]?.args).toEqual({
      tension: 7,
      activeObjectives: ["继续施压", "逼你抬头"]
    });
  });

  it("streams scene-state text fields and includes completed field values", () => {
    const previewEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const parser = new LineProtocolTurnParser({
      turnId: "tick_3",
      emitPreviewEvent: (event) => {
        previewEvents.push(event);
      }
    });

    parser.push([
      "@action {\"actorAgentId\":\"director\",\"tool\":\"update_scene_state\",\"targetScope\":\"scene\"}",
      "@field args.phase",
      "teasing",
      "@endfield",
      "@field args.location",
      "会客室",
      "@endfield",
      "@field args.summary",
      "你已经被他缓慢收紧的节奏牵住注意力。",
      "@endfield",
      "@field args.tension",
      "7",
      "@endfield",
      "@field args.activeObjectives",
      "[\"让你继续停留\",\"逼你给出更诚实的反应\"]",
      "@endfield",
      "@endaction",
      "@turnControl {\"continue\":true,\"endStory\":false,\"needsHandoff\":false}",
      "@playerMessageInterpretations []",
      "@playerBodyItemState []",
      "@done"
    ].join("\n"));

    parser.finish();

    const streamedPaths = new Set(
      previewEvents
        .filter((event) => event.type === "llm.action.text.delta")
        .map((event) => String(event.payload.path))
    );

    expect(streamedPaths).toEqual(new Set([
      "args.phase",
      "args.location",
      "args.summary"
    ]));
    expect(previewEvents.filter((event) => event.type === "llm.action.field.completed").map((event) => ({
      path: event.payload.path,
      value: event.payload.value
    }))).toEqual([
      { path: "args.phase", value: "teasing" },
      { path: "args.location", value: "会客室" },
      { path: "args.summary", value: "你已经被他缓慢收紧的节奏牵住注意力。" },
      { path: "args.tension", value: 7 },
      { path: "args.activeObjectives", value: ["让你继续停留", "逼你给出更诚实的反应"] }
    ]);
  });

  it("accepts pretty-printed multiline playerBodyItemState JSON", () => {
    const parser = new LineProtocolTurnParser({
      turnId: "tick_multiline_body"
    });

    parser.push([
      "@action {\"actorAgentId\":\"director\",\"tool\":\"perform_stage_direction\",\"targetScope\":\"scene\"}",
      "@field args.direction",
      "你听见她放轻了声音。",
      "@endfield",
      "@endaction",
      "@turnControl {\"continue\":true,\"endStory\":false,\"needsHandoff\":false}",
      "@playerMessageInterpretations [",
      "  {",
      "    \"sourceIndex\": 0,",
      "    \"ttsText\": \"<emo_inst>sad</emo_inst>神子，你还想把我怎么样啊！\"",
      "  }",
      "]",
      "@playerBodyItemState [",
      "  \"你现在戴着一副严密的遮光眼罩\",",
      "  \"你现在双手被束在身后\"",
      "]",
      "@done"
    ].join("\n"));

    const result = parser.finish();

    expect(result.data.playerMessageInterpretations).toEqual([
      {
        sourceIndex: 0,
        ttsText: "<emo_inst>sad</emo_inst>神子，你还想把我怎么样啊！"
      }
    ]);
    expect(result.data.playerBodyItemState).toEqual([
      "你现在戴着一副严密的遮光眼罩",
      "你现在双手被束在身后"
    ]);
  });

  it("includes the broken control JSON fragment in parser errors", () => {
    const parser = new LineProtocolTurnParser({
      turnId: "tick_4"
    });

    const payload = [
      "@action {\"actorAgentId\":\"director\",\"tool\":\"speak_to_player\"}",
      "@field args.message",
      "说吧。",
      "@endfield",
      "@endaction",
      "@turnControl {\"continue\":true,\"endStory\":false",
      "@done"
    ].join("\n");

    let thrown: unknown;
    try {
      parser.push(payload);
      parser.finish();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/Failed to parse @turnControl JSON:/);
    expect((thrown as Error).message).toMatch(/JSON fragment: \{\"continue\":true,\"endStory\":false/);
  });

  it("logs detailed parser context when DEBUG_LLM=1", () => {
    vi.stubEnv("DEBUG_LLM", "1");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const parser = new LineProtocolTurnParser({
      turnId: "tick_5"
    });

    parser.push("@playerBodyItemState [\"mask\"");

    expect(() => parser.finish()).toThrowError(/Failed to parse @playerBodyItemState JSON/);
    expect(consoleError).toHaveBeenCalledWith("[LLM DEBUG] line_protocol_control_json_parse_failed");
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("\"label\": \"@playerBodyItemState\""));
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("\"rawJson\": \"[\\\"mask\\\"\""));
  });

  it("parses multiline player message interpretations JSON", () => {
    const parser = new LineProtocolTurnParser({
      turnId: "tick_player_interp"
    });

    parser.push([
      "@turnControl {\"continue\":true,\"endStory\":false,\"needsHandoff\":false}",
      "@playerMessageInterpretations [",
      "  {",
      "    \"sourceIndex\": 0,",
      "    \"ttsText\": \"<emo_inst>low voice</emo_inst>唔，这个强度，好像有些适应了呢。\"",
      "  },",
      "  {",
      "    \"sourceIndex\": 1,",
      "    \"ttsText\": \"<emo_inst>sad</emo_inst><emo_inst>angry</emo_inst>神子，你还想把我怎么样啊！\"",
      "  }",
      "]",
      "@playerBodyItemState []",
      "@done"
    ].join("\n"));

    const result = parser.finish();

    expect(result.data.playerMessageInterpretations).toEqual([
      {
        sourceIndex: 0,
        ttsText: "<emo_inst>low voice</emo_inst>唔，这个强度，好像有些适应了呢。"
      },
      {
        sourceIndex: 1,
        ttsText: "<emo_inst>sad</emo_inst><emo_inst>angry</emo_inst>神子，你还想把我怎么样啊！"
      }
    ]);
  });
});
