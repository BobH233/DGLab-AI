<template>
  <section v-if="session" class="console-page">
    <section class="console-hero panel">
      <div class="console-hero__main">
        <span class="eyebrow">Session Console</span>
        <h2>{{ session.title }}</h2>
        <p class="console-summary">{{ displaySummary }}</p>
        <div v-if="isTickInFlight" class="thinking-indicator" role="status" aria-live="polite">
          <span class="thinking-indicator__label">
            <strong>正在思考中</strong>
            <span class="thinking-indicator__dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </span>
        </div>
        <div v-if="latestTickFailure" class="inline-alert inline-alert--error">
          <strong>最近一次剧情推进失败</strong>
          <p>{{ latestTickFailure.message }}</p>
          <div class="actions actions--spread">
            <span class="soft-note">当前上下文已保留，可以直接重试这一轮推进。</span>
            <button class="button secondary" :disabled="retrying" @click="retryTick">
              {{ retrying ? "重试中..." : "重试推进" }}
            </button>
          </div>
        </div>
        <div class="actions console-hero__actions">
          <RouterLink
            v-if="session"
            class="button secondary"
            :to="`/sessions/${session.id}/print`"
          >
            打印预览 / 导出 PDF
          </RouterLink>
          <RouterLink v-if="session" class="button secondary" :to="`/sessions/${session.id}/debug`">
            记忆调试
          </RouterLink>
        </div>
      </div>
      <div class="console-hero__stats">
        <div class="metric-card">
          <span>阶段</span>
          <strong>{{ session.storyState.phase }}</strong>
        </div>
        <div class="metric-card">
          <span>地点</span>
          <strong>{{ session.storyState.location }}</strong>
        </div>
        <div class="metric-card">
          <span>张力</span>
          <strong>{{ session.storyState.tension }}/10</strong>
        </div>
        <div class="metric-card">
          <span>状态</span>
          <strong>{{ session.status }}</strong>
        </div>
      </div>
    </section>

    <div class="console-layout">
      <section class="panel console-stream">
        <div class="section-head">
          <div>
            <span class="eyebrow">Live Feed</span>
            <h3>剧情动态</h3>
          </div>
          <span class="soft-pill">{{ displayedEventCount }} 条事件</span>
        </div>
        <div v-if="liveReasoningSummary" class="reasoning-live-banner" role="status" aria-live="polite">
          <span class="reasoning-live-banner__kicker">思路摘要</span>
          <div ref="reasoningBannerBody" class="reasoning-live-banner__body">
            <p>{{ liveReasoningSummary }}</p>
          </div>
        </div>
        <EventTimeline
          :events="events"
          :active-pause="activePause"
          :automation-status="automationTimelineStatus"
          :device-execution-states="deviceExecutionStates"
          :agents="session?.confirmedSetup?.agents ?? session?.draft?.agents ?? []"
          :preview-turn="previewTurn"
        />
      </section>

      <aside class="console-sidebar">
        <section class="panel stack">
          <div class="section-head">
            <div>
              <span class="eyebrow">Body Items</span>
              <h3>玩家身体道具</h3>
            </div>
            <span class="soft-pill">{{ playerBodyItemState.length }} 项</span>
          </div>
          <div v-if="playerBodyItemState.length" class="state-list">
            <article
              v-for="item in playerBodyItemState"
              :key="item"
              class="state-card"
            >
              <p>{{ item }}</p>
            </article>
          </div>
          <p v-else class="soft-note">当前没有记录中的身体道具。</p>
        </section>

        <section class="panel stack">
          <div class="section-head">
            <div>
              <span class="eyebrow">Interaction</span>
              <h3>输入区</h3>
            </div>
          </div>
          <textarea
            v-model="message"
            class="field textarea composer"
            rows="7"
            placeholder="输入你希望传达给场景中角色的话。"
            @keydown="handleComposerKeydown"
          />
          <div class="actions actions--spread composer-actions">
            <span class="soft-note">Enter 发送，Shift + Enter 换行。消息会发送给当前会话中的全部智能体</span>
            <button class="button primary" :disabled="sending || !message.trim()" @click="sendMessage">
              {{ sending ? "发送中..." : "发送消息" }}
            </button>
          </div>
          <p v-if="error" class="error-text">{{ error }}</p>
        </section>

        <section class="panel stack">
          <div class="section-head">
            <div>
              <span class="eyebrow">Automation</span>
              <h3>自动推进</h3>
            </div>
            <span class="soft-pill">{{ timerEnabled ? "运行中" : "已停止" }}</span>
          </div>
          <label class="toggle-row">
            <div>
              <strong>启用自动推进</strong>
              <p>让场景按固定时间间隔自行推进。</p>
            </div>
            <input v-model="timerEnabled" type="checkbox" />
          </label>
          <label>
            <span>推进间隔</span>
            <input v-model.number="intervalMs" class="field" type="number" min="1000" step="500" />
          </label>
          <button class="button secondary button-block" @click="saveTimer">保存定时设置</button>
          <div v-if="session" class="timer-status-card" :data-busy="isTickInFlight ? 'true' : undefined">
            <strong>{{ automationCountdownLabel }}</strong>
            <p>{{ automationStatusNote }}</p>
          </div>
        </section>

        <section class="panel stack">
          <div class="section-head">
            <div>
              <span class="eyebrow">Usage</span>
              <h3>模型消耗</h3>
            </div>
          </div>
          <div class="usage-grid">
            <div class="usage-item">
              <span>调用次数</span>
              <strong>{{ session.usageTotals.session.calls }}</strong>
            </div>
            <div class="usage-item">
              <span>Prompt</span>
              <strong>{{ session.usageTotals.session.promptTokens }}</strong>
            </div>
            <div class="usage-item">
              <span>Completion</span>
              <strong>{{ session.usageTotals.session.completionTokens }}</strong>
            </div>
            <div class="usage-item">
              <span>Total</span>
              <strong>{{ session.usageTotals.session.totalTokens }}</strong>
            </div>
          </div>
        </section>

        <section class="panel stack">
          <div class="section-head">
            <div>
              <span class="eyebrow">Cast</span>
              <h3>参与角色</h3>
            </div>
          </div>
          <div class="cast-list">
            <article
              v-for="agent in agentCards"
              :key="agent.id"
              class="cast-card"
            >
              <div class="cast-card__head">
                <strong>{{ agent.name }}</strong>
                <span class="soft-pill">{{ agent.role }}</span>
              </div>
              <p>{{ agent.summary }}</p>
            </article>
          </div>
        </section>
      </aside>
    </div>

    <section
      v-if="showElectroStimViewer"
      ref="electroStimOverlay"
      class="e-stim-floating-overlay"
      :class="{ 'e-stim-floating-overlay--collapsed': isElectroStimViewerCollapsed }"
      :style="electroStimOverlayStyle"
      data-testid="e-stim-floating-overlay"
    >
      <header
        class="e-stim-floating-overlay__dragbar"
        role="button"
        :aria-expanded="!isElectroStimViewerCollapsed"
        @pointerdown="handleElectroStimDragStart"
        @pointermove="handleElectroStimDragMove"
        @pointerup="handleElectroStimDragEnd"
        @pointercancel="handleElectroStimDragEnd"
      >
        <div
          v-if="isElectroStimViewerCollapsed"
          class="e-stim-floating-overlay__collapsed-pill"
        >
          <span class="e-stim-floating-overlay__mini-icon" aria-hidden="true">E</span>
          <div class="e-stim-floating-overlay__dragtext">
            <strong>电击器</strong>
            <span class="e-stim-floating-overlay__draghint">点击展开 / 拖动</span>
          </div>
        </div>
        <template v-else>
          <div class="e-stim-floating-overlay__dragtext">
            <span class="eyebrow">Local Viewer</span>
            <strong>情趣电击器面板</strong>
            <span class="e-stim-floating-overlay__draghint">点击收起，拖动这里移动浮窗</span>
          </div>
          <small v-if="electroStimViewerConnection">{{ electroStimViewerConnection.clientId }}</small>
        </template>
      </header>
      <div v-if="!isElectroStimViewerCollapsed" class="e-stim-floating-overlay__frame">
        <iframe
          :src="electroStimViewerUrl"
          title="情趣电击器双通道监视窗"
          class="e-stim-floating-overlay__iframe"
          allowtransparency="true"
          loading="lazy"
          referrerpolicy="no-referrer"
        />
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { isToolEnabled, type Session, type SessionEvent, type ToolContext } from "@dglab-ai/shared";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";
import EventTimeline from "../components/EventTimeline.vue";
import {
  applyElectroStimToolEvent,
  buildElectroStimToolContext,
  loadElectroStimExecutionStateMap,
  loadElectroStimLocalConfig,
  parseGameConnectionCode,
  saveElectroStimExecutionStateMap,
  syncElectroStimToolContext
} from "../lib/eStim";
import { stripInlineDelays } from "../lib/inlineDelays";
import { executionKeyForEvent, type DeviceExecutionState } from "../lib/timelinePresentation";
import {
  applyPreviewEvent,
  previewTurnFromSnapshot,
  shouldClearPreviewOnCommittedEvent,
  type PreviewTurnState
} from "../lib/previewTurnState";

