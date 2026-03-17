<template>
  <section v-if="session" class="console-page">
    <section class="console-hero panel">
      <div class="console-hero__main">
        <span class="eyebrow">Session Console</span>
        <h2>{{ session.title }}</h2>
        <p class="console-summary">{{ session.storyState.summary }}</p>
        <div v-if="isTickInFlight" class="thinking-indicator" role="status" aria-live="polite">
          <strong>Thinking</strong>
          <span class="thinking-indicator__dots" aria-hidden="true">
            <span />
            <span />
            <span />
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
          <RouterLink v-if="session" class="button secondary" :to="`/sessions/${session.id}/print`">
            打印 / 导出 PDF
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
        <EventTimeline :events="events" :active-pause="activePause" :automation-status="automationTimelineStatus" />
      </section>

      <aside class="console-sidebar">
        <section class="panel stack">
          <div class="section-head">
            <div>
              <span class="eyebrow">Interaction</span>
              <h3>输入区</h3>
            </div>
          </div>
          <textarea v-model="message" class="field textarea composer" rows="7" placeholder="输入你希望传达给场景中角色的话。" />
          <div class="actions actions--spread">
            <span class="soft-note">消息会发送给当前会话中的全部智能体</span>
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
  </section>
</template>

<script setup lang="ts">
import type { Session, SessionEvent } from "@dglab-ai/shared";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";
import EventTimeline from "../components/EventTimeline.vue";
import { hasInlineDelays, splitInlineDelays, stripInlineDelays } from "../lib/inlineDelays";

type ActivePauseState = {
  id: string;
  countdownLabel: string;
};

type PlaybackStep =
  | {
    type: "event";
    event: SessionEvent;
  }
  | {
    type: "pause";
    delayMs: number;
    event: SessionEvent;
  };

const route = useRoute();
const session = ref<Session | null>(null);
const events = ref<SessionEvent[]>([]);
const activePause = ref<ActivePauseState | null>(null);
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
let stream: EventSource | null = null;
let playbackTimer: number | null = null;
let countdownTimer: number | null = null;
let automationClockTimer: number | null = null;
let queueRunning = false;
let playbackGeneration = 0;
let pendingSleepResolve: (() => void) | null = null;
let localPauseId = 0;
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

const displayedEventCount = computed(() => events.value.length);
const isTickInFlight = computed(() => liveTickInFlight.value || Boolean(session.value?.timerState.inFlight));
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
    syncSession(await api.requestAutoTick(session.value.id));
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "自动推进触发失败";
  } finally {
    requestingAutoTick.value = false;
  }
}

async function loadSession() {
  const id = String(route.params.id);
  clearLivePlayback();
  syncSession(await api.getSession(id));
  events.value = (await api.getEvents(id)).map(normalizeTimelineEvent);
  liveTickInFlight.value = hasOpenTick(events.value);
  connectStream(id);
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
    enqueueLiveEvent(payload.event);
  });
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
      for (const step of expandPlaybackSteps(next)) {
        if (generation !== playbackGeneration) {
          return;
        }
        if (step.type === "pause") {
          events.value = [...events.value, step.event];
          await runPause(step.event, step.delayMs, generation);
          continue;
        }
        events.value = [...events.value, step.event];
      }
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

function expandPlaybackSteps(event: SessionEvent): PlaybackStep[] {
  const field = playbackFieldForEvent(event);
  if (!field) {
    return [{
      type: "event",
      event
    }];
  }

  const rawValue = event.payload[field];
  if (typeof rawValue !== "string" || !hasInlineDelays(rawValue)) {
    return [{
      type: "event",
      event
    }];
  }

  const steps: PlaybackStep[] = [];
  for (const part of splitInlineDelays(rawValue)) {
    if (part.type === "delay") {
      steps.push({
        type: "pause",
        delayMs: part.delayMs,
        event: createInlinePauseEvent(event, part.delayMs)
      });
      continue;
    }

    const text = part.text.trim();
    if (!text) {
      continue;
    }
    steps.push({
      type: "event",
      event: {
        ...event,
        payload: {
          ...event.payload,
          [field]: text
        }
      }
    });
  }

  if (steps.length > 0) {
    return steps;
  }

  return [{
    type: "event",
    event: {
      ...event,
      payload: {
        ...event.payload,
        [field]: stripInlineDelays(rawValue).trim()
      }
    }
  }];
}

