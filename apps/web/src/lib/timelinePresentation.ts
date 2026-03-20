import { isToolRequired, type AgentProfile, type SessionEvent } from "@dglab-ai/shared";
import { formatInlineDelayMs, splitInlineDelays, stripInlineDelays } from "./inlineDelays";

export type PresentationDetail = {
  label: string;
  value: string;
};

export type PresentationDiffLine = {
  prefix: "+" | "-";
  value: string;
};

export type PresentationItem = {
  id: string;
  seq: number;
  kind: "player" | "dialogue" | "thought" | "action" | "system" | "effect" | "error" | "pause" | "inventory";
  variant?: "e-stim-control";
  kicker: string;
  title: string;
  main: string;
  details?: PresentationDetail[];
  diffLines?: PresentationDiffLine[];
  meta?: string;
  tags: string[];
  createdAt: string;
  timeLabel: string;
  optionalTool?: boolean;
  compact?: boolean;
  pauseId?: string;
};

export type DeviceExecutionState = {
  status: "pending" | "success" | "simulated" | "error";
  detail: string;
};

export function executionKeyForEvent(event: SessionEvent): string {
  return `${event.seq}:${event.type}:${event.createdAt}`;
}

export function buildTimelinePresentationItems(
  events: SessionEvent[],
  deviceExecutionStates: Record<string, DeviceExecutionState> = {},
  agents: AgentProfile[] = []
): PresentationItem[] {
  const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
  return events.reduce<PresentationItem[]>((items, event, index) => {
    const itemId = `${event.seq}:${index}:${event.type}`;
    const isLatestEvent = index === events.length - 1;
    switch (event.type) {
      case "player.body_item_state_updated":
        items.push(buildPlayerBodyItemStateItem(event, itemId));
        return items;
      case "player.message":
        items.push(...expandInlineDelayItems(event, itemId, buildPlayerMessageItem));
        return items;
      case "agent.speak_player":
        items.push(...expandInlineDelayItems(event, itemId, buildAgentSpeakPlayerItem));
        return items;
      case "agent.device_control":
        const optionalTool = isOptionalToolEvent(event);
        if (event.payload.action === "control_e_stim_toy") {
          items.push(buildEStimControlItem(event, itemId, optionalTool, deviceExecutionStates[executionKeyForEvent(event)]));
          return items;
        }
        items.push({
          id: itemId,
          seq: event.seq,
          kind: "action",
          kicker: "设备控制",
          title: `${textOf(event.payload.speaker)} 调用了 ${textOf(event.payload.deviceName || event.payload.deviceId || "设备")}`,
          main: buildDeviceControlText(event.payload),
          meta: buildDeviceControlMeta(event.payload),
          tags: optionalTool
            ? ["可选工具", "工具调用", textOf(event.payload.status, "simulated")]
            : ["工具调用", textOf(event.payload.status, "simulated")],
          createdAt: event.createdAt,
          timeLabel: formatTime(event.createdAt),
          optionalTool
        });
        return items;
      case "agent.speak_agent":
        items.push(...expandInlineDelayItems(event, itemId, (nextEvent, nextItemId) => buildAgentSpeakAgentItem(nextEvent, nextItemId, agentMap)));
        return items;
      case "agent.reasoning":
        items.push(...expandInlineDelayItems(event, itemId, buildReasoningItem));
        return items;
      case "agent.stage_direction":
        items.push(...expandInlineDelayItems(event, itemId, buildStageDirectionItem));
        return items;
      case "agent.story_effect":
        items.push(...expandInlineDelayItems(event, itemId, buildStoryEffectItem));
        return items;
      case "scene.updated":
        items.push({
          id: itemId,
          seq: event.seq,
          kind: "system",
          kicker: "场景状态",
          title: "场景已更新",
          main: "",
          details: buildSceneUpdateDetails(event.payload),
          tags: ["系统"],
          createdAt: event.createdAt,
          timeLabel: formatTime(event.createdAt)
        });
        return items;
      case "system.tick_started":
        items.push({
          id: itemId,
          seq: event.seq,
          kind: "system",
          kicker: "系统",
          title: "推演开始",
          main: "",
          meta: event.payload.reason ? `原因：${textOf(event.payload.reason)}` : undefined,
          tags: [],
          createdAt: event.createdAt,
          timeLabel: formatTime(event.createdAt),
          compact: true
        });
        return items;
      case "system.tick_completed":
        items.push({
          id: itemId,
          seq: event.seq,
          kind: "system",
          kicker: "系统",
          title: "推演完成",
          main: "",
          meta: event.payload.status ? `状态：${textOf(event.payload.status)}` : undefined,
          tags: [],
          createdAt: event.createdAt,
          timeLabel: formatTime(event.createdAt),
          compact: true
        });
        return items;
      case "system.tick_failed":
        items.push(
          isLatestEvent
            ? {
              id: itemId,
              seq: event.seq,
              kind: "error",
              kicker: "系统异常",
              title: "本轮推进失败",
              main: textOf(event.payload.message) || "模型调用失败，当前轮次未能完成。",
              meta: event.payload.reason ? `触发原因：${textOf(event.payload.reason)}` : undefined,
              tags: textOf(event.payload.retryable) === "true" ? ["可重试"] : ["异常"],
              createdAt: event.createdAt,
              timeLabel: formatTime(event.createdAt)
            }
            : {
              id: itemId,
              seq: event.seq,
              kind: "error",
              kicker: "系统",
              title: "推进失败",
              main: "",
              meta: event.payload.reason ? `原因：${textOf(event.payload.reason)}` : "系统记录了一次推进失败。",
              tags: [],
              createdAt: event.createdAt,
              timeLabel: formatTime(event.createdAt),
              compact: true
            }
        );
        return items;
      case "system.timer_updated":
        items.push({
          id: itemId,
          seq: event.seq,
          kind: "system",
          kicker: "自动推进",
          title: textOf(event.payload.enabled) === "true" ? "自动推进已开启" : "自动推进已关闭",
          main: event.payload.intervalMs ? `当前触发间隔为 ${textOf(event.payload.intervalMs)} ms。` : "定时配置已更新。",
          tags: ["定时器"],
          createdAt: event.createdAt,
          timeLabel: formatTime(event.createdAt)
        });
        return items;
      case "system.wait_scheduled":
        items.push(buildPauseItem(event, itemId));
        return items;
      case "system.story_ended":
        items.push({
          id: itemId,
          seq: event.seq,
          kind: "effect",
          kicker: "结局",
          title: "故事已收束",
          main: textOf(event.payload.summary),
          meta: event.payload.resolution ? `结局说明：${textOf(event.payload.resolution)}` : undefined,
          tags: ["结束"],
          createdAt: event.createdAt,
          timeLabel: formatTime(event.createdAt)
        });
        return items;
      case "system.usage_recorded":
        items.push({
          id: itemId,
          seq: event.seq,
          kind: "system",
          kicker: "用量",
          title: event.payload.totalTokens ? `${textOf(event.payload.totalTokens)} tokens` : "Token 统计已更新",
          main: "",
          meta: event.payload.model ? textOf(event.payload.model) : undefined,
          tags: [],
          createdAt: event.createdAt,
          timeLabel: formatTime(event.createdAt),
          compact: true
        });
        return items;
      case "session.created":
        items.push({
          id: itemId,
          seq: event.seq,
          kind: "system",
          kicker: "会话",
          title: "会话已创建",
          main: textOf(event.payload.title ?? "新的故事会话已建立。"),
          tags: ["系统"],
          createdAt: event.createdAt,
          timeLabel: formatTime(event.createdAt)
        });
        return items;
      case "draft.generated":
        items.push({
          id: itemId,
          seq: event.seq,
          kind: "system",
          kicker: "草案",
          title: "设定草案已生成",
          main: "系统已完成背景和角色补全，请在确认页检查细节。",
          tags: ["系统"],
          createdAt: event.createdAt,
          timeLabel: formatTime(event.createdAt)
        });
        return items;
      case "draft.updated":
        items.push({
          id: itemId,
          seq: event.seq,
          kind: "system",
          kicker: "草案",
          title: "设定草案已修改",
          main: "你对世界观或角色设定做了更新。",
          tags: ["系统"],
          createdAt: event.createdAt,
          timeLabel: formatTime(event.createdAt)
        });
        return items;
      case "session.confirmed":
        items.push({
          id: itemId,
          seq: event.seq,
          kind: "system",
          kicker: "会话",
          title: "故事正式开始",
          main: "设定已确认，系统将按当前背景持续推进剧情。",
          tags: ["系统"],
          createdAt: event.createdAt,
          timeLabel: formatTime(event.createdAt)
        });
        return items;
      default:
        items.push({
          id: itemId,
          seq: event.seq,
          kind: "system",
          kicker: "系统",
          title: event.type,
          main: "系统记录了一条内部事件。",
          tags: ["系统"],
          createdAt: event.createdAt,
          timeLabel: formatTime(event.createdAt)
        });
        return items;
    }
  }, []);
}

