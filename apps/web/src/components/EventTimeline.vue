<template>
  <section class="timeline">
    <article
      v-if="previewStatus"
      class="timeline-item"
      data-kind="system"
      data-compact="true"
      data-preview-status="true"
      :data-live="previewStatus.live ? 'true' : undefined"
    >
      <div class="timeline-rail">
        <span class="timeline-dot" />
      </div>
      <div class="timeline-compact">
        <span class="timeline-compact__kicker">{{ previewStatus.kicker }}</span>
        <strong class="timeline-compact__title">{{ previewStatus.title }}</strong>
        <span v-if="previewStatus.meta" class="timeline-compact__meta">{{ previewStatus.meta }}</span>
        <span v-if="previewStatus.live" class="timeline-compact__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    </article>
    <article
      v-for="entry in previewEntries"
      :key="entry.id"
      class="timeline-item"
      :data-kind="entry.kind"
      data-preview="true"
      :data-live="entry.live ? 'true' : undefined"
    >
      <div class="timeline-rail">
        <span class="timeline-dot" />
      </div>
      <div v-if="entry.compact" class="timeline-compact">
        <span class="timeline-compact__kicker">{{ entry.kicker }}</span>
        <strong class="timeline-compact__title">{{ entry.title }}</strong>
        <span v-if="entry.main" class="timeline-compact__main">{{ entry.main }}</span>
        <span v-if="entry.meta" class="timeline-compact__meta">{{ entry.meta }}</span>
        <span v-if="entry.status" class="timeline-compact__status">{{ entry.status }}</span>
        <span v-if="entry.live" class="timeline-compact__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
      <div v-else :class="buildCardClass(entry.kind, entry.variant)">
        <header class="event-header event-header--single">
          <div class="event-title-block">
            <span class="event-kicker">{{ previewKicker(entry.action) }}</span>
            <strong>{{ previewTitle(entry.action) }}</strong>
          </div>
        </header>
        <div class="event-body">
          <template v-if="previewIsSceneState(entry.action)">
            <div class="event-detail-list">
              <p
                v-for="detail in previewSceneDetails(entry.action)"
                :key="detail.key"
                class="event-detail-row"
              >
                <strong class="event-detail-label">{{ detail.label }}：</strong>
                <span
                  class="event-detail-value"
                  :class="detail.pending ? 'event-detail-value--placeholder' : undefined"
                >{{ detail.value }}</span>
              </p>
            </div>
          </template>
          <template v-else>
            <p v-if="entry.main" class="event-main">{{ entry.main }}</p>
            <p v-else class="event-main event-main--placeholder">{{ entry.placeholder }}</p>
            <div v-if="entry.details?.length" class="event-detail-list">
              <p
                v-for="detail in entry.details"
                :key="detail.key"
                class="event-detail-row"
              >
                <strong class="event-detail-label">{{ detail.label }}：</strong>
                <span
                  class="event-detail-value"
                  :class="detail.pending ? 'event-detail-value--placeholder' : undefined"
                >{{ detail.value }}</span>
              </p>
            </div>
            <p v-if="entry.meta" class="event-meta">{{ entry.meta }}</p>
          </template>
        </div>
        <div v-if="previewTags(entry.action).length" class="event-tags">
          <span v-for="tag in previewTags(entry.action)" :key="tag" class="event-tag">{{ tag }}</span>
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
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { AgentProfile, SessionEvent } from "@dglab-ai/shared";
import {
  buildTimelinePresentationItems,
  type DeviceExecutionState,
  type PresentationItem
} from "../lib/timelinePresentation";
import { formatInlineDelayMs, type InlineDelayPart } from "../lib/inlineDelays";
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

type PreviewStatusState = {
  kicker: string;
  title: string;
  meta?: string;
  live: boolean;
};

type PreviewDetailRow = {
  key: string;
  label: string;
  value: string;
  pending?: boolean;
};

type PreviewDelayProgress = {
  revealedCount: number;
  activeDelayIndex: number | null;
  deadlineAt: number | null;
  delayMs: number | null;
};

