import { z } from "zod";
import type { ToolDefinition, ToolRegistry } from "../types/contracts.js";
import { HttpError } from "../lib/errors.js";
import { createId } from "../lib/ids.js";

class DefaultToolRegistry implements ToolRegistry {
  constructor(private readonly tools: ToolDefinition[]) {}

  get(toolId: string): ToolDefinition | undefined {
    return this.tools.find((tool) => tool.id === toolId);
  }

  list(): Array<Pick<ToolDefinition, "id" | "description" | "visibility" | "promptContract">> {
    return this.tools.map(({ id, description, visibility, promptContract }) => ({
      id,
      description,
      visibility,
      promptContract
    }));
  }

  async execute(context: Parameters<ToolDefinition["execute"]>[0], toolId: string, args: unknown) {
    const tool = this.get(toolId);
    if (!tool) {
      throw new HttpError(400, `Unknown tool: ${toolId}`);
    }
    const parsed = tool.inputSchema.parse(args);
    return tool.execute(context, parsed);
  }
}

export function createDefaultToolRegistry(): ToolRegistry {
  const tools: ToolDefinition[] = [
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
        example: "{\"tool\":\"speak_to_agent\",\"args\":{\"targetAgentId\":\"support_1\",\"message\":\"把门关上，不要给她退路。\"}}"
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
        example: "{\"tool\":\"emit_reasoning_summary\",\"args\":{\"summary\":\"我先维持沉默压迫，再在她试图辩解时收紧节奏。\"}}"
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
      description: "Emit a visible, non-physical story direction or gesture.",
      visibility: "public",
      inputSchema: z.object({
        direction: z.string().min(1)
      }).strict(),
      promptContract: {
        argsShape: "{\"direction\":\"...\"}",
        example: "{\"tool\":\"perform_stage_direction\",\"args\":{\"direction\":\"他把椅背缓慢拉近，金属腿在地面上拖出刺耳的摩擦声。\"}}"
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
      description: "Schedule this agent to rejoin after a short delay.",
      visibility: "system",
      inputSchema: z.object({
        delayMs: z.number().int().min(200).max(60000),
        reason: z.string().min(1)
      }).strict(),
      promptContract: {
        argsShape: "{\"delayMs\":1000,\"reason\":\"...\"}",
        example: "{\"tool\":\"wait\",\"args\":{\"delayMs\":1200,\"reason\":\"停顿一秒，让刚才的话产生压迫感。\"}}"
      },
      async execute(context, args: { delayMs: number; reason: string }) {
        const handle = {
          id: createId("wait"),
          agentId: context.agent.id,
          runAt: new Date(Date.parse(context.now) + args.delayMs).toISOString(),
          reason: args.reason
        };
        context.session.timerState.pendingWaits.push(handle);
        context.addEvent({
          type: "system.wait_scheduled",
          source: "system",
          agentId: context.agent.id,
          createdAt: context.now,
          payload: {
            waitId: handle.id,
            delayMs: args.delayMs,
            reason: args.reason
          }
        });
      }
    },
    {
      id: "apply_story_effect",
      description: "Apply a visible narrative effect label to the scene.",
      visibility: "public",
      inputSchema: z.object({
        label: z.string().min(1),
        description: z.string().min(1),
        intensity: z.number().min(0).max(10).default(5)
      }).strict(),
      promptContract: {
        argsShape: "{\"label\":\"...\",\"description\":\"...\",\"intensity\":5}",
        example: "{\"tool\":\"apply_story_effect\",\"args\":{\"label\":\"压迫感升级\",\"description\":\"房间里的空气像被无形地收紧了一层。\",\"intensity\":6}}"
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
      description: "Update the shared scene state for future turns.",
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
        example: "{\"tool\":\"update_scene_state\",\"args\":{\"location\":\"审讯室\",\"phase\":\"pressure\",\"tension\":7,\"summary\":\"主导者已经彻底掌控谈话节奏。\",\"activeObjectives\":[\"逼玩家给出解释\",\"阻断玩家转移话题\"]}}"
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
        example: "{\"tool\":\"end_story\",\"args\":{\"summary\":\"玩家最终接受了既定结局。\",\"resolution\":\"控制方锁定了局势，故事进入收束。\"}}"
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