type ActivePauseState = {
  id: string;
  countdownLabel: string;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  moved: boolean;
};

type ElectroStimOverlayPosition = {
  x: number;
  y: number;
};

const ELECTRO_STIM_OVERLAY_POSITION_KEY = "dglabai.e_stim_overlay_position";
const ELECTRO_STIM_OVERLAY_COLLAPSED_KEY = "dglabai.e_stim_overlay_collapsed";

const route = useRoute();
const session = ref<Session | null>(null);
const events = ref<SessionEvent[]>([]);
const activePause = ref<ActivePauseState | null>(null);
const previewTurn = ref<PreviewTurnState | null>(null);
const message = ref("");
const sending = ref(false);
const retrying = ref(false);
const error = ref("");
const timerEnabled = ref(false);
const intervalMs = ref(10000);
const automationNow = ref(Date.now());
const requestingAutoTick = ref(false);
const liveTickInFlight = ref(false);
const pendingAutomationCooldown = ref(false);
const playbackCooldownUntil = ref<number | null>(null);
const deviceExecutionStates = ref<Record<string, DeviceExecutionState>>({});
const reasoningBannerBody = ref<HTMLDivElement | null>(null);
const electroStimOverlay = ref<HTMLDivElement | null>(null);
const electroStimLocalConfig = ref(loadElectroStimLocalConfig());
const electroStimOverlayPosition = ref<ElectroStimOverlayPosition>({
  x: 24,
  y: 132
});
const electroStimDragState = ref<DragState | null>(null);
const isElectroStimViewerCollapsed = ref(loadStoredElectroStimOverlayCollapsed());
let stream: EventSource | null = null;
let playbackTimer: number | null = null;
let countdownTimer: number | null = null;
let automationClockTimer: number | null = null;
let queueRunning = false;
let playbackGeneration = 0;
let pendingSleepResolve: (() => void) | null = null;
const liveQueue: SessionEvent[] = [];