type PreviewEntry = {
  id: string;
  kind: PresentationItem["kind"];
  variant?: PresentationItem["variant"];
  kicker: string;
  title: string;
  main?: string;
  details?: PreviewDetailRow[];
  meta?: string;
  status?: string;
  compact?: boolean;
  live?: boolean;
  action: PreviewAction;
  placeholder?: string | null;
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
const previewDelayProgress = ref<Record<string, PreviewDelayProgress>>({});
const previewClockNow = ref(Date.now());
const previewEntries = computed<PreviewEntry[]>(() => {
  const entries: PreviewEntry[] = [];
  for (const action of props.previewTurn?.actions ?? []) {
    entries.push(...buildPreviewEntries(action));
  }
  return entries.reverse();
});
const previewStatus = computed<PreviewStatusState | null>(() => {
  if (!props.previewTurn) {
    return null;
  }

  if (props.previewTurn.status === "failed") {
    return {
      kicker: "模型",
      title: "预览失败",
      meta: props.previewTurn.errorMessage ?? props.previewTurn.model,
      live: false
    };
  }

  if (typeof props.previewTurn.totalTokens === "number") {
    return {
      kicker: "用量",
      title: `${props.previewTurn.totalTokens} tokens`,
      meta: props.previewTurn.model,
      live: props.previewTurn.status === "streaming"
    };
  }

  return {
    kicker: "模型",
    title: props.previewTurn.status === "completed" ? "等待正式提交" : "正在思考中",
    meta: props.previewTurn.model,
    live: props.previewTurn.status === "streaming"
  };
});
let previewClockTimer: number | null = null;
const previewDelayTimers = new Map<string, number>();

watch(() => props.previewTurn, syncPreviewDelayProgress, {
  deep: true,
  immediate: true
});

onBeforeUnmount(() => {
  clearPreviewDelayTimers();
  stopPreviewClock();
});

function isLivePause(item: PresentationItem): boolean {
  return Boolean(item.pauseId) && item.pauseId === props.activePause?.id;
}

function pauseLiveLabel(item: PresentationItem): string | undefined {
  return isLivePause(item) ? props.activePause?.countdownLabel : undefined;
}

function cardClass(item: PresentationItem): string[] {
  return buildCardClass(item.kind, item.variant, item.optionalTool);
}

function buildCardClass(
  kind: PresentationItem["kind"],
  variant?: PresentationItem["variant"],
  optionalTool?: boolean
): string[] {
  return [
    "event-card",
    ...(kind === "player" ? ["event-card--player"] : []),
    ...(kind === "dialogue" ? ["event-card--dialogue"] : []),
    ...(kind === "inventory" ? ["event-card--inventory"] : []),
    ...(variant === "e-stim-control" ? ["event-card--e-stim-control"] : []),
    ...(optionalTool ? ["event-card--optional-tool"] : [])
  ];
}

function previewActionKey(action: PreviewAction): string {
  return `${props.previewTurn?.turnId ?? "preview"}:${action.index}`;
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
  return previewSegmentsByPath(action, primaryPath);
}

function previewSegmentsByPath(action: PreviewAction, path: string): InlineDelayPart[] {
  return action.textByPath[path]?.visibleSegments ?? [];
}

function previewTextByPath(action: PreviewAction, path: string): string {
  return previewSegmentsByPath(action, path)
    .filter((segment): segment is Extract<InlineDelayPart, { type: "text" }> => segment.type === "text")
    .map((segment) => segment.text)
    .join("");
}

function previewCompletedValue(action: PreviewAction, path: string): unknown {
  return action.valueByPath[path];
}

function formatPreviewValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatPreviewValue(item)).filter(Boolean).join(" / ");
  }
  return String(value);
}

function previewText(action: PreviewAction): string {
  const primaryPath = previewPrimaryPath(action);
  return primaryPath ? previewTextByPath(action, primaryPath) : "";
}

function previewHasText(action: PreviewAction): boolean {
  return previewText(action).trim().length > 0;
}

function previewPlaceholder(action: PreviewAction): string | null {
  if (previewHasText(action)) {
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
    case "update_scene_state":
      return "正在同步场景状态...";
    case "control_e_stim_toy":
      return "正在编写控制参数...";
    default:
      return "正在编写参数...";
  }
}

