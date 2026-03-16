import { describe, expect, it } from "vitest";
import { createEmptyUsageStats, type Session } from "@dglab-ai/shared";
import { createDefaultToolRegistry } from "../tools/defaultTools.js";

function createSession(): Session {
  return {
    id: "session_test",
    status: "active",
    title: "Test",
    initialPrompt: "prompt",
    draft: {
      title: "Test",
      playerBrief: "brief",
      worldSummary: "world",
      openingSituation: "opening",
      playerState: "player state",
      suggestedPace: "pace",
      safetyFrame: "fiction only",
      agents: [
        {
          id: "director",
          name: "Director",
          role: "director",
          summary: "summary",
          persona: "persona",
          goals: ["goal"],
          style: ["cold"],
          boundaries: [],
          sortOrder: 0
        }
      ],
      sceneGoals: [],
      contentNotes: []
    },
    confirmedSetup: null,
    storyState: {
      location: "cell",
      phase: "opening",
      tension: 2,
      summary: "summary",
      activeObjectives: []
    },
    agentStates: {
      director: {
        mood: "focused",
        intent: "observe"
      }
    },
    timerState: {
      enabled: false,
      intervalMs: 10000,
      queuedReasons: [],
      queuedPlayerMessages: [],
      pendingWaits: []
    },
    usageTotals: createEmptyUsageStats(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSeq: 0
  };
}

describe("createDefaultToolRegistry", () => {
  it("exposes tool-specific world prompt hooks for enabled tools", () => {
    const registry = createDefaultToolRegistry();

    const contributions = registry.getWorldPromptContributions({
      playerBrief: "想要被遥控玩具挑逗的暧昧剧情"
    });

    expect(contributions.some((entry) => entry.toolId === "control_vibe_toy")).toBe(true);
    expect(contributions.find((entry) => entry.toolId === "control_vibe_toy")?.prompt).toContain("震动小玩具");
  });

  it("executes speak_to_player and emits a public event", async () => {
    const registry = createDefaultToolRegistry();
    const session = createSession();
    const events: Array<unknown> = [];
    await registry.execute({
      session,
      agent: session.draft.agents[0],
      now: new Date().toISOString(),
      addEvent: (event) => {
        events.push(event);
      }
    }, "speak_to_player", { message: "Stay where you are." });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "agent.speak_player"
    });
    expect(session.agentStates.director.intent).toBe("speak_to_player");
  });

  it("executes control_vibe_toy and emits a visible simulated device event", async () => {
    const registry = createDefaultToolRegistry();
    const session = createSession();
    const events: Array<unknown> = [];

    await registry.execute({
      session,
      agent: session.draft.agents[0],
      now: new Date().toISOString(),
      addEvent: (event) => {
        events.push(event);
      }
    }, "control_vibe_toy", {
      intensityPercent: 72,
      mode: "pulse"
    });

    expect(events[0]).toMatchObject({
      type: "agent.device_control",
      payload: {
        intensityPercent: 72,
        mode: "pulse",
        status: "simulated"
      }
    });
    expect(session.agentStates.director.intent).toBe("control_vibe_toy");
  });

  it("rejects unknown tools", async () => {
    const registry = createDefaultToolRegistry();
    await expect(registry.execute({
      session: createSession(),
      agent: createSession().draft.agents[0],
      now: new Date().toISOString(),
      addEvent: () => undefined
    }, "missing_tool", {})).rejects.toThrow("Unknown tool");
  });

  it("rejects speak_to_player calls that use legacy alias fields", async () => {
    const registry = createDefaultToolRegistry();
    const session = createSession();
    await expect(registry.execute({
      session,
      agent: session.draft.agents[0],
      now: new Date().toISOString(),
      addEvent: () => undefined
    }, "speak_to_player", {
      speaker: "Director",
      dialogue: "你没有退路了。"
    })).rejects.toThrow();
  });

  it("rejects speak_to_agent calls that use legacy alias fields", async () => {
    const registry = createDefaultToolRegistry();
    const session = createSession();
    await expect(registry.execute({
      session,
      agent: session.draft.agents[0],
      now: new Date().toISOString(),
      addEvent: () => undefined
    }, "speak_to_agent", {
      recipient: "demon_queen_moumou",
      text: "陛下，一切都在掌控中。"
    })).rejects.toThrow();
  });

  it("rejects extra or misnamed args for strict tool schemas", async () => {
    const registry = createDefaultToolRegistry();
    const session = createSession();
    const context = {
      session,
      agent: session.draft.agents[0],
      now: new Date().toISOString(),
      addEvent: () => undefined
    };

    await expect(registry.execute(context, "speak_to_agent", {
      recipient_id: "demon_queen_moumou",
      text: "锁链没有松动的可能。"
    })).rejects.toThrow();
    await expect(registry.execute(context, "apply_story_effect", {
      effect_label: "理智侵蚀"
    })).rejects.toThrow();
  });

  it("rejects legacy aliases for apply_story_effect and update_scene_state", async () => {
    const registry = createDefaultToolRegistry();
    const session = createSession();
    const context = {
      session,
      agent: session.draft.agents[0],
      now: new Date().toISOString(),
      addEvent: () => undefined
    };

    await expect(registry.execute(context, "apply_story_effect", {
      effect: "绝望感骤然加深。"
    })).rejects.toThrow();
    await expect(registry.execute(context, "update_scene_state", {
      current_location: "魔王城地牢",
      pressure: 4
    })).rejects.toThrow();
  });

  it("treats wait as an in-turn pause event instead of scheduling a future tick", async () => {
    const registry = createDefaultToolRegistry();
    const session = createSession();
    const events: Array<unknown> = [];

    await registry.execute({
      session,
      agent: session.draft.agents[0],
      now: new Date().toISOString(),
      addEvent: (event) => {
        events.push(event);
      }
    }, "wait", {
      delayMs: 1000,
      reason: "停顿一秒后再继续说话。"
    });

    expect(session.timerState.pendingWaits).toHaveLength(0);
    expect(events[0]).toMatchObject({
      type: "system.wait_scheduled",
      payload: {
        delayMs: 1000,
        reason: "停顿一秒后再继续说话。",
        speaker: "Director",
        mode: "in_turn_pause"
      }
    });
  });
});
