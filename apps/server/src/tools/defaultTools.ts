import { z } from "zod";
import { isToolEnabled } from "@dglab-ai/shared";
import type { ToolDefinition, ToolRegistry } from "../types/contracts.js";
import { HttpError } from "../lib/errors.js";
import { createId } from "../lib/ids.js";

function clampTension(value: number): number {
  return Math.max(0, Math.min(10, value));
}

const INLINE_DELAY_PATTERN = /<delay>\s*\d+\s*<\/delay>/gi;

function stripInlineDelayTags(value: string): string {
  return value.replace(INLINE_DELAY_PATTERN, "").trim();
}

type VibeToyRuntimeState = {
  intensityPercent?: number;
  mode?: string;
  batteryPercent?: number;
  supportedModes: string[];
  status: "simulated" | "live";
  lastUpdatedAt: string;
};

function toPercent(current: number | undefined, limit: number | undefined): string {
  if (typeof current !== "number" || typeof limit !== "number" || limit <= 0) {
    return "未提供";
  }
  return `${Math.round((current / limit) * 100)}%`;
}

function joinNonEmpty(parts: Array<string | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join("；");
}

class DefaultToolRegistry implements ToolRegistry {
  constructor(private readonly tools: ToolDefinition[]) {}

  get(toolId: string): ToolDefinition | undefined {
    return this.tools.find((tool) => tool.id === toolId);
  }

  list(toolStates?: Record<string, boolean>): Array<Pick<ToolDefinition, "id" | "description" | "visibility" | "promptContract">> {
    return this.tools
      .filter((tool) => isToolEnabled(tool.id, toolStates))
      .map(({ id, description, visibility, promptContract }) => ({
      id,
      description,
      visibility,
      promptContract
      }));
  }

  getWorldPromptContributions(
    context: Parameters<NonNullable<ToolDefinition["buildWorldPrompt"]>>[0],
    toolStates?: Record<string, boolean>
  ) {
    return this.tools
      .filter((tool) => isToolEnabled(tool.id, toolStates))
      .flatMap((tool) => {
      const prompt = tool.buildWorldPrompt?.(context)?.trim();
      if (!prompt) {
        return [];
      }
      return [{
        toolId: tool.id,
        prompt
      }];
    });
  }

  async getTurnPromptContributions(
    context: Parameters<NonNullable<ToolDefinition["buildTurnPrompt"]>>[0],
    toolStates?: Record<string, boolean>
  ) {
    const prompts = await Promise.all(
      this.tools
        .filter((tool) => isToolEnabled(tool.id, toolStates))
        .map(async (tool) => {
          const prompt = (await tool.buildTurnPrompt?.(context))?.trim();
          if (!prompt) {
            return null;
          }
          return {
            toolId: tool.id,
            prompt
          };
        })
    );
    return prompts.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }

  async execute(
    context: Parameters<ToolDefinition["execute"]>[0],
    toolId: string,
    args: unknown,
    toolStates?: Record<string, boolean>
  ) {
    const tool = this.get(toolId);
    if (!tool) {
      throw new HttpError(400, `Unknown tool: ${toolId}`);
    }
    if (!isToolEnabled(toolId, toolStates)) {
      throw new HttpError(400, `Tool is disabled: ${toolId}`);
    }
    const parsed = tool.inputSchema.parse(args);
    return tool.execute(context, parsed);
  }
}

