<template>
  <section class="timeline">
    <article
      v-for="action in previewActions"
      :key="`preview-${previewTurn?.turnId}-${action.index}`"
      class="timeline-item"
      :data-kind="previewKind(action)"
      data-preview="true"
      :data-live="previewTurn?.status === 'streaming' ? 'true' : undefined"
    >
      <div class="timeline-rail">
        <span class="timeline-dot" />
      </div>
      <div :class="cardClassForPreview(action)">
        <header class="event-header">
          <div class="event-title-block">
            <span class="event-kicker">{{ previewKicker(action) }}</span>
            <strong>{{ previewTitle(action) }}</strong>
          </div>
          <span>{{ previewStatusLabel(action) }}</span>
        </header>
        <div class="event-body">
          <p v-if="previewPlaceholder(action)" class="event-main event-main--placeholder">{{ previewPlaceholder(action) }}</p>
          <p v-else class="event-main">
            <template v-for="(segment, segmentIndex) in previewSegments(action)" :key="`${action.index}-${segmentIndex}`">
              <span v-if="segment.type === 'text'">{{ segment.text }}</span>
              <span v-else class="preview-delay-chip">停顿 {{ segment.delayMs }} ms</span>
            </template>
          </p>
          <p v-if="previewMeta(action)" class="event-meta">{{ previewMeta(action) }}</p>
        </div>
        <div class="event-tags">
          <span class="event-tag">预览</span>
          <span v-if="action.actorAgentId" class="event-tag">{{ previewActorName(action) }}</span>
          <span v-if="action.tool" class="event-tag">{{ action.tool }}</span>
        </div>
      </div>
    </article>
    <article
      v-if="automationStatus"
      class="timeline-item"
      data-kind="system"
      data-compact="true"
      data-automation="true"
      :data-live="automationStatus.live ? 'true' : undefined"
    >
      <div class="timeline-rail">
        <span class="timeline-dot" />
      </div>
      <div class="timeline-compact">
        <span class="timeline-compact__kicker">自动推进</span>
        <strong class="timeline-compact__title">{{ automationStatus.title }}</strong>
        <span v-if="automationStatus.meta" class="timeline-compact__meta">{{ automationStatus.meta }}</span>
        <span v-if="automationStatus.live" class="timeline-compact__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    </article>
    <article
      v-for="item in presentationItems"
      :key="item.id"
      class="timeline-item"
      :data-kind="item.kind"
      :data-compact="item.compact ? 'true' : undefined"
      :data-optional-tool="item.optionalTool ? 'true' : undefined"
      :data-live="isLivePause(item) ? 'true' : undefined"
    >
      <div class="timeline-rail">
        <span class="timeline-dot" />
      </div>
      <div v-if="item.compact" class="timeline-compact">
        <span class="timeline-compact__kicker">{{ item.kicker }}</span>
        <strong class="timeline-compact__title">{{ item.title }}</strong>
        <span v-if="item.main" class="timeline-compact__main">{{ item.main }}</span>
        <span v-if="item.meta" class="timeline-compact__meta">{{ item.meta }}</span>
        <span v-if="pauseLiveLabel(item)" class="timeline-compact__status">{{ pauseLiveLabel(item) }}</span>
        <span v-if="isLivePause(item)" class="timeline-compact__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span class="timeline-compact__time">{{ item.timeLabel }}</span>
      </div>
      <div v-else :class="cardClass(item)">
        <header class="event-header">
          <div class="event-title-block">
            <span class="event-kicker">{{ item.kicker }}</span>
            <strong>{{ item.title }}</strong>
          </div>
          <span>#{{ item.seq }} · {{ item.timeLabel }}</span>
        </header>
        <div class="event-body">
          <p v-if="item.main" class="event-main">{{ item.main }}</p>
          <div v-if="item.diffLines?.length" class="event-diff" aria-label="状态差异">
            <p
              v-for="line in item.diffLines"
              :key="`${line.prefix}-${line.value}`"
              class="event-diff__line"
              :data-prefix="line.prefix"
            >
              <span class="event-diff__prefix">{{ line.prefix }}</span>
              <span class="event-diff__value">{{ line.value }}</span>
            </p>
          </div>
          <div v-if="item.details?.length" class="event-detail-list">
            <p v-for="detail in item.details" :key="`${detail.label}-${detail.value}`" class="event-detail-row">
              <strong class="event-detail-label">{{ detail.label }}：</strong>
              <span class="event-detail-value">{{ detail.value }}</span>
            </p>
          </div>
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
import type { AgentProfile, SessionEvent } from "@dglab-ai/shared";
import {
  buildTimelinePresentationItems,
  type DeviceExecutionState,
  type PresentationItem
} from "../lib/timelinePresentation";
import type { InlineDelayPart } from "../lib/inlineDelays";
import type { PreviewAction, PreviewTurnState } from "../lib/previewTurnState";

type ActivePauseState = {
  id: string;
  countdownLabel: string;
};