function textOf(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) {
    return fallback;
  }
  const normalized = stripInlineDelays(String(value));
  return normalized.trim() || fallback;
}

function isOptionalToolEvent(event: SessionEvent): boolean {
  const toolId = typeof event.payload.action === "string" ? event.payload.action : "";
  return Boolean(toolId) && !isToolRequired(toolId);
}

function buildSceneUpdateDetails(payload: Record<string, unknown>): PresentationDetail[] {
  const details: PresentationDetail[] = [];
  if (payload.phase) {
    details.push({
      label: "阶段",
      value: textOf(payload.phase)
    });
  }
  if (payload.location) {
    details.push({
      label: "地点",
      value: textOf(payload.location)
    });
  }
  if (payload.tension !== undefined && payload.tension !== null && textOf(payload.tension)) {
    details.push({
      label: "张力",
      value: textOf(payload.tension)
    });
  }
  if (payload.summary) {
    details.push({
      label: "概要",
      value: textOf(payload.summary)
    });
  }
  if (Array.isArray(payload.activeObjectives) && payload.activeObjectives.length > 0) {
    for (const objective of payload.activeObjectives) {
      const text = textOf(objective);
      if (!text) {
        continue;
      }
      details.push({
        label: "目标",
        value: text
      });
    }
  }
  if (details.length === 0) {
    details.push({
      label: "状态",
      value: "场景状态已同步更新"
    });
  }
  return details;
}