function buildPreviewEntries(action: PreviewAction): PreviewEntry[] {
  if (previewIsSceneState(action)) {
    return [{
      id: `${previewActionKey(action)}:scene`,
      kind: previewKind(action),
      kicker: previewKicker(action),
      title: previewTitle(action),
      action
    }];
  }

  if (previewIsEStimControl(action)) {
    return [{
      id: `${previewActionKey(action)}:e-stim`,
      kind: previewKind(action),
      variant: "e-stim-control",
      kicker: previewKicker(action),
      title: previewTitle(action),
      main: previewEStimMain(action),
      details: previewEStimDetails(action),
      meta: previewMeta(action),
      placeholder: previewPlaceholder(action),
      action
    }];
  }

  const segments = previewSegments(action);
  const progress = previewDelayProgress.value[previewActionKey(action)] ?? {
    revealedCount: 0,
    activeDelayIndex: null,
    deadlineAt: null,
    delayMs: null
  };
  const entries: PreviewEntry[] = [];
  let textIndex = 0;
  let delayIndex = 0;
  let textBuffer = "";

  const flushTextBuffer = () => {
    const text = textBuffer.trim();
    textBuffer = "";
    if (!text) {
      return;
    }
    entries.push({
      id: `${previewActionKey(action)}:text:${textIndex}`,
      kind: previewKind(action),
      kicker: previewKicker(action),
      title: previewTitle(action),
      main: text,
      meta: previewMeta(action),
      action
    });
    textIndex += 1;
  };

  for (const segment of segments.slice(0, progress.revealedCount)) {
    if (segment.type === "delay") {
      flushTextBuffer();
      entries.push(buildPreviewPauseEntry(action, segment.delayMs, delayIndex, false));
      delayIndex += 1;
      continue;
    }
    textBuffer += segment.text;
  }

  flushTextBuffer();

  if (progress.activeDelayIndex !== null && segments[progress.activeDelayIndex]?.type === "delay") {
    const activeDelaySegment = segments[progress.activeDelayIndex];
    if (activeDelaySegment?.type === "delay") {
      entries.push(buildPreviewPauseEntry(action, activeDelaySegment.delayMs, delayIndex, true, progress.deadlineAt));
    }
  }

  if (entries.length > 0) {
    return entries;
  }

  return [{
    id: `${previewActionKey(action)}:placeholder`,
    kind: previewKind(action),
    kicker: previewKicker(action),
    title: previewTitle(action),
    action,
    meta: previewMeta(action),
    placeholder: previewPlaceholder(action)
  }];
}

function buildPreviewPauseEntry(
  action: PreviewAction,
  delayMs: number,
  delayIndex: number,
  live: boolean,
  deadlineAt?: number | null
): PreviewEntry {
  return {
    id: `${previewActionKey(action)}:delay:${delayIndex}`,
    kind: "pause",
    kicker: "节奏控制",
    title: `约 ${formatInlineDelayMs(delayMs)} 后继续`,
    meta: previewPauseMeta(action),
    status: live ? previewDelayCountdownLabel(deadlineAt, delayMs) : undefined,
    compact: true,
    live,
    action
  };
}

function previewPauseMeta(action: PreviewAction): string {
  switch (action.tool) {
    case "speak_to_player":
      return "文本内节奏停顿";
    case "speak_to_agent":
      return "角色间对白停顿";
    case "perform_stage_direction":
      return "舞台节奏停顿";
    case "apply_story_effect":
      return "剧情效果停顿";
    case "emit_reasoning_summary":
      return "意图节奏停顿";
    default:
      return "文本内节奏停顿";
  }
}

function previewDelayCountdownLabel(deadlineAt: number | null | undefined, delayMs: number): string {
  if (!deadlineAt) {
    return `约 ${formatInlineDelayMs(delayMs)} 后继续`;
  }
  const remaining = deadlineAt - previewClockNow.value;
  return remaining > 0 ? `约 ${formatInlineDelayMs(remaining)} 后继续` : "即将继续";
}

function syncPreviewDelayProgress(): void {
  const nextKeys = new Set<string>();

  for (const action of props.previewTurn?.actions ?? []) {
    const primaryPath = previewPrimaryPath(action);
    if (!primaryPath) {
      continue;
    }

    const key = previewActionKey(action);
    nextKeys.add(key);
    const existing = previewDelayProgress.value[key] ?? {
      revealedCount: shouldBootstrapPreviewAction(action) ? previewSegments(action).length : 0,
      activeDelayIndex: null,
      deadlineAt: null,
      delayMs: null
    };
    previewDelayProgress.value[key] = existing;
    advancePreviewDelayProgress(key, action);
  }

  for (const key of Object.keys(previewDelayProgress.value)) {
    if (nextKeys.has(key)) {
      continue;
    }
    clearPreviewDelayTimer(key);
    delete previewDelayProgress.value[key];
  }

  syncPreviewClock();
}

function shouldBootstrapPreviewAction(action: PreviewAction): boolean {
  return Boolean(props.previewTurn?.restoredActionIndexes?.includes(action.index));
}

