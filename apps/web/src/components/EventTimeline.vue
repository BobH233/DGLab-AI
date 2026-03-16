<template>
  <section class="timeline">
    <article
      v-for="item in presentationItems"
      :key="`${item.seq}-${item.kind}`"
      class="timeline-item"
      :data-kind="item.kind"
      :data-optional-tool="item.optionalTool ? 'true' : undefined"
    >
      <div class="timeline-rail">
        <span class="timeline-dot" />
      </div>
      <div :class="cardClass(item)">
        <header class="event-header">
          <div class="event-title-block">
            <span class="event-kicker">{{ item.kicker }}</span>
            <strong>{{ item.title }}</strong>
          </div>
          <span>#{{ item.seq }} · {{ formatDate(item.createdAt) }}</span>
        </header>
        <div class="event-body">
          <p class="event-main">{{ item.main }}</p>
          <p v-if="item.meta" class="event-meta">{{ item.meta }}</p>
        </div>
        <div v-if="item.tags.length" class="event-tags">
          <span v-for="tag in item.tags" :key="tag" class="event-tag">{{ tag }}</span>
        </div>
      </div>
    </article>
    <article
      v-if="activePause"
      class="timeline-item timeline-item--live"
      data-kind="pause"
    >
      <div class="timeline-rail">
        <span class="timeline-dot timeline-dot--pause" />
      </div>
      <div class="event-card event-card--pause">
        <header class="event-header">
          <div class="event-title-block">
            <span class="event-kicker">节奏控制</span>
            <strong>{{ activePause.title }}</strong>
          </div>
          <span>{{ activePause.countdownLabel }}</span>
        </header>
        <div class="event-body">
          <p class="event-main">{{ activePause.main }}</p>
          <p v-if="activePause.meta" class="event-meta">{{ activePause.meta }}</p>
        </div>
        <div class="pause-indicator" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { isToolRequired, type SessionEvent } from "@dglab-ai/shared";

type PresentationItem = {
  seq: number;
  kind: "player" | "dialogue" | "thought" | "action" | "system" | "effect" | "error";
  kicker: string;
  title: string;
  main: string;
  meta?: string;
  tags: string[];
  createdAt: string;
  optionalTool?: boolean;
};

type ActivePauseState = {
  title: string;
  main: string;
  meta?: string;
  countdownLabel: string;
};

const props = defineProps<{
  events: SessionEvent[];
  activePause?: ActivePauseState | null;
}>();