const agentCards = computed(() => {
  const agents = session.value?.confirmedSetup?.agents ?? session.value?.draft.agents ?? [];
  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role === "director" ? "主导者" : "辅助者",
    summary: agent.summary
  }));
});
const displaySummary = computed(() => stripInlineDelays(session.value?.storyState.summary ?? ""));
const playerBodyItemState = computed(() => session.value?.playerBodyItemState ?? []);
const liveReasoningSummary = computed(() => stripInlineDelays(previewTurn.value?.reasoningSummaryText ?? "").trim());
const electroStimViewerConnection = computed(() => parseGameConnectionCode(electroStimLocalConfig.value.gameConnectionCode));
const showElectroStimViewer = computed(() => sessionUsesElectroStimTool() && Boolean(electroStimViewerConnection.value));
const electroStimViewerUrl = computed(() => {
  const connection = electroStimViewerConnection.value;
  if (!connection) {
    return "";
  }
  const viewerUrl = new URL("/viewer.html", `${connection.baseUrl}/`);
  viewerUrl.searchParams.set("clientId", connection.clientId);
  viewerUrl.searchParams.set("layout", "dual");
  viewerUrl.hash = "/";
  return viewerUrl.toString();
});
const electroStimOverlayStyle = computed(() => ({
  left: `${electroStimOverlayPosition.value.x}px`,
  top: `${electroStimOverlayPosition.value.y}px`
}));