function buildPlayerBodyItemStateItem(event: SessionEvent, itemId: string): PresentationItem {
  const nextItems = listOf(event.payload.playerBodyItemState);
  const previousItems = listOf(event.payload.previousPlayerBodyItemState);
  const added = nextItems.filter((item) => !previousItems.includes(item));
  const removed = previousItems.filter((item) => !nextItems.includes(item));
  const diffLines: PresentationDiffLine[] = [
    ...added.map((value): PresentationDiffLine => ({ prefix: "+", value })),
    ...removed.map((value): PresentationDiffLine => ({ prefix: "-", value }))
  ];
  const details = nextItems.length > 0
    ? nextItems.map((value) => ({
      label: "当前",
      value
    }))
    : [{
      label: "当前",
      value: "玩家当前身上没有记录中的物理道具"
    }];
  return {
    id: itemId,
    seq: event.seq,
    kind: "inventory",
    kicker: "身体道具",
    title: "玩家身体道具状态已更新",
    main: "",
    details,
    diffLines,
    meta: diffLines.length === 0 ? "本次同步未检测到增删变化。" : undefined,
    tags: ["可见状态"],
    createdAt: event.createdAt,
    timeLabel: formatTime(event.createdAt)
  };
}

function buildDeviceControlText(payload: Record<string, unknown>): string {
  const changes: string[] = [];
  if (payload.intensityPercent !== undefined) {
    changes.push(`强度调整为 ${textOf(payload.intensityPercent)}%`);
  }
  if (payload.mode !== undefined) {
    changes.push(`模式切换为 ${textOf(payload.mode)}`);
  }
  return changes.join("；") || "设备控制请求已发送。";
}