const presentationItems = computed<PresentationItem[]>(() => {
  return props.events.reduce<PresentationItem[]>((items, event) => {
    switch (event.type) {
      case "player.message":
        items.push({
          seq: event.seq,
          kind: "player",
          kicker: "玩家输入",
          title: "你说",
          main: textOf(event.payload.text),
          tags: ["玩家"],
          createdAt: event.createdAt
        });
        return items;
      case "agent.speak_player":
        items.push({
          seq: event.seq,
          kind: "dialogue",
          kicker: "角色发言",
          title: String(event.payload.speaker ?? "角色"),
          main: textOf(event.payload.message),
          tags: ["对你说"],
          createdAt: event.createdAt
        });
        return items;
      case "agent.device_control":
        const optionalTool = isOptionalToolEvent(event);
        items.push({
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
          optionalTool
        });
        return items;
      case "agent.speak_agent":
        items.push({
          seq: event.seq,
          kind: "dialogue",
          kicker: "角色互动",
          title: `${textOf(event.payload.speaker)} 与其他角色交流`,
          main: textOf(event.payload.message),
          meta: `目标角色：${textOf(event.payload.targetAgentId)}`,
          tags: ["角色间对话"],
          createdAt: event.createdAt
        });
        return items;
      case "agent.reasoning":
        items.push({
          seq: event.seq,
          kind: "thought",
          kicker: "意图摘要",
          title: `${textOf(event.payload.speaker)} 的判断`,
          main: textOf(event.payload.summary),
          tags: ["可见推理"],
          createdAt: event.createdAt
        });
        return items;
      case "agent.stage_direction":
        items.push({
          seq: event.seq,
          kind: "action",
          kicker: "舞台动作",
          title: `${textOf(event.payload.speaker)} 的动作`,
          main: textOf(event.payload.direction),
          tags: ["动作"],
          createdAt: event.createdAt
        });
        return items;
      case "agent.story_effect":
        items.push({
          seq: event.seq,
          kind: "effect",
          kicker: "剧情变化",
          title: textOf(event.payload.label),
          main: textOf(event.payload.description),
          meta: event.payload.intensity !== undefined ? `强度：${textOf(event.payload.intensity)}` : undefined,
          tags: ["效果"],
          createdAt: event.createdAt
        });
        return items;
      case "scene.updated":
        items.push({
          seq: event.seq,
          kind: "system",
          kicker: "场景状态",
          title: "场景已更新",
          main: buildSceneUpdateText(event.payload),
          tags: ["系统"],
          createdAt: event.createdAt
        });
        return items;
      case "system.tick_started":
        items.push({
          seq: event.seq,
          kind: "system",
          kicker: "系统调度",
          title: "新一轮推演开始",
          main: "系统已收集本轮上下文并开始推进剧情。",
          meta: event.payload.reason ? `触发原因：${textOf(event.payload.reason)}` : undefined,
          tags: ["Tick"],
          createdAt: event.createdAt
        });
        return items;
      case "system.tick_completed":
        items.push({
          seq: event.seq,
          kind: "system",
          kicker: "系统调度",
          title: "本轮推演已完成",
          main: "角色响应与场景更新已经完成。",
          meta: event.payload.status ? `当前状态：${textOf(event.payload.status)}` : undefined,
          tags: ["Tick"],
          createdAt: event.createdAt
        });
        return items;
      case "system.tick_failed":
        items.push({
          seq: event.seq,
          kind: "error",
          kicker: "系统异常",
          title: "本轮推进失败",
          main: textOf(event.payload.message) || "模型调用失败，当前轮次未能完成。",
          meta: event.payload.reason ? `触发原因：${textOf(event.payload.reason)}` : undefined,
          tags: textOf(event.payload.retryable) === "true" ? ["可重试"] : ["异常"],
          createdAt: event.createdAt
        });
        return items;
      case "system.timer_updated":
        items.push({
          seq: event.seq,
          kind: "system",
          kicker: "自动推进",
          title: textOf(event.payload.enabled) === "true" ? "自动推进已开启" : "自动推进已关闭",
          main: event.payload.intervalMs ? `当前触发间隔为 ${textOf(event.payload.intervalMs)} ms。` : "定时配置已更新。",
          tags: ["定时器"],
          createdAt: event.createdAt
        });
        return items;
      case "system.wait_scheduled":
        return items;
      case "system.story_ended":
        items.push({
          seq: event.seq,
          kind: "effect",
          kicker: "结局",
          title: "故事已收束",
          main: textOf(event.payload.summary),
          meta: event.payload.resolution ? `结局说明：${textOf(event.payload.resolution)}` : undefined,
          tags: ["结束"],
          createdAt: event.createdAt
        });
        return items;
      case "system.usage_recorded":
        items.push({
          seq: event.seq,
          kind: "system",
          kicker: "模型调用",
          title: "Token 统计已更新",
          main: "本次模型调用消耗已计入会话统计。",
          meta: event.payload.totalTokens ? `本次总消耗：${textOf(event.payload.totalTokens)} tokens` : undefined,
          tags: ["Usage"],
          createdAt: event.createdAt
        });
        return items;
      case "session.created":
        items.push({
          seq: event.seq,
          kind: "system",
          kicker: "会话",
          title: "会话已创建",
          main: textOf(event.payload.title ?? "新的故事会话已建立。"),
          tags: ["系统"],
          createdAt: event.createdAt
        });
        return items;
      case "draft.generated":
        items.push({
          seq: event.seq,
          kind: "system",
          kicker: "草案",
          title: "设定草案已生成",
          main: "系统已完成背景和角色补全，请在确认页检查细节。",
          tags: ["系统"],
          createdAt: event.createdAt
        });
        return items;
      case "draft.updated":
        items.push({
          seq: event.seq,
          kind: "system",
          kicker: "草案",
          title: "设定草案已修改",
          main: "你对世界观或角色设定做了更新。",
          tags: ["系统"],
          createdAt: event.createdAt
        });
        return items;
      case "session.confirmed":
        items.push({
          seq: event.seq,
          kind: "system",
          kicker: "会话",
          title: "故事正式开始",
          main: "设定已确认，系统将按当前背景持续推进剧情。",
          tags: ["系统"],
          createdAt: event.createdAt
        });
        return items;
      default:
        items.push({
          seq: event.seq,
          kind: "system",
          kicker: "系统",
          title: event.type,
          main: "系统记录了一条内部事件。",
          tags: ["系统"],
          createdAt: event.createdAt
        });
        return items;
    }
  }, []);
});

function textOf(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) {
    return fallback;
  }
  const normalized = String(value);
  return normalized.trim() || fallback;
}

function cardClass(item: PresentationItem): string[] {
  return [
    "event-card",
    ...(item.kind === "dialogue" ? ["event-card--dialogue"] : []),
    ...(item.optionalTool ? ["event-card--optional-tool"] : [])
  ];
}

function isOptionalToolEvent(event: SessionEvent): boolean {
  const toolId = typeof event.payload.action === "string" ? event.payload.action : "";
  return Boolean(toolId) && !isToolRequired(toolId);
}

function buildSceneUpdateText(payload: Record<string, unknown>): string {
  const chunks = [
    payload.phase ? `阶段变更为「${textOf(payload.phase)}」` : "",
    payload.location ? `地点更新为「${textOf(payload.location)}」` : "",
    payload.summary ? textOf(payload.summary) : "",
    Array.isArray(payload.activeObjectives) && payload.activeObjectives.length > 0
      ? `当前目标：${payload.activeObjectives.map((objective) => textOf(objective)).join("、")}`
      : ""
  ].filter(Boolean);
  return chunks.join("；") || "场景状态已同步更新。";
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

function formatDate(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}
</script>
