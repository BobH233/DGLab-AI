import { z } from "zod";
import { isToolEnabled } from "@dglab-ai/shared";
import type { ToolDefinition, ToolRegistry } from "../types/contracts.js";
import { HttpError } from "../lib/errors.js";
import { createId } from "../lib/ids.js";

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
      async execute(context, args: { intensityPercent?: number; mode?: string }) {
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
      description: "Update the shared scene state for future turns, keeping any summary player-facing and second-person.",
      visibility: "system",
      inputSchema: z.object({
        location: z.string().optional(),
        phase: z.string().optional(),
        tension: z.number().min(0).max(10).optional(),
        summary: z.string().optional(),
        activeObjectives: z.array(z.string()).optional()
      }).strict(),
      promptContract: {
        argsShape: "{\"location\":\"...\",\"phase\":\"...\",\"tension\":4,\"summary\":\"...\",\"activeObjectives\":[\"...\"]}",
        example: "{\"tool\":\"update_scene_state\",\"args\":{\"location\":\"会客室\",\"phase\":\"teasing\",\"tension\":7,\"summary\":\"你已经被他不紧不慢的靠近和语气牵住心神，整场对话悄悄滑进暧昧的节奏里。\",\"activeObjectives\":[\"让你继续停留在这场对话里\",\"引出你更真实的回应\"]}}"
      },
      async execute(context, args: {
        location?: string;
        phase?: string;
        tension?: number;
        summary?: string;
        activeObjectives?: string[];
      }) {
        context.session.storyState = {
          ...context.session.storyState,
          ...(args.location ? { location: args.location } : {}),
          ...(args.phase ? { phase: args.phase } : {}),
          ...(args.tension !== undefined ? { tension: args.tension } : {}),
          ...(args.summary ? { summary: args.summary } : {}),
          ...(args.activeObjectives ? { activeObjectives: args.activeObjectives } : {})
        };
        context.addEvent({
          type: "scene.updated",
          source: "system",
          agentId: context.agent.id,
          createdAt: context.now,
          payload: args
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