function buildDeviceControlMeta(payload: Record<string, unknown>): string | undefined {
  const entries: string[] = [];
  if (Array.isArray(payload.supportedModes) && payload.supportedModes.length > 0) {
    entries.push(`支持模式：${payload.supportedModes.map((mode) => textOf(mode)).join(" / ")}`);
  }
  if (payload.status !== undefined) {
    entries.push(`执行状态：${textOf(payload.status)}`);
  }
  return entries.length > 0 ? entries.join("；") : undefined;
}

function buildEStimControlItem(
  event: SessionEvent,
  itemId: string,
  optionalTool: boolean,
  executionState?: DeviceExecutionState
): PresentationItem {
  const payload = event.payload;
  const command = textOf(payload.command);
  const channels = typeof payload.channels === "object" && payload.channels
    ? payload.channels as Record<string, Record<string, unknown> | undefined>
    : {};
  const placements = typeof payload.channelPlacements === "object" && payload.channelPlacements
    ? payload.channelPlacements as Record<string, unknown>
    : {};
  const detailRows: PresentationDetail[] = [{
    label: "命令",
    value: command === "fire" ? "一键开火" : "通道设置"
  }];
  const channelLines = ["a", "b"].flatMap((channelId) => {
    const channel = channels[channelId];
    if (!channel) {
      return [];
    }
    const parts = [
      typeof channel.enabled === "boolean" ? `启用：${channel.enabled ? "是" : "否"}` : undefined,
      channel.intensityPercent !== undefined ? `强度 ${textOf(channel.intensityPercent)}%` : undefined,
      channel.pulseName ? `波形 ${textOf(channel.pulseName)}` : undefined,
      placements[channelId] ? `位置 ${textOf(placements[channelId])}` : undefined
    ].filter(Boolean);
    return [{
      label: `${channelId.toUpperCase()} 通道`,
      value: parts.join("；") || "本次未提供具体参数"
    }];
  });
  detailRows.push(...channelLines);
  if (payload.durationMs !== undefined && payload.durationMs !== null) {
    detailRows.push({
      label: "持续时间",
      value: `${textOf(payload.durationMs)} ms`
    });
  }
  detailRows.push({
    label: "本地执行",
    value: executionState
      ? executionState.status === "success"
        ? "已调用本地 API"
        : executionState.status === "simulated"
          ? "模拟执行"
          : executionState.status === "error"
            ? "执行失败"
            : "等待执行"
      : textOf(payload.status, "等待前端执行")
  });
  if (executionState?.detail) {
    detailRows.push({
      label: "执行说明",
      value: executionState.detail
    });
  }

  const allowedPulseNames = Array.isArray(payload.allowedPulseNames)
    ? payload.allowedPulseNames.map((item) => textOf(item)).filter(Boolean)
    : [];

  return {
    id: itemId,
    seq: event.seq,
    kind: "action",
    variant: "e-stim-control",
    kicker: "电击器控制",
    title: `${textOf(payload.speaker)} 调用了 ${textOf(payload.deviceName || "情趣电击器")}`,
    main: command === "fire"
      ? "角色触发了一次带持续时间的一键开火。"
      : "角色调整了电击器的通道强度或波形。",
    details: detailRows,
    meta: joinText([
      allowedPulseNames.length > 0 ? `允许波形：${allowedPulseNames.join(" / ")}` : undefined,
      payload.override !== undefined ? `覆盖模式：${textOf(payload.override)}` : undefined
    ]),
    tags: optionalTool
      ? ["可选工具", "工具调用", "电击器"]
      : ["工具调用", "电击器"],
    createdAt: event.createdAt,
    timeLabel: formatTime(event.createdAt),
    optionalTool
  };
}