type AutomationStatusState = {
  title: string;
  meta?: string;
  live?: boolean;
};

const props = defineProps<{
  events: SessionEvent[];
  activePause?: ActivePauseState | null;
  automationStatus?: AutomationStatusState | null;
  deviceExecutionStates?: Record<string, DeviceExecutionState>;
  agents?: AgentProfile[];
  previewTurn?: PreviewTurnState | null;
}>();

const presentationItems = computed<PresentationItem[]>(() => {
  return buildTimelinePresentationItems(props.events, props.deviceExecutionStates ?? {}, props.agents ?? []).slice().reverse();
});
const agentNameById = computed(() => {
  return new Map((props.agents ?? []).map((agent) => [agent.id, agent.name]));
});
const previewActions = computed<PreviewAction[]>(() => {
  return [...(props.previewTurn?.actions ?? [])].reverse();
});

function isLivePause(item: PresentationItem): boolean {
  return Boolean(item.pauseId) && item.pauseId === props.activePause?.id;
}

function pauseLiveLabel(item: PresentationItem): string | undefined {
  return isLivePause(item) ? props.activePause?.countdownLabel : undefined;
}

function cardClass(item: PresentationItem): string[] {
  return [
    "event-card",
    ...(item.kind === "player" ? ["event-card--player"] : []),
    ...(item.kind === "dialogue" ? ["event-card--dialogue"] : []),
    ...(item.kind === "inventory" ? ["event-card--inventory"] : []),
    ...(item.variant === "e-stim-control" ? ["event-card--e-stim-control"] : []),
    ...(item.optionalTool ? ["event-card--optional-tool"] : [])
  ];
}

function previewPrimaryPath(action: PreviewAction): string | null {
  switch (action.tool) {
    case "speak_to_player":
    case "speak_to_agent":
      return "args.message";
    case "perform_stage_direction":
      return "args.direction";
    case "apply_story_effect":
      return "args.description";
    case "emit_reasoning_summary":
      return "args.summary";
    default:
      return null;
  }
}

function previewSegments(action: PreviewAction): InlineDelayPart[] {
  const primaryPath = previewPrimaryPath(action);
  if (!primaryPath) {
    return [];
  }
  return action.textByPath[primaryPath]?.visibleSegments ?? [];
}

function previewPlaceholder(action: PreviewAction): string | null {
  if (previewSegments(action).length > 0) {
    return null;
  }
  switch (action.tool) {
    case "speak_to_player":
      return "正在生成发言...";
    case "perform_stage_direction":
      return "正在生成动作...";
    case "apply_story_effect":
      return "正在生成变化...";
    case "emit_reasoning_summary":
      return "正在生成摘要...";
    default:
      return "正在编写参数...";
  }
}

function previewKind(action: PreviewAction): PresentationItem["kind"] {
  switch (action.tool) {
    case "speak_to_player":
    case "speak_to_agent":
      return "dialogue";
    case "perform_stage_direction":
      return "action";
    case "apply_story_effect":
      return "effect";
    case "emit_reasoning_summary":
      return "thought";
    default:
      return "system";
  }
}

function previewKicker(action: PreviewAction): string {
  switch (action.tool) {
    case "speak_to_player":
      return "角色发言";
    case "speak_to_agent":
      return "角色互动";
    case "perform_stage_direction":
      return "舞台动作";
    case "apply_story_effect":
      return "剧情变化";
    case "emit_reasoning_summary":
      return "意图摘要";
    default:
      return "系统";
  }
}

function previewActorName(action: PreviewAction): string {
  if (action.actorAgentId) {
    return agentNameById.value.get(action.actorAgentId) ?? action.actorAgentId;
  }
  return "角色";
}

function previewTitle(action: PreviewAction): string {
  const actor = previewActorName(action);
  switch (action.tool) {
    case "speak_to_player":
      return actor;
    case "speak_to_agent":
      return `${actor} 对其他角色说`;
    case "perform_stage_direction":
      return `${actor} 的动作`;
    case "apply_story_effect":
      return "剧情变化";
    case "emit_reasoning_summary":
      return `${actor} 的判断`;
    default:
      return actor;
  }
}

function previewStatusLabel(action: PreviewAction): string {
  if (props.previewTurn?.status === "failed") {
    return "已失败";
  }
  if (action.completed) {
    return "已生成";
  }
  if (props.previewTurn?.status === "completed") {
    return "等待正式提交";
  }
  return "生成中";
}

function previewMeta(action: PreviewAction): string | undefined {
  if (props.previewTurn?.status === "failed") {
    return props.previewTurn.errorMessage ?? "本轮预览失败，正式状态没有被提交。";
  }
  if (action.completed) {
    return "这张卡片来自临时预览，正式事件到达后会由时间线接管。";
  }
  return "预览内容尚未正式提交。";
}

function cardClassForPreview(action: PreviewAction): string[] {
  return [
    "event-card",
    "event-card--preview",
    ...(previewKind(action) === "dialogue" ? ["event-card--dialogue"] : [])
  ];
}
</script>