const displayedEventCount = computed(() => events.value.length);
const isTickInFlight = computed(() => (
  liveTickInFlight.value
  || Boolean(session.value?.timerState.inFlight)
  || previewTurn.value?.status === "streaming"
));
const automationDueAt = computed(() => {
  if (!session.value || !session.value.timerState.enabled) {
    return null;
  }
  const dueCandidates = [
    session.value.timerState.nextTickAt ? Date.parse(session.value.timerState.nextTickAt) : Number.NaN,
    playbackCooldownUntil.value ?? Number.NaN
  ].filter((value) => Number.isFinite(value));
  if (dueCandidates.length === 0) {
    return null;
  }
  return Math.max(...dueCandidates);
});
const automationCountdownLabel = computed(() => {
  if (!session.value || !session.value.timerState.enabled) {
    return "自动推进未启用";
  }
  if (pendingAutomationCooldown.value) {
    return "演出结束后开始计时";
  }
  if (automationDueAt.value === null) {
    return `每 ${formatPauseMs(session.value.timerState.intervalMs)} 自动推进一次`;
  }
  const remaining = automationDueAt.value - automationNow.value;
  if (remaining > 0) {
    return `约 ${formatPauseMs(remaining)} 后自动推进`;
  }
  return isTickInFlight.value ? "模型推理中，自动推进已顺延" : "即将自动推进";
});
const automationStatusNote = computed(() => {
  if (!session.value || !session.value.timerState.enabled) {
    return "保存后会按固定时间间隔继续场景。";
  }
  if (isTickInFlight.value) {
    return `当前轮还没结束；如果计时到点，会顺延 ${formatPauseMs(session.value.timerState.intervalMs)}，不会并发触发。`;
  }
  if (pendingAutomationCooldown.value) {
    return "当前消息和停顿还在演出，全部演出结束后才开始自动推进倒计时。";
  }
  if (automationDueAt.value !== null) {
    return `下一次计划触发时间：${formatClockTime(new Date(automationDueAt.value).toISOString())}`;
  }
  return `当前按 ${formatPauseMs(session.value.timerState.intervalMs)} 的间隔运行。`;
});
const automationTimelineStatus = computed(() => {
  if (!session.value || !session.value.timerState.enabled) {
    return null;
  }
  return {
    title: automationCountdownLabel.value,
    meta: pendingAutomationCooldown.value ? "自动推进" : undefined,
    live: isTickInFlight.value || pendingAutomationCooldown.value
  };
});
const latestTickFailure = computed(() => {
  for (let index = events.value.length - 1; index >= 0; index -= 1) {
    const event = events.value[index];
    if (event.type === "system.tick_failed") {
      return {
        message: textOf(event.payload.message) || "模型调用失败，当前轮次未能完成。",
        reason: textOf(event.payload.reason),
        retryable: textOf(event.payload.retryable) !== "false"
      };
    }
    if (event.type === "system.tick_completed" || event.type === "system.story_ended") {
      return null;
    }
  }
  return null;
});

function syncSession(next: Session) {
  session.value = next;
  timerEnabled.value = next.timerState.enabled;
  intervalMs.value = next.timerState.intervalMs;
  if (!next.timerState.enabled || next.status !== "active") {
    pendingAutomationCooldown.value = false;
    playbackCooldownUntil.value = null;
  }
  liveTickInFlight.value = next.timerState.inFlight;
}

async function maybeRequestAutoTick() {
  if (
    !session.value ||
    session.value.status !== "active" ||
    !session.value.timerState.enabled ||
    isTickInFlight.value ||
    pendingAutomationCooldown.value ||
    requestingAutoTick.value
  ) {
    return;
  }
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return;
  }

  if (automationDueAt.value !== null && automationDueAt.value > automationNow.value) {
    return;
  }

  requestingAutoTick.value = true;
  try {
    syncSession(await api.requestAutoTick(session.value.id, await buildLiveToolContext()));
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "自动推进触发失败";
  } finally {
    requestingAutoTick.value = false;
  }
}

async function loadSession() {
  const id = String(route.params.id);
  clearLivePlayback();
  previewTurn.value = null;
  deviceExecutionStates.value = loadElectroStimExecutionStateMap(id);
  refreshElectroStimLocalConfig();
  connectStream(id);
  const [nextSession, nextEvents] = await Promise.all([
    api.getSession(id),
    api.getEvents(id)
  ]);
  syncSession(nextSession);
  events.value = mergeTimelineEvents(events.value, nextEvents.map(normalizeTimelineEvent));
  liveTickInFlight.value = hasOpenTick(events.value) || Boolean(nextSession.timerState.inFlight);
}