function advancePreviewDelayProgress(key: string, action: PreviewAction): void {
  const progress = previewDelayProgress.value[key];
  if (!progress) {
    return;
  }

  const segments = previewSegments(action);
  while (progress.revealedCount < segments.length) {
    const segment = segments[progress.revealedCount];
    if (!segment) {
      break;
    }
    if (segment.type === "text") {
      progress.revealedCount += 1;
      continue;
    }
    if (progress.activeDelayIndex !== progress.revealedCount) {
      progress.activeDelayIndex = progress.revealedCount;
      progress.delayMs = segment.delayMs;
      progress.deadlineAt = Date.now() + segment.delayMs;
      schedulePreviewDelay(key, segment.delayMs);
    }
    return;
  }

  progress.activeDelayIndex = null;
  progress.delayMs = null;
  progress.deadlineAt = null;
  clearPreviewDelayTimer(key);
}

function schedulePreviewDelay(key: string, delayMs: number): void {
  clearPreviewDelayTimer(key);
  previewDelayTimers.set(key, window.setTimeout(() => {
    const progress = previewDelayProgress.value[key];
    if (!progress || progress.activeDelayIndex === null) {
      return;
    }
    progress.revealedCount = Math.max(progress.revealedCount, progress.activeDelayIndex + 1);
    progress.activeDelayIndex = null;
    progress.delayMs = null;
    progress.deadlineAt = null;
    clearPreviewDelayTimer(key);
    const action = props.previewTurn?.actions.find((item) => previewActionKey(item) === key);
    if (action) {
      advancePreviewDelayProgress(key, action);
    }
    syncPreviewClock();
  }, delayMs));
}

function clearPreviewDelayTimer(key: string): void {
  const timer = previewDelayTimers.get(key);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    previewDelayTimers.delete(key);
  }
}

function clearPreviewDelayTimers(): void {
  for (const key of previewDelayTimers.keys()) {
    clearPreviewDelayTimer(key);
  }
}

function syncPreviewClock(): void {
  if (previewDelayTimers.size > 0) {
    if (previewClockTimer === null) {
      previewClockNow.value = Date.now();
      previewClockTimer = window.setInterval(() => {
        previewClockNow.value = Date.now();
      }, 250);
    }
    return;
  }
  stopPreviewClock();
}

function stopPreviewClock(): void {
  if (previewClockTimer !== null) {
    window.clearInterval(previewClockTimer);
    previewClockTimer = null;
  }
}

function previewKind(action: PreviewAction): PresentationItem["kind"] {
  switch (action.tool) {
    case "speak_to_player":
    case "speak_to_agent":
      return "dialogue";
    case "control_e_stim_toy":
    case "perform_stage_direction":
      return "action";
    case "apply_story_effect":
      return "effect";
    case "emit_reasoning_summary":
      return "thought";
    case "update_scene_state":
      return "system";
    default:
      return "system";
  }
}

function previewTags(action: PreviewAction): string[] {
  switch (action.tool) {
    case "speak_to_player":
      return ["对你说"];
    case "speak_to_agent":
      return ["角色间对话"];
    case "control_e_stim_toy":
      return ["工具调用", "电击器"];
    case "perform_stage_direction":
      return ["动作"];
    case "apply_story_effect":
      return ["效果"];
    case "emit_reasoning_summary":
      return ["可见推理"];
    case "update_scene_state":
      return ["系统"];
    default:
      return ["系统"];
  }
}

function previewKicker(action: PreviewAction): string {
  switch (action.tool) {
    case "speak_to_player":
      return "角色发言";
    case "speak_to_agent":
      return "角色互动";
    case "control_e_stim_toy":
      return "电击器控制";
    case "perform_stage_direction":
      return "舞台动作";
    case "apply_story_effect":
      return "剧情变化";
    case "emit_reasoning_summary":
      return "意图摘要";
    case "update_scene_state":
      return "场景状态";
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
    case "control_e_stim_toy":
      return `${actor} 调用了 情趣电击器`;
    case "perform_stage_direction":
      return `${actor} 的动作`;
    case "apply_story_effect":
      return formatPreviewValue(previewCompletedValue(action, "args.label")) || "剧情变化";
    case "emit_reasoning_summary":
      return `${actor} 的判断`;
    case "update_scene_state":
      return "场景已更新";
    default:
      return actor;
  }
}

