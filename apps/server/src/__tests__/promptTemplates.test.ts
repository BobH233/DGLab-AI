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
      agentRoster: "director",
      agentRuntimeState: "{}",
      sessionDraft: "{}",
      sceneState: "{}",
      recentEvents: "[]",
      tickContext: "{}"
    });

    expect(prompt).toContain("interactive fiction aimed directly at the player");
    expect(prompt).toContain("immersive second-person narration");
    expect(prompt).toContain("do not refer to the player as `玩家`, by proper name, or with third-person pronouns");
  });

  it("keeps tool contract guidance aligned with player-facing second-person output", async () => {
    const prompt = await promptService.render("tool_contract", {
      toolReference: "tool reference",
      toolExamples: "tool examples"
    });

    expect(prompt).toContain("Perspective rules for all player-visible strings");
    expect(prompt).toContain("must be written from the player's direct second-person perspective");
    expect(prompt).toContain("A character may still say the player's name inside direct dialogue");
  });
});