function connectStream(sessionId: string) {
  stream?.close();
  stream = new EventSource(api.streamUrl(sessionId));
  stream.addEventListener("session.updated", (event) => {
    const payload = JSON.parse((event as MessageEvent).data) as { session: Session };
    syncSession(payload.session);
  });
  stream.addEventListener("event.appended", (event) => {
    const payload = JSON.parse((event as MessageEvent).data) as { event: SessionEvent };
    trackLiveTick(payload.event);
    if (shouldClearPreviewOnCommittedEvent(payload.event.type)) {
      previewTurn.value = null;
    }
    enqueueLiveEvent(payload.event);
  });
  stream.addEventListener("llm.preview.snapshot", (event) => {
    const payload = JSON.parse((event as MessageEvent).data) as Record<string, unknown>;
    previewTurn.value = previewTurnFromSnapshot(payload);
  });
  for (const eventType of [
    "llm.turn.started",
    "llm.action.started",
    "llm.action.meta",
    "llm.action.text.delta",
    "llm.action.field.completed",
    "llm.action.completed",
    "llm.reasoning_summary.delta",
    "llm.turn.control",
    "llm.turn.player_body_item_state",
    "llm.turn.completed",
    "llm.turn.failed"
  ]) {
    stream.addEventListener(eventType, (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as Record<string, unknown>;
      previewTurn.value = applyPreviewEvent(previewTurn.value, eventType, payload);
    });
  }
  stream.addEventListener("error", () => {
    error.value = "实时连接已断开，请刷新页面重试。";
  });
}

function enqueueLiveEvent(event: SessionEvent) {
  const normalized = normalizeTimelineEvent(event);
  if (
    events.value.some((item) => isSameTimelineEvent(item, normalized)) ||
    liveQueue.some((item) => isSameTimelineEvent(item, normalized))
  ) {
    return;
  }
  liveQueue.push(normalized);
  void flushLiveQueue();
}

async function flushLiveQueue() {
  if (queueRunning) {
    return;
  }
  const generation = playbackGeneration;
  queueRunning = true;
  try {
    while (liveQueue.length > 0) {
      if (generation !== playbackGeneration) {
        return;
      }
      const next = liveQueue.shift();
      if (!next) {
        continue;
      }
      if (next.type === "system.wait_scheduled") {
        events.value = [...events.value, next];
        await runPause(next, Number(next.payload.delayMs ?? 0), generation);
        continue;
      }
      events.value = [...events.value, next];
      void maybeExecuteDeviceControl(next);
    }
  } finally {
    queueRunning = false;
    maybeStartAutomationCooldown();
    if (liveQueue.length > 0) {
      void flushLiveQueue();
    }
  }
}

async function runPause(event: SessionEvent, delayMs: number, generation: number) {
  activatePause(event, delayMs);
  if (delayMs > 0) {
    await sleep(delayMs);
    if (generation !== playbackGeneration) {
      return;
    }
  }
  clearActivePause();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    pendingSleepResolve = resolve;
    playbackTimer = window.setTimeout(() => {
      playbackTimer = null;
      pendingSleepResolve = null;
      resolve();
    }, ms);
  });
}

function activatePause(event: SessionEvent, delayMs: number) {
  const startedAt = Date.now();
  const initialLabel = `约 ${formatPauseMs(delayMs)} 后继续`;
  activePause.value = {
    id: pauseEventId(event),
    countdownLabel: initialLabel
  };
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer);
  }
  if (delayMs <= 0) {
    return;
  }
  countdownTimer = window.setInterval(() => {
    const remaining = Math.max(0, delayMs - (Date.now() - startedAt));
    const nextLabel = remaining > 0 ? `约 ${formatPauseMs(remaining)} 后继续` : "即将继续";
    if (activePause.value && activePause.value.countdownLabel !== nextLabel) {
      activePause.value.countdownLabel = nextLabel;
    }
    if (remaining <= 0 && countdownTimer !== null) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 250);
}

function clearActivePause() {
  activePause.value = null;
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
  maybeStartAutomationCooldown();
}

function clearLivePlayback() {
  playbackGeneration += 1;
  liveQueue.length = 0;
  queueRunning = false;
  liveTickInFlight.value = false;
  previewTurn.value = null;
  pendingAutomationCooldown.value = false;
  playbackCooldownUntil.value = null;
  clearActivePause();
  if (playbackTimer !== null) {
    window.clearTimeout(playbackTimer);
    playbackTimer = null;
  }
  pendingSleepResolve?.();
  pendingSleepResolve = null;
}