function previewMeta(action: PreviewAction): string | undefined {
  switch (action.tool) {
    case "apply_story_effect": {
      const intensity = formatPreviewValue(previewCompletedValue(action, "args.intensity"));
      return intensity ? `强度：${intensity}` : undefined;
    }
    default:
      return undefined;
  }
}

function previewIsSceneState(action: PreviewAction): boolean {
  return action.tool === "update_scene_state";
}

function previewIsEStimControl(action: PreviewAction): boolean {
  return action.tool === "control_e_stim_toy";
}

function isPreviewRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatPreviewBoolean(value: unknown): string {
  return value ? "是" : "否";
}

function previewPathSegments(path: string): string[] {
  return path.split(".").filter(Boolean);
}

function previewDrillValue(source: unknown, path: string): unknown {
  let cursor = source;
  for (const segment of previewPathSegments(path)) {
    if (!isPreviewRecord(cursor) || !(segment in cursor)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function previewValueAtPath(action: PreviewAction, path: string): unknown {
  const exact = previewCompletedValue(action, path);
  if (exact !== undefined) {
    return exact;
  }

  for (let index = previewPathSegments(path).length - 1; index >= 1; index -= 1) {
    const prefix = previewPathSegments(path).slice(0, index).join(".");
    const suffix = previewPathSegments(path).slice(index).join(".");
    const parentValue = previewCompletedValue(action, prefix);
    const nested = previewDrillValue(parentValue, suffix);
    if (nested !== undefined) {
      return nested;
    }
  }

  return undefined;
}

function previewHasCompletedPath(action: PreviewAction, path: string): boolean {
  if (action.completedFields.includes(path)) {
    return true;
  }

  for (let index = previewPathSegments(path).length - 1; index >= 1; index -= 1) {
    const prefix = previewPathSegments(path).slice(0, index).join(".");
    const suffix = previewPathSegments(path).slice(index).join(".");
    if (!action.completedFields.includes(prefix)) {
      continue;
    }
    const parentValue = previewCompletedValue(action, prefix);
    if (previewDrillValue(parentValue, suffix) !== undefined) {
      return true;
    }
  }

  return false;
}

function previewCompletedChannelField(
  action: PreviewAction,
  channelId: "a" | "b",
  key: "enabled" | "intensityPercent" | "pulseName"
): unknown {
  const channels = previewValueAtPath(action, "args.channels");
  if (isPreviewRecord(channels)) {
    const channel = channels[channelId];
    if (isPreviewRecord(channel) && channel[key] !== undefined) {
      return channel[key];
    }
  }
  return previewValueAtPath(action, `args.channels.${channelId}.${key}`);
}

function previewHasCompletedChannelField(
  action: PreviewAction,
  channelId: "a" | "b",
  key: "enabled" | "intensityPercent" | "pulseName"
): boolean {
  const channels = previewValueAtPath(action, "args.channels");
  if (isPreviewRecord(channels)) {
    const channel = channels[channelId];
    if (isPreviewRecord(channel) && channel[key] !== undefined) {
      return true;
    }
  }
  return previewHasCompletedPath(action, `args.channels.${channelId}.${key}`);
}

function previewLabelForPath(path: string): string {
  switch (path) {
    case "args.command":
      return "命令";
    case "args.durationMs":
      return "持续时间";
    case "args.override":
      return "覆盖模式";
    default:
      return path.replace(/^args\./, "");
  }
}

function formatPreviewEStimPathValue(path: string, value: unknown): string {
  if (path === "args.command") {
    return value === "fire" ? "一键开火" : value === "set" ? "通道设置" : formatPreviewValue(value);
  }
  if (path === "args.durationMs") {
    return `${formatPreviewValue(value)} ms`;
  }
  if (path === "args.override") {
    return formatPreviewBoolean(value);
  }
  return formatPreviewValue(value);
}

function previewEStimMain(action: PreviewAction): string {
  const command = formatPreviewValue(previewValueAtPath(action, "args.command"));
  if (command === "fire") {
    return "角色准备触发一次带持续时间的一键开火。";
  }
  if (command) {
    return "角色正在调整电击器的通道强度或波形。";
  }
  if (previewValueAtPath(action, "args.channels") !== undefined || previewHasCompletedPath(action, "args.channels")) {
    return "角色正在补全电击器通道参数。";
  }
  if (
    previewValueAtPath(action, "args.durationMs") !== undefined
    || previewValueAtPath(action, "args.override") !== undefined
    || previewHasCompletedPath(action, "args.durationMs")
    || previewHasCompletedPath(action, "args.override")
  ) {
    return "角色正在补全电击器控制参数。";
  }
  return "";
}

function previewEStimDetails(action: PreviewAction): PreviewDetailRow[] {
  const rows: PreviewDetailRow[] = [];
  const command = formatPreviewValue(previewValueAtPath(action, "args.command"));
  if (command || previewHasCompletedPath(action, "args.command")) {
    rows.push({
      key: "args.command",
      label: "命令",
      value: command === "fire" ? "一键开火" : command === "set" ? "通道设置" : command
    });
  }

  for (const channelId of ["a", "b"] as const) {
    if (
      !previewHasCompletedPath(action, "args.channels")
      && !previewHasCompletedChannelField(action, channelId, "enabled")
      && !previewHasCompletedChannelField(action, channelId, "intensityPercent")
      && !previewHasCompletedChannelField(action, channelId, "pulseName")
    ) {
      continue;
    }
      const parts = [
        typeof previewCompletedChannelField(action, channelId, "enabled") === "boolean"
          ? `启用：${formatPreviewBoolean(previewCompletedChannelField(action, channelId, "enabled"))}`
          : undefined,
        previewCompletedChannelField(action, channelId, "intensityPercent") !== undefined
          ? `强度 ${formatPreviewValue(previewCompletedChannelField(action, channelId, "intensityPercent"))}%`
          : undefined,
        previewCompletedChannelField(action, channelId, "pulseName") !== undefined
          ? `波形 ${formatPreviewValue(previewCompletedChannelField(action, channelId, "pulseName"))}`
          : undefined
      ].filter((part): part is string => Boolean(part));
      rows.push({
        key: `args.channels.${channelId}`,
        label: `${channelId.toUpperCase()} 通道`,
        value: parts.join("；") || "本次未提供具体参数"
      });
  }

  const durationMs = previewValueAtPath(action, "args.durationMs");
  if (durationMs !== undefined || previewHasCompletedPath(action, "args.durationMs")) {
    rows.push({
      key: "args.durationMs",
      label: "持续时间",
      value: `${formatPreviewValue(durationMs)} ms`
    });
  }

  const override = previewValueAtPath(action, "args.override");
  if (override !== undefined || previewHasCompletedPath(action, "args.override")) {
    rows.push({
      key: "args.override",
      label: "覆盖模式",
      value: formatPreviewBoolean(override)
    });
  }

  if (rows.length === 0) {
    rows.push(
      ...action.completedFields
        .filter((path) => path.startsWith("args."))
        .map((path) => ({
          key: path,
          label: previewLabelForPath(path),
          value: formatPreviewEStimPathValue(path, previewCompletedValue(action, path))
        }))
        .filter((row) => row.value)
    );
  }

  if (rows.length > 0) {
    rows.push({
      key: "preview.execution",
      label: "本地执行",
      value: "等待正式提交"
    });
  }

  return rows;
}

function previewSceneDetails(action: PreviewAction): PreviewDetailRow[] {
  const rows: PreviewDetailRow[] = [
    buildPreviewSceneTextRow(action, "args.phase", "阶段", "正在生成阶段..."),
    buildPreviewSceneTextRow(action, "args.location", "地点", "正在生成地点..."),
    buildPreviewSceneTextRow(action, "args.summary", "概要", "正在生成场景概要...")
  ];

  const tension = formatPreviewValue(previewCompletedValue(action, "args.tension"));
  if (tension) {
    rows.splice(2, 0, {
      key: "args.tension",
      label: "张力",
      value: tension
    });
  }

  const activeObjectives = previewCompletedValue(action, "args.activeObjectives");
  if (Array.isArray(activeObjectives)) {
    rows.push(
      ...activeObjectives
        .map((item, index) => ({
          key: `args.activeObjectives.${index}`,
          label: "目标",
          value: formatPreviewValue(item)
        }))
        .filter((item) => item.value)
    );
  }

  return rows;
}

function buildPreviewSceneTextRow(
  action: PreviewAction,
  path: string,
  label: string,
  placeholder: string
): PreviewDetailRow {
  const text = previewTextByPath(action, path).trim();
  if (text) {
    return {
      key: path,
      label,
      value: text
    };
  }

  const completedValue = formatPreviewValue(previewCompletedValue(action, path)).trim();
  if (completedValue) {
    return {
      key: path,
      label,
      value: completedValue
    };
  }

  return {
    key: path,
    label,
    value: placeholder,
    pending: true
  };
}
</script>
