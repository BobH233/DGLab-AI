import { describe, expect, it } from "vitest";
import { createEmptyMemoryState, createEmptyUsageStats, type Session } from "@dglab-ai/shared";
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
      initialPlayerBodyItemState: [],
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
    playerBodyItemState: [],
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
    memoryState: createEmptyMemoryState(),
    timerState: {
      enabled: false,
      intervalMs: 10000,
      inFlight: false,
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
      playerBrief: "想要被遥控玩具挑逗的暧昧剧情",
      toolContext: {
        eStim: {
          bChannelEnabled: true,
          channelPlacements: {
            a: "臀部",
            b: "大腿两侧"
          },
          allowedPulses: [],
          runtime: {
            a: {
              enabled: true,
              strength: 0,
              limit: 20,
              tempStrength: 0
            },
            b: {
              enabled: true,
              strength: 0,
              limit: 20,
              tempStrength: 0
            }
          }
        }
      }
    }, {
      control_e_stim_toy: true
    });

    expect(contributions.some((entry) => entry.toolId === "control_vibe_toy")).toBe(true);
    expect(contributions.find((entry) => entry.toolId === "control_vibe_toy")?.prompt).toContain("震动小玩具");
    expect(contributions.some((entry) => entry.toolId === "control_e_stim_toy")).toBe(true);
    expect(contributions.find((entry) => entry.toolId === "control_e_stim_toy")?.prompt).toContain("already has an e-stim device attached and connected");
    expect(contributions.find((entry) => entry.toolId === "control_e_stim_toy")?.prompt).toContain("Channel A output is already connected at: 臀部.");
    expect(contributions.find((entry) => entry.toolId === "control_e_stim_toy")?.prompt).toContain("Channel B output is already connected at: 大腿两侧.");
  });

  it("filters optional tools by global tool state while keeping required tools enabled", async () => {
    const registry = createDefaultToolRegistry();
    const disabledOptionalTools = {
      control_vibe_toy: false,
      speak_to_player: false
    };

    const listedTools = registry.list(disabledOptionalTools).map((tool) => tool.id);
    const contributions = registry.getWorldPromptContributions({
      playerBrief: "普通剧情"
    }, disabledOptionalTools);

    expect(listedTools).not.toContain("control_vibe_toy");
    expect(listedTools).toContain("speak_to_player");
    expect(contributions.some((entry) => entry.toolId === "control_vibe_toy")).toBe(false);

    await expect(registry.execute({
      session: createSession(),
      agent: createSession().draft.agents[0],
      now: new Date().toISOString(),
      addEvent: () => undefined
    }, "control_vibe_toy", { intensityPercent: 10 }, disabledOptionalTools)).rejects.toThrow("Tool is disabled");
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

  it("exposes live turn prompt state for control_vibe_toy without writing extra history", async () => {
    const registry = createDefaultToolRegistry();
    const session = createSession();
    const events: Array<unknown> = [];

    const beforeContributions = await registry.getTurnPromptContributions({
      session,
      now: new Date().toISOString(),
      reason: "player_message"
    });

    expect(beforeContributions.some((entry) => entry.toolId === "control_vibe_toy")).toBe(false);

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

    const contributions = await registry.getTurnPromptContributions({
      session,
      now: new Date().toISOString(),
      reason: "player_message"
    }, {
      control_e_stim_toy: true
    });
    const vibeContribution = contributions.find((entry) => entry.toolId === "control_vibe_toy");

    expect(events).toHaveLength(1);
    expect(vibeContribution).toMatchObject({
      toolId: "control_vibe_toy"
    });
    expect(vibeContribution?.prompt).toContain("强度 72%");
    expect(vibeContribution?.prompt).toContain("模式：pulse");
    expect(vibeContribution?.prompt).toContain("状态来源：simulated");
  });

  it("exposes e-stim runtime context and emits a frontend-pending device event", async () => {
    const registry = createDefaultToolRegistry();
    const session = createSession();
    session.toolContext = {
      eStim: {
        gameConnectionCodeLabel: "client@http://127.0.0.1:8920",
        bChannelEnabled: true,
        channelPlacements: {
          a: "臀部",
          b: "大腿两侧"
        },
        allowedPulses: [
          { id: "pulse_1", name: "呼吸" },
          { id: "pulse_2", name: "敲击" }
        ],
        lastSyncedAt: new Date().toISOString(),
        runtime: {
          a: {
            enabled: true,
            strength: 4,
            limit: 20,
            tempStrength: 0,
            currentPulseId: "pulse_1",
            currentPulseName: "呼吸",
            fireStrengthLimit: 30
          },
          b: {
            enabled: true,
            strength: 6,
            limit: 20,
            tempStrength: 0,
            currentPulseId: "pulse_2",
            currentPulseName: "敲击",
            fireStrengthLimit: 25
          }
        }
      }
    };
    const events: Array<unknown> = [];

    const contributions = await registry.getTurnPromptContributions({
      session,
      now: new Date().toISOString(),
      reason: "player_message"
    }, {
      control_e_stim_toy: true
    });

    expect(contributions.some((entry) => entry.toolId === "control_e_stim_toy")).toBe(true);
    expect(contributions.find((entry) => entry.toolId === "control_e_stim_toy")?.prompt).toContain("Allowed pulse names: 呼吸, 敲击");
    expect(contributions.find((entry) => entry.toolId === "control_e_stim_toy")?.prompt).toContain("Channel B");
    expect(contributions.find((entry) => entry.toolId === "control_e_stim_toy")?.prompt).toContain("Placement: 臀部");
    expect(contributions.find((entry) => entry.toolId === "control_e_stim_toy")?.prompt).toContain("Placement: 大腿两侧");
    expect(contributions.find((entry) => entry.toolId === "control_e_stim_toy")?.prompt).toContain("never emit `@field args`");
    expect(contributions.find((entry) => entry.toolId === "control_e_stim_toy")?.prompt).toContain("`@field args.command`, `@field args.durationMs`, `@field args.override`, `@field args.channels`");

    await registry.execute({
      session,
      agent: session.draft.agents[0],
      now: new Date().toISOString(),
      addEvent: (event) => {
        events.push(event);
      }
    }, "control_e_stim_toy", {
      command: "fire",
      durationMs: 4000,
      override: true,
      channels: {
        a: {
          intensityPercent: 60,
          pulseName: "呼吸"
        },
        b: {
          enabled: true,
          intensityPercent: 35,
          pulseName: "敲击"
        }
      }
    }, {
      control_e_stim_toy: true
    });

    expect(events[0]).toMatchObject({
      type: "agent.device_control",
      payload: {
        action: "control_e_stim_toy",
        command: "fire",
        durationMs: 4000,
        status: "frontend_pending"
      }
    });
    expect(session.agentStates.director.intent).toBe("control_e_stim_toy");
  });

  it("rejects e-stim set commands that include fire-only keys", async () => {
    const registry = createDefaultToolRegistry();
    const session = createSession();

    await expect(registry.execute({
      session,
      agent: session.draft.agents[0],
      now: new Date().toISOString(),
      addEvent: () => undefined
    }, "control_e_stim_toy", {
      command: "set",
      durationMs: 1000,
      override: true,
      channels: {
        a: {
          intensityPercent: 20,
          pulseName: "呼吸"
        }
      }
    }, {
      control_e_stim_toy: true
    })).rejects.toThrow("Unrecognized key(s) in object: 'durationMs', 'override'");
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

  it("clamps update_scene_state tension into the supported range", async () => {
    const registry = createDefaultToolRegistry();
    const session = createSession();
    const events: Array<Record<string, unknown>> = [];

    await registry.execute({
      session,
      agent: session.draft.agents[0],
      now: new Date().toISOString(),
      addEvent: (event) => {
        events.push(event as Record<string, unknown>);
      }
    }, "update_scene_state", {
      tension: 11
    });

    expect(session.storyState.tension).toBe(10);
    expect(events[0]).toMatchObject({
      type: "scene.updated",
      payload: {
        tension: 10
      }
    });
  });

  it("passes hidden memory hints through update_scene_state for later memory assembly", async () => {
    const registry = createDefaultToolRegistry();
    const session = createSession();
    const events: Array<Record<string, unknown>> = [];

    await registry.execute({
      session,
      agent: session.draft.agents[0],
      now: new Date().toISOString(),
      addEvent: (event) => {
        events.push(event as Record<string, unknown>);
      }
    }, "update_scene_state", {
      summary: "你能感觉到他正在一步步收紧掌控。",
      memorySummary: "角色逐步收紧掌控，并逼玩家表态。",
      memoryKeyDevelopments: ["角色通过靠近与停顿制造压力"],
      memoryCharacterStates: ["角色维持从容主导"]
    });

    expect(events[0]).toMatchObject({
      type: "scene.updated",
      payload: {
        summary: "你能感觉到他正在一步步收紧掌控。",
        memorySummary: "角色逐步收紧掌控，并逼玩家表态。",
        memoryKeyDevelopments: ["角色通过靠近与停顿制造压力"],
        memoryCharacterStates: ["角色维持从容主导"]
      }
    });
  });

  it("strips inline delay tags from update_scene_state summary before storing it", async () => {
    const registry = createDefaultToolRegistry();
    const session = createSession();
    const events: Array<Record<string, unknown>> = [];

    await registry.execute({
      session,
      agent: session.draft.agents[0],
      now: new Date().toISOString(),
      addEvent: (event) => {
        events.push(event as Record<string, unknown>);
      }
    }, "update_scene_state", {
      summary: "你一句试探没能糊弄过去。<delay>800</delay>她们顺势把你逼得更近。"
    });

    expect(session.storyState.summary).toBe("你一句试探没能糊弄过去。她们顺势把你逼得更近。");
    expect(events[0]).toMatchObject({
      type: "scene.updated",
      payload: {
        summary: "你一句试探没能糊弄过去。她们顺势把你逼得更近。"
      }
    });
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