function hasOpenTick(sourceEvents: SessionEvent[]): boolean {
  let running = false;
  for (const event of sourceEvents) {
    if (event.type === "system.tick_started") {
      running = true;
      continue;
    }
    if (
      event.type === "system.tick_completed" ||
      event.type === "system.tick_failed" ||
      event.type === "system.story_ended"
    ) {
      running = false;
    }
  }
  return running;
}

function trackLiveTick(event: SessionEvent) {
  if (event.type === "system.tick_started") {
    liveTickInFlight.value = true;
    pendingAutomationCooldown.value = false;
    playbackCooldownUntil.value = null;
    return;
  }
  if (
    event.type === "system.tick_completed" ||
    event.type === "system.tick_failed" ||
    event.type === "system.story_ended"
  ) {
    liveTickInFlight.value = false;
    if (session.value?.timerState.enabled) {
      pendingAutomationCooldown.value = true;
      playbackCooldownUntil.value = null;
      maybeStartAutomationCooldown();
    }
  }
}

function maybeStartAutomationCooldown() {
  if (
    !pendingAutomationCooldown.value ||
    !session.value?.timerState.enabled ||
    liveTickInFlight.value ||
    queueRunning ||
    liveQueue.length > 0 ||
    activePause.value
  ) {
    return;
  }
  playbackCooldownUntil.value = Date.now() + session.value.timerState.intervalMs;
  pendingAutomationCooldown.value = false;
}

function textOf(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return stripInlineDelays(String(value));
}