export function createDefaultToolRegistry(): ToolRegistry {
  const vibeToyStateBySession = new Map<string, VibeToyRuntimeState>();
  const tools: ToolDefinition[] = [
    {
      id: "control_vibe_toy",
      description: "Control the player's wearable vibrating toy by setting intensity and/or switching vibration mode.",
      visibility: "public",
      inputSchema: z.object({
        intensityPercent: z.number().int().min(0).max(100).optional(),
        mode: z.string().min(1).optional()
      }).strict().refine((value) => value.intensityPercent !== undefined || value.mode !== undefined, {
        message: "Either intensityPercent or mode must be provided."
      }),
      promptContract: {
        argsShape: "{\"intensityPercent\":0-100,\"mode\":\"pulse|wave|tease|steady\"}",
        example: "{\"tool\":\"control_vibe_toy\",\"args\":{\"intensityPercent\":55,\"mode\":\"pulse\"}}"
      },
      buildWorldPrompt() {
        return [
          "在生成世界背景时，默认视为玩家“你”身上正隐蔽穿戴着一个可被远程控制的震动小玩具，且该装置已经启用，可以被剧情中的角色合理感知、提及或操控。",
          "如果剧情需要描述当前状态，请自然补充这个小玩具的存在、佩戴位置带来的心理压力或期待感，但保持非露骨、非直白描写。",
          "这个小玩具只是当前世界里的一个可调用元素，不应成为全部互动的唯一核心。请同时保留丰富的氛围塑造、角色博弈、环境变化、仪式感动作与其他非露骨的情境张力来源。",
          "后续角色可以调用 `control_vibe_toy` 工具调节强度或切换模式，所以请让世界背景为这种控制行为留下合理空间。",
          "当前可用的占位震动模式可以写成：`steady`（持续）、`pulse`（脉冲）、`wave`（波浪）、`tease`（挑逗式断续）。"
        ].join("\n");
      },
      buildTurnPrompt(context) {
        const state = vibeToyStateBySession.get(context.session.id);
        if (!state) {
          return null;
        }
        const parts = [
          `当前读取到穿戴式震动小玩具的运行时状态：强度 ${state.intensityPercent ?? "未提供"}${typeof state.intensityPercent === "number" ? "%" : ""}。`,
          `模式：${state.mode ?? "未提供"}。`,
          `电量：${state.batteryPercent ?? "未提供"}${typeof state.batteryPercent === "number" ? "%" : ""}。`,
          `状态来源：${state.status}。`,
          `可用模式：${state.supportedModes.join("、")}。`,
          "这是一份仅针对本轮推演的运行态参考；如果本轮只是调节强度、模式或电量认知，不要改动 `playerBodyItemState`。"
        ];
        return parts.join("\n");
      },
      async execute(context, args: { intensityPercent?: number; mode?: string }) {
        const previousState = vibeToyStateBySession.get(context.session.id);
        vibeToyStateBySession.set(context.session.id, {
          intensityPercent: args.intensityPercent ?? previousState?.intensityPercent,
          mode: args.mode ?? previousState?.mode,
          batteryPercent: previousState?.batteryPercent,
          supportedModes: ["steady", "pulse", "wave", "tease"],
          status: previousState?.status ?? "simulated",
          lastUpdatedAt: context.now
        });
        context.session.agentStates[context.agent.id] = {
          ...context.session.agentStates[context.agent.id],
          intent: "control_vibe_toy",
          lastActedAt: context.now
        };
        context.addEvent({
          type: "agent.device_control",
          source: "agent",
          agentId: context.agent.id,
          createdAt: context.now,
          payload: {
            speaker: context.agent.name,
            deviceId: "vibe_toy",
            deviceName: "穿戴式震动小玩具",
            action: "control_vibe_toy",
            intensityPercent: args.intensityPercent,
            mode: args.mode,
            supportedModes: ["steady", "pulse", "wave", "tease"],
            status: "simulated"
          }
        });
      }
    },
    {
      id: "control_e_stim_toy",
      description: "Control the player's local e-stim device by adjusting A/B channel strength percentages, switching pulse names, or triggering timed fire actions.",
      visibility: "public",
      inputSchema: z.discriminatedUnion("command", [
        z.object({
          command: z.literal("set"),
          channels: z.object({
            a: z.object({
              intensityPercent: z.number().int().min(0).max(100).optional(),
              pulseName: z.string().min(1).optional()
            }).strict().refine((value) => value.intensityPercent !== undefined || value.pulseName !== undefined, {
              message: "A channel requires intensityPercent or pulseName."
            }).optional(),
            b: z.object({
              intensityPercent: z.number().int().min(0).max(100).optional(),
              pulseName: z.string().min(1).optional()
            }).strict().refine((value) => value.intensityPercent !== undefined || value.pulseName !== undefined, {
              message: "B channel requires intensityPercent or pulseName."
            }).optional()
          }).strict().refine((value) => value.a !== undefined || value.b !== undefined, {
            message: "At least one channel must be provided."
          })
        }).strict(),
        z.object({
          command: z.literal("fire"),
          durationMs: z.number().int().min(100).max(30000),
          override: z.boolean().default(true),
          channels: z.object({
            a: z.object({
              enabled: z.boolean().optional(),
              intensityPercent: z.number().int().min(0).max(100).optional(),
              pulseName: z.string().min(1).optional()
            }).strict().refine((value) => value.enabled !== undefined || value.intensityPercent !== undefined || value.pulseName !== undefined, {
              message: "A channel fire config requires enabled, intensityPercent, or pulseName."
            }).optional(),
            b: z.object({
              enabled: z.boolean().optional(),
              intensityPercent: z.number().int().min(0).max(100).optional(),
              pulseName: z.string().min(1).optional()
            }).strict().refine((value) => value.enabled !== undefined || value.intensityPercent !== undefined || value.pulseName !== undefined, {
              message: "B channel fire config requires enabled, intensityPercent, or pulseName."
            }).optional()
          }).strict().refine((value) => value.a !== undefined || value.b !== undefined, {
            message: "At least one channel must be provided."
          })
        }).strict()
      ]),
      promptContract: {
        argsShape: "Either {\"command\":\"set\",\"channels\":{\"a\":{\"intensityPercent\":0-100,\"pulseName\":\"波形名\"},\"b\":{\"intensityPercent\":0-100,\"pulseName\":\"波形名\"}}} or {\"command\":\"fire\",\"durationMs\":100-30000,\"override\":true,\"channels\":{\"a\":{\"enabled\":true,\"intensityPercent\":0-100,\"pulseName\":\"波形名\"},\"b\":{\"enabled\":true,\"intensityPercent\":0-100,\"pulseName\":\"波形名\"}}}",
        example: "{\"tool\":\"control_e_stim_toy\",\"args\":{\"command\":\"set\",\"channels\":{\"a\":{\"intensityPercent\":15,\"pulseName\":\"呼吸\"}}}}",
        guidance: [
          "Only use wave names the runtime context explicitly says are allowed. If Channel B is disabled, do not send commands to Channel B.",
          "Treat `command:\"set\"` and `command:\"fire\"` differently. `set` is for sustained adjustment: keeping pressure steady, gradually increasing it, or changing wave shape as part of ongoing control.",
          "For `command:\"set\"`, send only `command` plus `channels`. Do not include `durationMs`, `override`, or channel-level `enabled`.",
          "For `command:\"fire\"`, `durationMs` is required, `override` is allowed, and channel-level `enabled` may be used.",
          "`command:\"fire\"` is a timed burst: it rapidly jumps to the requested strength, holds the requested wave for `durationMs`, and is better for sudden punishment, sharper control, interruption, forced compliance, or moments where you want the player to feel a more volatile and uncertain loss of control.",
          "Do not spam `fire`. Use it when the dramatic goal specifically calls for a short, decisive escalation or a punishing display of authority; otherwise prefer `set` for more measured pacing.",
          "You are free to adjust channels independently: you can target only Channel A, only Channel B, or both in the same call. For example, `{\"command\":\"set\",\"channels\":{\"a\":{\"intensityPercent\":20}}}` adjusts only Channel A. This flexibility lets you apply asymmetric pressure or control specific body zones independently."
        ]
      },
      buildWorldPrompt(context) {
        const eStim = context.toolContext?.eStim;
        const channelALocation = eStim?.channelPlacements.a?.trim() || "the player's preconfigured Channel A placement";
        const channelBEnabled = eStim?.bChannelEnabled ?? false;
        const channelBLocation = eStim?.channelPlacements.b?.trim() || "the player's preconfigured Channel B placement";
        return [
          "When generating the world background, assume the player already has an e-stim device attached and connected on their body, ready to be driven by the frontend's local interface. Do not describe it as not yet installed or not yet attached.",
          `Channel A output is already connected at: ${channelALocation}.`,
          channelBEnabled
            ? `Channel B output is already connected at: ${channelBLocation}.`
            : "Channel B is disabled by default. Do not describe it as an already active second channel.",
          "Reflect the device's already-installed state naturally inside `worldSummary`, `openingSituation`, `playerState`, and `initialPlayerBodyItemState`, so characters can reasonably sense, mention, or control it from the very beginning.",
          "If characters mention or use it, keep the language adult and restrained, focusing on control, anticipation, testing, and rhythm changes rather than explicit physiological description.",
          "Later, agents may call `control_e_stim_toy` to adjust Channel A / B intensity percentages independently, switch pulse names, or trigger a timed fire burst."
        ].join("\n");
      },
      buildTurnPrompt(context) {
        const eStim = context.session.toolContext?.eStim;
        if (!eStim) {
          return [
            "There is currently no e-stim device configuration or runtime state synced from the frontend.",
            "If `control_e_stim_toy` is called in this turn, the frontend may only show it as a simulated action instead of a real local execution."
          ].join("\n");
        }

        const allowedPulseNames = eStim.allowedPulses.map((item: { name: string }) => item.name).filter(Boolean);
        const channelALine = joinNonEmpty([
          "Channel A",
          eStim.channelPlacements.a ? `Placement: ${eStim.channelPlacements.a}` : undefined,
          eStim.runtime?.a ? `Current strength: ${eStim.runtime.a.strength}/${eStim.runtime.a.limit} (about ${toPercent(eStim.runtime.a.strength, eStim.runtime.a.limit)})` : "Current strength: not synced",
          eStim.runtime?.a?.currentPulseName ? `Current pulse: ${eStim.runtime.a.currentPulseName}` : undefined,
          eStim.runtime?.a?.fireStrengthLimit !== undefined ? `Fire strength cap: ${eStim.runtime.a.fireStrengthLimit}` : undefined
        ]);
        const channelBEnabled = eStim.bChannelEnabled;
        const channelBLine = !channelBEnabled
          ? "Channel B: currently disabled. Do not send commands to Channel B unless later configuration changes enable it."
          : joinNonEmpty([
            "Channel B",
            eStim.channelPlacements.b ? `Placement: ${eStim.channelPlacements.b}` : undefined,
            eStim.runtime?.b ? `Current strength: ${eStim.runtime.b.strength}/${eStim.runtime.b.limit} (about ${toPercent(eStim.runtime.b.strength, eStim.runtime.b.limit)})` : "Current strength: not synced",
            eStim.runtime?.b?.currentPulseName ? `Current pulse: ${eStim.runtime.b.currentPulseName}` : undefined,
            eStim.runtime?.b?.fireStrengthLimit !== undefined ? `Fire strength cap: ${eStim.runtime.b.fireStrengthLimit}` : undefined
          ]);

        return [
          "The frontend has synced an e-stim device configuration for this session. Real execution depends on the player's local frontend calling the localhost bridge.",
          `Allowed pulse names: ${allowedPulseNames.length > 0 ? allowedPulseNames.join(", ") : "none selected; avoid switching pulses unless necessary"}`,
          channelALine,
          channelBLine,
          "When calling `control_e_stim_toy`, use only the pulse name in `pulseName`. Do not output the underlying `pulseId`; the frontend will map names to real ids.",
          "`command: \"set\"` is for sustained intensity adjustments or normal pulse switching, letting pressure rise gradually, hold steady, or change with fine control.",
          "`command: \"fire\"` is a time-limited burst. Once triggered, it rapidly drives the target channel to the requested intensity, keeps the requested pulse for `durationMs`, and then ends the burst.",
          "Use `fire` for short escalations, abrupt interruption, explicit punishment, forced compliance, increased uncertainty, or stronger demonstrations of control when the player relaxes, hesitates, talks back, provokes, or resists.",
          "Do not treat `fire` as a routine action for every turn. Use it only when you need a more sudden, forceful, controlling, or punitive beat; otherwise prefer `set` for finer pacing.",
          "You can control channels independently: adjust only Channel A, only Channel B, or both in a single call. This allows fine-grained control and asymmetric pressure on different body zones. For example, you can set Channel A to one intensity while keeping Channel B unchanged, or fire only one channel at a time.",
          "If you are only adjusting e-stim intensity, pulse, or firing, do not modify `playerBodyItemState`."
        ].join("\n");
      },
      async execute(context, args: {
        command: "set" | "fire";
        durationMs?: number;
        override?: boolean;
        channels: {
          a?: { enabled?: boolean; intensityPercent?: number; pulseName?: string };
          b?: { enabled?: boolean; intensityPercent?: number; pulseName?: string };
        };
      }) {
        const eStim = context.session.toolContext?.eStim;
        context.session.agentStates[context.agent.id] = {
          ...context.session.agentStates[context.agent.id],
          intent: "control_e_stim_toy",
          lastActedAt: context.now
        };
        context.addEvent({
          type: "agent.device_control",
          source: "agent",
          agentId: context.agent.id,
          createdAt: context.now,
          payload: {
            speaker: context.agent.name,
            deviceId: "e_stim_toy",
            deviceName: "情趣电击器",
            action: "control_e_stim_toy",
            command: args.command,
            durationMs: args.command === "fire" ? args.durationMs : undefined,
            override: args.command === "fire" ? args.override : undefined,
            channels: args.channels,
            allowedPulseNames: eStim?.allowedPulses.map((item: { name: string }) => item.name) ?? [],
            channelPlacements: eStim?.channelPlacements ?? {},
            bChannelEnabled: eStim?.bChannelEnabled ?? false,
            status: "frontend_pending"
          }
        });
      }
    },
    {
      id: "speak_to_player",
      description: "Deliver a line of dialogue from an agent to the player.",
      visibility: "public",
      inputSchema: z.object({
        message: z.string().min(1)
      }).strict(),
      promptContract: {
        argsShape: "{\"message\":\"...\"}",
        example: "{\"tool\":\"speak_to_player\",\"args\":{\"message\":\"把视线抬起来，看着我。\"}}"
      },
      async execute(context, args: { message: string }) {
        context.session.agentStates[context.agent.id] = {
          ...context.session.agentStates[context.agent.id],
          intent: "speak_to_player",
          lastActedAt: context.now
        };
        context.addEvent({
          type: "agent.speak_player",
          source: "agent",
          agentId: context.agent.id,
          createdAt: context.now,
          payload: {
            speaker: context.agent.name,
            message: args.message
          }
        });
      }
    },
    {
      id: "speak_to_agent",
      description: "Send a line from one agent to another agent.",
      visibility: "public",
      inputSchema: z.object({
        targetAgentId: z.string().min(1),
        message: z.string().min(1)
      }).strict(),
      promptContract: {
        argsShape: "{\"targetAgentId\":\"...\",\"message\":\"...\"}",
        example: "{\"tool\":\"speak_to_agent\",\"args\":{\"targetAgentId\":\"support_1\",\"message\":\"把灯光调暗一点，别让这份气氛断掉。\"}}"
      },
      async execute(context, args: { targetAgentId: string; message: string }) {
        context.addEvent({
          type: "agent.speak_agent",
          source: "agent",
          agentId: context.agent.id,
          createdAt: context.now,
          payload: {
            speaker: context.agent.name,
            targetAgentId: args.targetAgentId,
            message: args.message
          }
        });
      }
    },
    {
      id: "emit_reasoning_summary",
      description: "Publish a visible reasoning summary suitable for the player UI.",
      visibility: "public",
      inputSchema: z.object({
        summary: z.string().min(1)
      }).strict(),
      promptContract: {
        argsShape: "{\"summary\":\"...\"}",
        example: "{\"tool\":\"emit_reasoning_summary\",\"args\":{\"summary\":\"我先放缓语气，让暧昧感慢慢升起来，再在你想躲开时轻轻追近一步。\"}}"
      },
      async execute(context, args: { summary: string }) {
        context.session.agentStates[context.agent.id] = {
          ...context.session.agentStates[context.agent.id],
          intent: "reasoning",
          lastActedAt: context.now
        };
        context.addEvent({
          type: "agent.reasoning",
          source: "agent",
          agentId: context.agent.id,
          createdAt: context.now,
          payload: {
            speaker: context.agent.name,
            summary: args.summary
          }
        });
      }
    },
    {
      id: "perform_stage_direction",
      description: "Emit a visible, player-facing stage direction or gesture in immersive second-person narration.",
      visibility: "public",
      inputSchema: z.object({
        direction: z.string().min(1)
      }).strict(),
      promptContract: {
        argsShape: "{\"direction\":\"...\"}",
        example: "{\"tool\":\"perform_stage_direction\",\"args\":{\"direction\":\"你看见他慢条斯理地把酒杯推到你手边，指尖停在杯沿旁，迟迟没有收回。\"}}"
      },
      async execute(context, args: { direction: string }) {
        context.addEvent({
          type: "agent.stage_direction",
          source: "agent",
          agentId: context.agent.id,
          createdAt: context.now,
          payload: {
            speaker: context.agent.name,
            direction: args.direction
          }
        });
      }
    },
    {
      id: "wait",
      description: "Insert a short visible pause before later actions in the same displayed turn.",
      visibility: "system",
      inputSchema: z.object({
        delayMs: z.number().int().min(200).max(60000),
        reason: z.string().min(1)
      }).strict(),
      promptContract: {
        argsShape: "{\"delayMs\":1000,\"reason\":\"...\"}",
        example: "{\"tool\":\"wait\",\"args\":{\"delayMs\":1200,\"reason\":\"停顿一秒，让刚才那句暧昧的话慢慢发酵。\"}}"
      },
      async execute(context, args: { delayMs: number; reason: string }) {
        context.addEvent({
          type: "system.wait_scheduled",
          source: "system",
          agentId: context.agent.id,
          createdAt: context.now,
          payload: {
            waitId: createId("wait"),
            delayMs: args.delayMs,
            reason: args.reason,
            speaker: context.agent.name,
            mode: "in_turn_pause"
          }
        });
      }
    },
    {
      id: "apply_story_effect",
      description: "Apply a visible narrative effect label to the scene with immersive second-person description.",
      visibility: "public",
      inputSchema: z.object({
        label: z.string().min(1),
        description: z.string().min(1),
        intensity: z.number().min(0).max(10).default(5)
      }).strict(),
      promptContract: {
        argsShape: "{\"label\":\"...\",\"description\":\"...\",\"intensity\":5}",
        example: "{\"tool\":\"apply_story_effect\",\"args\":{\"label\":\"暧昧升温\",\"description\":\"你感觉空气里的温度像被悄悄抬高了一点，连目光相接都开始带上余韵。\",\"intensity\":6}}"
      },
      async execute(context, args: { label: string; description: string; intensity: number }) {
        context.session.storyState.tension = Math.max(
          0,
          Math.min(10, Math.round((context.session.storyState.tension + args.intensity / 2) * 10) / 10)
        );
        context.addEvent({
          type: "agent.story_effect",
          source: "agent",
          agentId: context.agent.id,
          createdAt: context.now,
          payload: {
            speaker: context.agent.name,
            label: args.label,
            description: args.description,
            intensity: args.intensity
          }
        });
      }
    },
    {
      id: "update_scene_state",
      description: "Update the shared scene state for future turns, with a player-facing summary plus optional hidden memory hints for long-context continuity.",
      visibility: "system",
      inputSchema: z.object({
        location: z.string().optional(),
        phase: z.string().optional(),
        tension: z.preprocess((value) => {
          if (typeof value !== "number") {
            return value;
          }
          return clampTension(value);
        }, z.number().min(0).max(10)).optional(),
        summary: z.string().optional(),
        activeObjectives: z.array(z.string()).optional(),
        memorySummary: z.string().optional(),
        memoryKeyDevelopments: z.array(z.string()).max(6).optional(),
        memoryCharacterStates: z.array(z.string()).max(6).optional()
      }).strict(),
      promptContract: {
        argsShape: "{\"location\":\"...\",\"phase\":\"...\",\"tension\":4,\"summary\":\"...\",\"activeObjectives\":[\"...\"],\"memorySummary\":\"...\",\"memoryKeyDevelopments\":[\"...\"],\"memoryCharacterStates\":[\"...\"]}",
        example: "{\"tool\":\"update_scene_state\",\"args\":{\"location\":\"会客室\",\"phase\":\"teasing\",\"tension\":7,\"summary\":\"你已经被他不紧不慢的靠近和语气牵住心神，整场对话悄悄滑进暧昧的节奏里。\",\"activeObjectives\":[\"让你继续停留在这场对话里\",\"引出你更真实的回应\"],\"memorySummary\":\"角色通过靠近、言语试探与节奏控制，逐步把场面推入更明确的暧昧与掌控。\",\"memoryKeyDevelopments\":[\"角色用靠近与停顿制造压力\",\"角色引导玩家暴露更真实的回应\"],\"memoryCharacterStates\":[\"角色维持从容主导\",\"角色在试探玩家会如何继续配合\"]}}"
      },
      async execute(context, args: {
        location?: string;
        phase?: string;
        tension?: number;
        summary?: string;
        activeObjectives?: string[];
        memorySummary?: string;
        memoryKeyDevelopments?: string[];
        memoryCharacterStates?: string[];
      }) {
        const sanitizedArgs = args.summary
          ? {
              ...args,
              summary: stripInlineDelayTags(args.summary)
            }
          : args;
        context.session.storyState = {
          ...context.session.storyState,
          ...(sanitizedArgs.location ? { location: sanitizedArgs.location } : {}),
          ...(sanitizedArgs.phase ? { phase: sanitizedArgs.phase } : {}),
          ...(sanitizedArgs.tension !== undefined ? { tension: sanitizedArgs.tension } : {}),
          ...(sanitizedArgs.summary ? { summary: sanitizedArgs.summary } : {}),
          ...(sanitizedArgs.activeObjectives ? { activeObjectives: sanitizedArgs.activeObjectives } : {})
        };
        context.addEvent({
          type: "scene.updated",
          source: "system",
          agentId: context.agent.id,
          createdAt: context.now,
          payload: sanitizedArgs
        });
      }
    },
    {
      id: "end_story",
      description: "Mark the story as complete with a resolution summary.",
      visibility: "system",
      inputSchema: z.object({
        summary: z.string().min(1),
        resolution: z.string().min(1)
      }).strict(),
      promptContract: {
        argsShape: "{\"summary\":\"...\",\"resolution\":\"...\"}",
        example: "{\"tool\":\"end_story\",\"args\":{\"summary\":\"你终于顺着这场暧昧的牵引，把最后一点迟疑也慢慢放了下来。\",\"resolution\":\"夜色和呼吸一起放缓，故事停在情绪仍未散尽的余韵里。\"}}"
      },
      async execute(context, args: { summary: string; resolution: string }) {
        context.session.status = "ended";
        context.session.storyState = {
          ...context.session.storyState,
          phase: "ending",
          summary: args.summary
        };
        context.addEvent({
          type: "system.story_ended",
          source: "system",
          agentId: context.agent.id,
          createdAt: context.now,
          payload: args
        });
        return {
          stopProcessing: true
        };
      }
    }
  ];
  return new DefaultToolRegistry(tools);
}
