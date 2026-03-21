import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FilePromptTemplateService } from "../infra/PromptTemplateService.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const promptService = new FilePromptTemplateService(path.resolve(currentDir, "../prompts"));

describe("prompt templates", () => {
  it("keeps the ensemble turn focused on immersive second-person narration", async () => {
    const prompt = await promptService.render("ensemble_turn", {
      sharedSafety: await promptService.getTemplate("shared_safety_preamble"),
      toolContract: "tool contract",
      r18Guidance: "r18 guidance",
      agentRoster: "director",
      agentRuntimeState: "{}",
      sessionDraft: "{}",
      sceneState: "{}",
      playerBodyItemState: "[]",
      toolRuntimeContext: "- Tool: control_vibe_toy\n当前读取到穿戴式震动小玩具的运行时状态：强度 72%。",
      archiveMemory: "archive block",
      episodeMemories: "episode block",
      turnMemories: "turn block",
      recentRawTurns: "recent raw turns",
      playerMessagesHistory: "player messages history",
      tickContext: "{}"
    });

    expect(prompt).toContain("interactive fiction aimed directly at the player");
    expect(prompt).toContain("tool contract");
    expect(prompt).toContain("r18 guidance");
    expect(prompt).toContain("Prefer vivid sensory phrasing over detached observer summaries");
    expect(prompt).toContain("Every action object must use the exact fields `actorAgentId`, `tool`, and `args`");
    expect(prompt).toContain("slow-burn, romantic, adult, emotionally charged cadence");
    expect(prompt).toContain("Do not over-focus on any single enabled tool or device");
    expect(prompt).toContain("Do not leave the entire burden of momentum on the player");
    expect(prompt).toContain("Props and scene elements mentioned in the player brief");
    expect(prompt).toContain("Do not collapse an intimate beat into a single vague line");
    expect(prompt).toContain("Keep the fiction close to the body and moment-by-moment");
    expect(prompt).toContain("If a character both speaks and acts in the same beat, emit both tools");
    expect(prompt).toContain("Do not hide motion, touching, prop handling, posture changes, or narration inside dialogue strings");
    expect(prompt).toContain("Compressed long-term memory");
    expect(prompt).toContain("Compressed mid-term memory");
    expect(prompt).toContain("Recent raw turns");
    expect(prompt).toContain("Persistent player utterances");
    expect(prompt).toContain("Current player body item state");
    expect(prompt).toContain("Current live tool runtime state for this turn only");
    expect(prompt).toContain("ephemeral turn-only context");
    expect(prompt).toContain("must return a complete `playerBodyItemState` array");
    expect(prompt).toContain("trust recent raw turns");
    expect(prompt).toContain("authoritative ledger");
  });

  it("keeps tool contract guidance aligned with player-facing second-person output", async () => {
    const prompt = await promptService.render("tool_contract", {
      toolReference: "tool reference",
      toolExamples: "tool examples"
    });

    expect(prompt).toContain("Perspective rules for all player-visible strings");
    expect(prompt).toContain("must be written from the player's direct second-person perspective");
    expect(prompt).toContain("A character may still say the player's name inside direct dialogue");
    expect(prompt).toContain("prefer romantic, playful, adult, suggestive, non-explicit beats");
    expect(prompt).toContain("Avoid repetitive fixation on a single device or mechanic");
    expect(prompt).toContain("Tool calls are presentation containers, not a restriction on fictional scene content");
    expect(prompt).toContain("Do not stall waiting for the player to invent the next move");
    expect(prompt).toContain("<delay>1000</delay>");
    expect(prompt).toContain("`update_scene_state.summary` must stay plain readable narration");
    expect(prompt).toContain("Do not fall into a rigid one-line-then-one-tool rhythm");
    expect(prompt).toContain("do not skip from intent to completion");
    expect(prompt).toContain("prefer abstract causal summaries over sensory replay");
    expect(prompt).toContain("must contain only the words spoken to the player");
    expect(prompt).toContain("split it across tools");
    expect(prompt).toContain("Use only the exact tool ids and argument keys shown in the Tool reference above.");
    expect(prompt).toContain("Do not collapse a multi-property args object into a single root field like `@field args`");
    expect(prompt).toContain("For `control_e_stim_toy`, never emit a single `@field args` block containing the whole JSON object.");
  });

  it("keeps the shared safety preamble aligned with adult romantic but non-explicit storytelling", async () => {
    const prompt = await promptService.getTemplate("shared_safety_preamble");

    expect(prompt).toContain("All characters are **fictional adults (18+)**.");
    expect(prompt).toContain("Non-explicit romantic or suggestive content is allowed");
    expect(prompt).toContain("Prioritize emotional pull, chemistry, teasing, and narrative intimacy");
  });

  it("allows world builder prompts to weave active tool hooks into the setup", async () => {
    const prompt = await promptService.render("world_builder", {
      sharedSafety: await promptService.getTemplate("shared_safety_preamble"),
      playerBrief: "brief",
      toolWorldHooks: "- Tool: control_vibe_toy\n玩家身上有一个可控制的小玩具。"
    });

    expect(prompt).toContain("Tool-specific world-building hooks");
    expect(prompt).not.toContain("r18 guidance");
    expect(prompt).toContain("treat them as active capabilities in this session");
    expect(prompt).toContain("control_vibe_toy");
    expect(prompt).toContain("Do not let a single enabled device monopolize the setup");
    expect(prompt).toContain("If the player brief already mentions props");
    expect(prompt).toContain("must function as a forward-looking outline for the whole story");
    expect(prompt).toContain("pre-plan 3 to 6 sequential phases or time blocks");
    expect(prompt).toContain("state the rough order or timing");
    expect(prompt).toContain("Use `suggestedPace` to pre-commit to a varied sequence");
    expect(prompt).toContain("Make the `sceneGoals` and agent goals proactive");
    expect(prompt).toContain("initialPlayerBodyItemState");
  });

  it("loads the standalone r18 guidance template", async () => {
    const prompt = await promptService.getTemplate("r18_guidance");

    expect(prompt).toBeDefined();
  });
});