function formatPauseMs(ms: number): string {
  if (ms >= 1000) {
    const seconds = Math.max(0.1, ms / 1000);
    return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} 秒`;
  }
  return `${Math.max(0, Math.round(ms))} ms`;
}

function formatClockTime(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function normalizeTimelineEvent(event: SessionEvent): SessionEvent {
  if (event.type !== "system.wait_scheduled") {
    return event;
  }
  const existingPauseId = typeof event.payload.uiPauseId === "string" ? event.payload.uiPauseId.trim() : "";
  return {
    ...event,
    payload: {
      ...event.payload,
      uiPauseId: existingPauseId || `pause:${event.seq}:${event.createdAt}`
    }
  };
}

function isSameTimelineEvent(left: SessionEvent, right: SessionEvent): boolean {
  return left.seq === right.seq && left.type === right.type && left.createdAt === right.createdAt;
}

function mergeTimelineEvents(existing: SessionEvent[], incoming: SessionEvent[]): SessionEvent[] {
  const merged = [...existing];
  for (const event of incoming) {
    if (!merged.some((item) => isSameTimelineEvent(item, event))) {
      merged.push(event);
    }
  }
  return merged.sort((left, right) => {
    if (left.seq !== right.seq) {
      return left.seq - right.seq;
    }
    return Date.parse(left.createdAt) - Date.parse(right.createdAt);
  });
}

function pauseEventId(event: SessionEvent): string {
  return typeof event.payload.uiPauseId === "string" && event.payload.uiPauseId.trim()
    ? event.payload.uiPauseId
    : `pause:${event.seq}:${event.createdAt}`;
}

function refreshElectroStimLocalConfig() {
  electroStimLocalConfig.value = loadElectroStimLocalConfig();
}

function currentSessionId(): string {
  return session.value?.id ?? String(route.params.id);
}

function refreshPersistedDeviceExecutionStates() {
  deviceExecutionStates.value = loadElectroStimExecutionStateMap(currentSessionId());
}

function persistDeviceExecutionStates() {
  saveElectroStimExecutionStateMap(currentSessionId(), deviceExecutionStates.value);
}

function setDeviceExecutionState(executionKey: string, nextState: DeviceExecutionState) {
  deviceExecutionStates.value = {
    ...deviceExecutionStates.value,
    [executionKey]: nextState
  };
  persistDeviceExecutionStates();
}

function getOverlayStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  if (typeof window === "undefined") {
    return null;
  }
  const storage = window.localStorage as Partial<Storage> | undefined;
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    return null;
  }
  return {
    getItem: storage.getItem.bind(storage),
    setItem: storage.setItem.bind(storage)
  };
}

function loadStoredElectroStimOverlayPosition(): ElectroStimOverlayPosition | null {
  const storage = getOverlayStorage();
  if (!storage) {
    return null;
  }
  const raw = storage.getItem(ELECTRO_STIM_OVERLAY_POSITION_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ElectroStimOverlayPosition>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") {
      return null;
    }
    return {
      x: parsed.x,
      y: parsed.y
    };
  } catch {
    return null;
  }
}

function persistElectroStimOverlayPosition(position: ElectroStimOverlayPosition) {
  const storage = getOverlayStorage();
  if (!storage) {
    return;
  }
  storage.setItem(ELECTRO_STIM_OVERLAY_POSITION_KEY, JSON.stringify(position));
}

function loadStoredElectroStimOverlayCollapsed(): boolean {
  const storage = getOverlayStorage();
  if (!storage) {
    return false;
  }
  return storage.getItem(ELECTRO_STIM_OVERLAY_COLLAPSED_KEY) === "true";
}

function persistElectroStimOverlayCollapsed(collapsed: boolean) {
  const storage = getOverlayStorage();
  if (!storage) {
    return;
  }
  storage.setItem(ELECTRO_STIM_OVERLAY_COLLAPSED_KEY, String(collapsed));
}

function clampElectroStimOverlayPosition(nextX: number, nextY: number): { x: number; y: number } {
  if (typeof window === "undefined") {
    return { x: nextX, y: nextY };
  }
  const margin = window.innerWidth <= 680 ? 12 : 20;
  const width = electroStimOverlay.value?.offsetWidth ?? Math.min(520, Math.max(280, window.innerWidth - (margin * 2)));
  const height = electroStimOverlay.value?.offsetHeight ?? 380;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  return {
    x: Math.min(Math.max(margin, nextX), maxX),
    y: Math.min(Math.max(margin, nextY), maxY)
  };
}

function syncElectroStimOverlayWithinViewport() {
  electroStimOverlayPosition.value = clampElectroStimOverlayPosition(
    electroStimOverlayPosition.value.x,
    electroStimOverlayPosition.value.y
  );
  persistElectroStimOverlayPosition(electroStimOverlayPosition.value);
}

function resetElectroStimOverlayPosition() {
  if (typeof window === "undefined") {
    return;
  }
  const storedPosition = loadStoredElectroStimOverlayPosition();
  const margin = window.innerWidth <= 680 ? 12 : 20;
  const width = electroStimOverlay.value?.offsetWidth ?? Math.min(520, Math.max(280, window.innerWidth - (margin * 2)));
  electroStimOverlayPosition.value = clampElectroStimOverlayPosition(
    storedPosition?.x ?? (window.innerWidth - width - margin),
    storedPosition?.y ?? 120
  );
  persistElectroStimOverlayPosition(electroStimOverlayPosition.value);
}

function handleElectroStimDragStart(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }
  electroStimDragState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - electroStimOverlayPosition.value.x,
    offsetY: event.clientY - electroStimOverlayPosition.value.y,
    moved: false
  };
  const handle = event.currentTarget as HTMLElement | null;
  handle?.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function handleElectroStimDragMove(event: PointerEvent) {
  const dragState = electroStimDragState.value;
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }
  if (!dragState.moved) {
    const deltaX = Math.abs(event.clientX - dragState.startX);
    const deltaY = Math.abs(event.clientY - dragState.startY);
    if (Math.max(deltaX, deltaY) < 6) {
      return;
    }
    dragState.moved = true;
  }
  electroStimOverlayPosition.value = clampElectroStimOverlayPosition(
    event.clientX - dragState.offsetX,
    event.clientY - dragState.offsetY
  );
}

async function handleElectroStimDragEnd(event: PointerEvent) {
  const dragState = electroStimDragState.value;
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }
  const handle = event.currentTarget as HTMLElement | null;
  if (handle?.hasPointerCapture?.(event.pointerId)) {
    handle.releasePointerCapture(event.pointerId);
  }
  electroStimDragState.value = null;
  if (!dragState.moved) {
    isElectroStimViewerCollapsed.value = !isElectroStimViewerCollapsed.value;
    await nextTick();
    syncElectroStimOverlayWithinViewport();
    return;
  }
  persistElectroStimOverlayPosition(electroStimOverlayPosition.value);
}

function sessionUsesElectroStimTool(): boolean {
  return Boolean(
    session.value?.llmConfigSnapshot
    && isToolEnabled("control_e_stim_toy", session.value.llmConfigSnapshot.toolStates)
  );
}

function hasMeaningfulElectroStimConfig(): boolean {
  const config = loadElectroStimLocalConfig();
  return Boolean(
    config.gameConnectionCode.trim()
    || config.allowedPulseIds.length > 0
    || config.channelPlacements.a.trim()
    || config.channelPlacements.b.trim()
  );
}

async function buildLiveToolContext(): Promise<ToolContext | undefined> {
  if (!sessionUsesElectroStimTool() || !hasMeaningfulElectroStimConfig()) {
    return undefined;
  }
  const localConfig = loadElectroStimLocalConfig();
  try {
    if (parseGameConnectionCode(localConfig.gameConnectionCode)) {
      return await syncElectroStimToolContext(localConfig);
    }
  } catch {
    return buildElectroStimToolContext(localConfig);
  }
  return buildElectroStimToolContext(localConfig);
}

async function maybeExecuteDeviceControl(event: SessionEvent) {
  if (
    event.type !== "agent.device_control"
    || event.payload.action !== "control_e_stim_toy"
  ) {
    return;
  }
  const executionKey = executionKeyForEvent(event);
  setDeviceExecutionState(executionKey, {
    status: "pending",
    detail: "等待本地前端执行。",
    startedAt: new Date().toISOString(),
    exchanges: []
  });
  const result = await applyElectroStimToolEvent(loadElectroStimLocalConfig(), event.payload);
  setDeviceExecutionState(executionKey, {
    status: result.status,
    detail: result.detail,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    exchanges: result.exchanges ?? []
  });
  if (result.toolContext && session.value) {
    syncSession({
      ...session.value,
      toolContext: {
        ...(session.value.toolContext ?? {}),
        ...result.toolContext
      }
    });
  }
}

function handleWindowStorage() {
  refreshElectroStimLocalConfig();
  refreshPersistedDeviceExecutionStates();
}

async function sendMessage() {
  if (!session.value) {
    return;
  }
  sending.value = true;
  error.value = "";
  try {
    await api.postMessage(session.value.id, message.value.trim(), await buildLiveToolContext());
    message.value = "";
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "发送失败";
  } finally {
    sending.value = false;
  }
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.shiftKey) {
    return;
  }
  if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }
  event.preventDefault();
  if (sending.value || !message.value.trim()) {
    return;
  }
  void sendMessage();
}

async function retryTick() {
  if (!session.value) {
    return;
  }
  retrying.value = true;
  error.value = "";
  try {
    syncSession(await api.retrySession(session.value.id, await buildLiveToolContext()));
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "重试失败";
  } finally {
    retrying.value = false;
  }
}

async function saveTimer() {
  if (!session.value) {
    return;
  }
  error.value = "";
  try {
    const next = await api.updateTimer(session.value.id, {
      enabled: timerEnabled.value,
      intervalMs: intervalMs.value
    });
    syncSession(next);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "保存失败";
  }
}

watch(() => route.params.id, () => {
  void loadSession();
});

watch(showElectroStimViewer, async (value) => {
  if (!value) {
    electroStimDragState.value = null;
    return;
  }
  isElectroStimViewerCollapsed.value = loadStoredElectroStimOverlayCollapsed();
  await nextTick();
  resetElectroStimOverlayPosition();
});

watch(isElectroStimViewerCollapsed, async () => {
  persistElectroStimOverlayCollapsed(isElectroStimViewerCollapsed.value);
  if (!showElectroStimViewer.value) {
    return;
  }
  await nextTick();
  syncElectroStimOverlayWithinViewport();
});

watch(liveReasoningSummary, async (value) => {
  if (!value) {
    return;
  }
  await nextTick();
  const element = reasoningBannerBody.value;
  if (!element) {
    return;
  }
  element.scrollTop = element.scrollHeight;
});

onMounted(() => {
  refreshElectroStimLocalConfig();
  refreshPersistedDeviceExecutionStates();
  window.addEventListener("focus", refreshElectroStimLocalConfig);
  window.addEventListener("storage", handleWindowStorage);
  window.addEventListener("resize", syncElectroStimOverlayWithinViewport);
  automationClockTimer = window.setInterval(() => {
    automationNow.value = Date.now();
    void maybeRequestAutoTick();
  }, 250);
  void loadSession();
});

onBeforeUnmount(() => {
  stream?.close();
  clearLivePlayback();
  window.removeEventListener("focus", refreshElectroStimLocalConfig);
  window.removeEventListener("storage", handleWindowStorage);
  window.removeEventListener("resize", syncElectroStimOverlayWithinViewport);
  if (automationClockTimer !== null) {
    window.clearInterval(automationClockTimer);
    automationClockTimer = null;
  }
});
</script>
