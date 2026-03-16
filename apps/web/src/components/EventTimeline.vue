<template>
  <section class="timeline">
    <article
      v-for="item in presentationItems"
      :key="`${item.seq}-${item.kind}`"
      class="timeline-item"
      :data-kind="item.kind"
    >
      <div class="timeline-rail">
        <span class="timeline-dot" />
      </div>
      <div class="event-card">
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
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { SessionEvent } from "@dglab-ai/shared";

type PresentationItem = {
  seq: number;
  kind: "player" | "dialogue" | "thought" | "action" | "system" | "effect";
  kicker: string;
  title: string;
  main: string;
  meta?: string;
  tags: string[];
  createdAt: string;
};

const props = defineProps<{
  events: SessionEvent[];
}>();

const presentationItems = computed<PresentationItem[]>(() => {
  return props.events.map((event) => {
    switch (event.type) {
      case "player.message":
        return {
          seq: event.seq,
          kind: "player",
          kicker: "玩家输入",
          title: "你说",
          main: textOf(event.payload.text),
          tags: ["玩家"],
          createdAt: event.createdAt
        };
      case "agent.speak_player":
        return {
          seq: event.seq,
          kind: "dialogue",
          kicker: "角色发言",
          title: String(event.payload.speaker ?? "角色"),
          main: textOf(event.payload.message),
          tags: ["对你说"],
          createdAt: event.createdAt
        };
      case "agent.speak_agent":
        return {
          seq: event.seq,
          kind: "dialogue",
          kicker: "角色互动",
          title: `${textOf(event.payload.speaker)} 与其他角色交流`,
          main: textOf(event.payload.message),
          meta: `目标角色：${textOf(event.payload.targetAgentId)}`,
          tags: ["角色间对话"],
          createdAt: event.createdAt
        };
      case "agent.reasoning":
        return {
          seq: event.seq,
          kind: "thought",
          kicker: "意图摘要",
          title: `${textOf(event.payload.speaker)} 的判断`,
          main: textOf(event.payload.summary),
          tags: ["可见推理"],
          createdAt: event.createdAt
        };
      case "agent.stage_direction":
        return {
          seq: event.seq,
          kind: "action",
          kicker: "舞台动作",
          title: `${textOf(event.payload.speaker)} 的动作`,
          main: textOf(event.payload.direction),
          tags: ["动作"],
          createdAt: event.createdAt
        };
      case "agent.story_effect":
        return {
          seq: event.seq,
          kind: "effect",
          kicker: "剧情变化",
          title: textOf(event.payload.label),
          main: textOf(event.payload.description),
          meta: event.payload.intensity !== undefined ? `强度：${textOf(event.payload.intensity)}` : undefined,
          tags: ["效果"],
          createdAt: event.createdAt
        };
      case "scene.updated":
        return {
          seq: event.seq,
          kind: "system",
          kicker: "场景状态",
          title: "场景已更新",
          main: buildSceneUpdateText(event.payload),
          tags: ["系统"],
          createdAt: event.createdAt
        };
      case "system.tick_started":
        return {
          seq: event.seq,
          kind: "system",
          kicker: "系统调度",
          title: "新一轮推演开始",
          main: "系统已收集本轮上下文并开始推进剧情。",
          meta: event.payload.reason ? `触发原因：${textOf(event.payload.reason)}` : undefined,
          tags: ["Tick"],
          createdAt: event.createdAt
        };
      case "system.tick_completed":
        return {
          seq: event.seq,
          kind: "system",
          kicker: "系统调度",
          title: "本轮推演已完成",
          main: "角色响应与场景更新已经完成。",
          meta: event.payload.status ? `当前状态：${textOf(event.payload.status)}` : undefined,
          tags: ["Tick"],
          createdAt: event.createdAt
        };
      case "system.timer_updated":
        return {
          seq: event.seq,
          kind: "system",
          kicker: "自动推进",
          title: textOf(event.payload.enabled) === "true" ? "自动推进已开启" : "自动推进已关闭",
          main: event.payload.intervalMs ? `当前触发间隔为 ${textOf(event.payload.intervalMs)} ms。` : "定时配置已更新。",
          tags: ["定时器"],
          createdAt: event.createdAt
        };
      case "system.wait_scheduled":
        return {
          seq: event.seq,
          kind: "system",
          kicker: "节奏控制",
          title: "角色安排了稍后动作",
          main: textOf(event.payload.reason),
          meta: event.payload.delayMs ? `延迟：${textOf(event.payload.delayMs)} ms` : undefined,
          tags: ["等待"],
          createdAt: event.createdAt
        };
      case "system.story_ended":
        return {
          seq: event.seq,
          kind: "effect",
          kicker: "结局",
          title: "故事已收束",
          main: textOf(event.payload.summary),
          meta: event.payload.resolution ? `结局说明：${textOf(event.payload.resolution)}` : undefined,
          tags: ["结束"],
          createdAt: event.createdAt
        };
      case "system.usage_recorded":
        return {
          seq: event.seq,
          kind: "system",
          kicker: "模型调用",
          title: "Token 统计已更新",
          main: "本次模型调用消耗已计入会话统计。",
          meta: event.payload.totalTokens ? `本次总消耗：${textOf(event.payload.totalTokens)} tokens` : undefined,
          tags: ["Usage"],
          createdAt: event.createdAt
        };
      case "session.created":
        return {
          seq: event.seq,
          kind: "system",
          kicker: "会话",
          title: "会话已创建",
          main: textOf(event.payload.title ?? "新的故事会话已建立。"),
          tags: ["系统"],
          createdAt: event.createdAt
        };
      case "draft.generated":
        return {
          seq: event.seq,
          kind: "system",
          kicker: "草案",
          title: "设定草案已生成",
          main: "系统已完成背景和角色补全，请在确认页检查细节。",
          tags: ["系统"],
          createdAt: event.createdAt
        };
      case "draft.updated":
        return {
          seq: event.seq,
          kind: "system",
          kicker: "草案",
          title: "设定草案已修改",
          main: "你对世界观或角色设定做了更新。",
          tags: ["系统"],
          createdAt: event.createdAt
        };
      case "session.confirmed":
        return {
          seq: event.seq,
          kind: "system",
          kicker: "会话",
          title: "故事正式开始",
          main: "设定已确认，系统将按当前背景持续推进剧情。",
          tags: ["系统"],
          createdAt: event.createdAt
        };
      default:
        return {
          seq: event.seq,
          kind: "system",
          kicker: "系统",
          title: event.type,
          main: "系统记录了一条内部事件。",
          tags: ["系统"],
          createdAt: event.createdAt
        };
    }
  });
});

function textOf(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function buildSceneUpdateText(payload: Record<string, unknown>): string {
  const chunks = [
    payload.phase ? `阶段变更为「${textOf(payload.phase)}」` : "",
    payload.location ? `地点更新为「${textOf(payload.location)}」` : "",
    payload.summary ? textOf(payload.summary) : "",
    Array.isArray(payload.activeObjectives) && payload.activeObjectives.length > 0
      ? `当前目标：${payload.activeObjectives.map(textOf).join("、")}`
      : ""
  ].filter(Boolean);
  return chunks.join("；") || "场景状态已同步更新。";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}
</script>