function listOf(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => textOf(item)).filter(Boolean);
}

function buildPauseItem(event: SessionEvent, itemId: string): PresentationItem {
  const pauseId = typeof event.payload.uiPauseId === "string" && event.payload.uiPauseId.trim()
    ? event.payload.uiPauseId
    : `pause:${event.seq}:${event.createdAt}`;
  const reason = textOf(event.payload.reason);
  const explicitMeta = textOf(event.payload.meta);
  const delayMs = typeof event.payload.delayMs === "number" && Number.isFinite(event.payload.delayMs)
    ? event.payload.delayMs
    : undefined;
  return {
    id: itemId,
    seq: event.seq,
    kind: "pause",
    kicker: "节奏控制",
    title: textOf(event.payload.title) || `${textOf(event.payload.speaker, "对方")} 停了一下`,
    main: delayMs !== undefined ? `约 ${formatInlineDelayMs(delayMs)} 后继续` : "",
    meta: explicitMeta || (reason ? `原因：${reason}` : undefined),
    tags: [],
    createdAt: event.createdAt,
    timeLabel: formatTime(event.createdAt),
    compact: true,
    pauseId
  };
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function joinText(parts: Array<string | undefined>): string | undefined {
  const normalized = parts.filter((part): part is string => Boolean(part && part.trim()));
  return normalized.length > 0 ? normalized.join("；") : undefined;
}

function expandInlineDelayItems(
  event: SessionEvent,
  itemId: string,
  buildTextItem: (event: SessionEvent, itemId: string) => PresentationItem
): PresentationItem[] {
  const field = inlineDelayFieldForEvent(event);
  if (!field) {
    return [buildTextItem(event, itemId)];
  }

  const rawValue = event.payload[field];
  if (typeof rawValue !== "string" || !rawValue.includes("<delay>")) {
    return [buildTextItem(event, itemId)];
  }

  const parts = splitInlineDelays(rawValue);
  const items: PresentationItem[] = [];
  let textIndex = 0;
  let delayIndex = 0;

  for (const part of parts) {
    if (part.type === "delay") {
      items.push(buildInlineDelayPauseItem(event, `${itemId}:delay:${delayIndex}`, part.delayMs, delayIndex));
      delayIndex += 1;
      continue;
    }

    const text = part.text.trim();
    if (!text) {
      continue;
    }

    items.push(buildTextItem({
      ...event,
      payload: {
        ...event.payload,
        [field]: text
      }
    }, `${itemId}:text:${textIndex}`));
    textIndex += 1;
  }

  return items.length > 0
    ? items
    : [buildTextItem({
      ...event,
      payload: {
        ...event.payload,
        [field]: stripInlineDelays(rawValue).trim()
      }
    }, itemId)];
}

function inlineDelayFieldForEvent(event: SessionEvent): string | null {
  switch (event.type) {
    case "player.message":
      return "text";
    case "agent.speak_player":
    case "agent.speak_agent":
      return "message";
    case "agent.reasoning":
      return "summary";
    case "agent.stage_direction":
      return "direction";
    case "agent.story_effect":
      return "description";
    default:
      return null;
  }
}

function inlineDelayMetaForEvent(event: SessionEvent): string {
  switch (event.type) {
    case "player.message":
      return "玩家输入停顿";
    case "agent.speak_player":
      return "文本内节奏停顿";
    case "agent.speak_agent":
      return "角色间对白停顿";
    case "agent.stage_direction":
      return "舞台节奏停顿";
    case "agent.story_effect":
      return "剧情效果停顿";
    case "agent.reasoning":
      return "意图节奏停顿";
    default:
      return "文本内节奏停顿";
  }
}

function buildInlineDelayPauseItem(
  event: SessionEvent,
  itemId: string,
  delayMs: number,
  delayIndex: number
): PresentationItem {
  return buildPauseItem({
    sessionId: event.sessionId,
    seq: event.seq,
    type: "system.wait_scheduled",
    source: "system",
    agentId: event.agentId,
    createdAt: event.createdAt,
    payload: {
      speaker: event.payload.speaker,
      title: `约 ${formatInlineDelayMs(delayMs)} 后继续`,
      meta: inlineDelayMetaForEvent(event),
      delayMs,
      mode: "inline_pause",
      uiPauseId: `inline:${event.seq}:${event.createdAt}:${delayIndex}`
    }
  }, itemId);
}

function buildPlayerMessageItem(event: SessionEvent, itemId: string): PresentationItem {
  return {
    id: itemId,
    seq: event.seq,
    kind: "player",
    kicker: "玩家输入",
    title: "你说",
    main: textOf(event.payload.text),
    tags: ["玩家"],
    createdAt: event.createdAt,
    timeLabel: formatTime(event.createdAt)
  };
}

function buildReasoningItem(event: SessionEvent, itemId: string): PresentationItem {
  return {
    id: itemId,
    seq: event.seq,
    kind: "thought",
    kicker: "意图摘要",
    title: `${textOf(event.payload.speaker)} 的判断`,
    main: textOf(event.payload.summary),
    tags: ["可见推理"],
    createdAt: event.createdAt,
    timeLabel: formatTime(event.createdAt)
  };
}

function buildStageDirectionItem(event: SessionEvent, itemId: string): PresentationItem {
  return {
    id: itemId,
    seq: event.seq,
    kind: "action",
    kicker: "舞台动作",
    title: `${textOf(event.payload.speaker)} 的动作`,
    main: textOf(event.payload.direction),
    tags: ["动作"],
    createdAt: event.createdAt,
    timeLabel: formatTime(event.createdAt)
  };
}

function buildStoryEffectItem(event: SessionEvent, itemId: string): PresentationItem {
  return {
    id: itemId,
    seq: event.seq,
    kind: "effect",
    kicker: "剧情变化",
    title: textOf(event.payload.label),
    main: textOf(event.payload.description),
    meta: event.payload.intensity !== undefined ? `强度：${textOf(event.payload.intensity)}` : undefined,
    tags: ["效果"],
    createdAt: event.createdAt,
    timeLabel: formatTime(event.createdAt)
  };
}

function buildAgentSpeakPlayerItem(event: SessionEvent, itemId: string): PresentationItem {
  const message = typeof event.payload.message === "string" ? event.payload.message : "";

  return {
    id: itemId,
    seq: event.seq,
    kind: "dialogue",
    kicker: "角色发言",
    title: String(event.payload.speaker ?? "角色"),
    main: stripInlineDelays(message),
    tags: ["对你说"],
    createdAt: event.createdAt,
    timeLabel: formatTime(event.createdAt)
  };
}

function buildAgentSpeakAgentItem(
  event: SessionEvent,
  itemId: string,
  agentMap: Map<string, AgentProfile>
): PresentationItem {
  const message = typeof event.payload.message === "string" ? event.payload.message : "";
  const targetAgentId = typeof event.payload.targetAgentId === "string" ? event.payload.targetAgentId : "";
  const targetAgent = agentMap.get(targetAgentId);
  const targetAgentName = targetAgent?.name ?? targetAgentId;

  return {
    id: itemId,
    seq: event.seq,
    kind: "dialogue",
    kicker: "角色互动",
    title: `${textOf(event.payload.speaker)} 对着 ${targetAgentName} 说`,
    main: stripInlineDelays(message),
    tags: ["角色间对话"],
    createdAt: event.createdAt,
    timeLabel: formatTime(event.createdAt)
  };
}