function playbackFieldForEvent(event: SessionEvent): string | null {
  switch (event.type) {
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

function createInlinePauseEvent(event: SessionEvent, delayMs: number): SessionEvent {
  const pauseState = createInlinePauseState(event);
  return normalizeTimelineEvent({
    sessionId: event.sessionId,
    seq: event.seq,
    type: "system.wait_scheduled",
    source: "system",
    agentId: event.agentId,
    createdAt: new Date().toISOString(),
    payload: {
      speaker: event.payload.speaker,
      reason: pauseState.meta,
      delayMs,
      mode: "inline_pause",
      title: pauseState.title,
      main: pauseState.main,
      meta: pauseState.meta,
      uiPauseId: `local-pause:${localPauseId += 1}`
    }
  });
}

function createInlinePauseState(event: SessionEvent): { title: string; main: string; meta?: string } {
  const speaker = textOf(event.payload.speaker) || "对方";
  switch (event.type) {
    case "agent.speak_player":
      return {
        title: `${speaker} 停了一下`,
        main: `${speaker} 把话音压住半拍，像是在等你把那层意思自己听清。`,
        meta: "文本内节奏停顿"
      };
    case "agent.speak_agent":
      return {
        title: `${speaker} 稍作停顿`,
        main: `${speaker} 把话留在空气里片刻，像是故意给场中每个人一点反应时间。`,
        meta: "角色间对白停顿"
      };
    case "agent.stage_direction":
      return {
        title: "动作停在半空",
        main: `${speaker} 的动作没有立刻接下去，气氛被有意拉长了一瞬。`,
        meta: "舞台节奏停顿"
      };
    case "agent.story_effect":
      return {
        title: "气氛慢慢发酵",
        main: "那一点变化没有立刻散去，反而在沉默里更明显地漫开。",
        meta: "剧情效果停顿"
      };
    case "agent.reasoning":
      return {
        title: `${speaker} 还在拿捏节奏`,
        main: `${speaker} 没有立刻把下一步亮出来，像是在等这一拍先落进你心里。`,
        meta: "意图节奏停顿"
      };
    default:
      return {
        title: `${speaker} 停了一下`,
        main: "空气里短暂安静了一瞬，像是故意把余味留得更久一点。",
        meta: "文本内节奏停顿"
      };
  }
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

function pauseEventId(event: SessionEvent): string {
  return typeof event.payload.uiPauseId === "string" && event.payload.uiPauseId.trim()
    ? event.payload.uiPauseId
    : `pause:${event.seq}:${event.createdAt}`;
}

async function sendMessage() {
  if (!session.value) {
    return;
  }
  sending.value = true;
  error.value = "";
  try {
    await api.postMessage(session.value.id, message.value.trim());
    message.value = "";
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "发送失败";
  } finally {
    sending.value = false;
  }
}

async function retryTick() {
  if (!session.value) {
    return;
  }
  retrying.value = true;
  error.value = "";
  try {
    syncSession(await api.retrySession(session.value.id));
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

onMounted(() => {
  automationClockTimer = window.setInterval(() => {
    automationNow.value = Date.now();
    void maybeRequestAutoTick();
  }, 250);
  void loadSession();
});

onBeforeUnmount(() => {
  stream?.close();
  clearLivePlayback();
  if (automationClockTimer !== null) {
    window.clearInterval(automationClockTimer);
    automationClockTimer = null;
  }
});
</script>
