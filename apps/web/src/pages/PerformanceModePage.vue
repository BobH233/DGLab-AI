<template>
  <section v-if="session && ttsPerformance" class="performance-page">
    <section class="panel performance-hero">
      <div class="performance-hero__copy">
        <span class="eyebrow">Performance Mode</span>
        <h2>{{ session.title }}</h2>
        <p class="soft-note">
          把当前会话当成一部可连续收听的小说来播放。页面会先检查全部可朗读内容是否已经缓存好，再按统一时间轴进行播放。
        </p>
      </div>
      <div class="performance-hero__actions">
        <RouterLink class="button secondary" :to="`/sessions/${session.id}`">返回会话</RouterLink>
        <RouterLink class="button secondary" :to="`/sessions/${session.id}/print`">打印预览</RouterLink>
      </div>
    </section>

    <div class="performance-layout">
      <aside class="performance-sidebar">
        <section class="panel stack">
          <div class="section-head">
            <div>
              <span class="eyebrow">Coverage</span>
              <h3>全文 TTS 就绪状态</h3>
            </div>
            <span class="soft-pill">{{ overallProgressLabel }}</span>
          </div>
          <div class="performance-progress">
            <span :style="{ width: `${overallProgressPercent}%` }" />
          </div>
          <div class="performance-metric-grid">
            <article class="performance-metric-card">
              <span>可朗读卡片</span>
              <strong>{{ ttsPerformance.totalReadableCount }}</strong>
            </article>
            <article class="performance-metric-card">
              <span>已缓存</span>
              <strong>{{ ttsPerformance.cachedReadableCount }}</strong>
            </article>
            <article class="performance-metric-card">
              <span>可直接播放</span>
              <strong>{{ ttsPerformance.readyReadableCount }}</strong>
            </article>
            <article class="performance-metric-card">
              <span>待补齐</span>
              <strong>{{ ttsPerformance.missingReadableCount }}</strong>
            </article>
          </div>
          <div v-if="!ttsPerformance.ttsBaseUrlConfigured" class="inline-alert inline-alert--error">
            <strong>TTS 服务尚未配置</strong>
            <p>请先在设置页填写 TTS API 地址，再回来生成全文缓存。</p>
          </div>
          <div v-else-if="ttsPerformance.missingVoiceSpeakers.length" class="inline-alert inline-alert--error">
            <strong>音色映射还不完整</strong>
            <p>以下角色还没有配置可用音色：{{ ttsPerformance.missingVoiceSpeakers.join("、") }}。</p>
          </div>
          <div v-else-if="ttsPerformance.readyForFullPlayback" class="inline-alert inline-alert--success">
            <strong>已经可以开始演出</strong>
            <p>当前会话的可朗读内容都已经准备好，可以直接使用下方播放条收听全文。</p>
          </div>
          <div v-else class="inline-alert inline-alert--info">
            <strong>还不能开始全文播放</strong>
            <p>需要先把缺失的卡片继续批量生成并缓存完成，全文播放条才会解锁。</p>
          </div>
          <div class="actions">
            <button
              v-if="ttsPerformance.batchJob?.status === 'running'"
              class="button secondary button-block"
              type="button"
              @click="cancelBatch"
            >
              停止当前批量生成
            </button>
            <button
              v-else
              class="button primary button-block"
              type="button"
              :disabled="!canStartBatch"
              @click="startBatch"
            >
              {{ ttsPerformance.readyForFullPlayback ? "重新检查全文缓存" : "生成缺失的全文 TTS" }}
            </button>
          </div>
          <div v-if="ttsPerformance.batchJob" class="performance-batch-card">
            <div class="performance-batch-card__head">
              <strong>{{ batchStatusTitle }}</strong>
              <div class="performance-batch-card__actions">
                <span>{{ batchProgressLabel }}</span>
                <button
                  v-if="canDismissBatchNotice"
                  class="button ghost performance-batch-card__dismiss"
                  type="button"
                  @click="dismissBatchNotice"
                >
                  关闭提示
                </button>
              </div>
            </div>
            <div class="performance-progress performance-progress--compact">
              <span :style="{ width: `${batchProgressPercent}%` }" />
            </div>
            <p v-if="runningBatchCurrentTitle" class="soft-note">
              当前处理：{{ runningBatchCurrentTitle }}
            </p>
            <p v-if="visibleBatchErrorMessage" class="error-text">{{ visibleBatchErrorMessage }}</p>
          </div>
          <p v-if="error" class="error-text">{{ error }}</p>
        </section>

        <section class="panel stack">
          <div class="section-head">
            <div>
              <span class="eyebrow">Playback</span>
              <h3>演出参数</h3>
            </div>
          </div>
          <label>
            <span>卡片间隔</span>
            <input
              v-model.number="gapMs"
              class="field"
              type="number"
              min="0"
              max="10000"
              step="100"
            />
          </label>
          <p class="soft-note">
            这个间隔会加入虚拟总时长，用于模拟上一张卡片结束后到下一张开始前的停顿。
          </p>
          <label class="toggle-row performance-toggle-row">
            <div>
              <strong>朗读舞台动作</strong>
              <p>关闭后会跳过所有“舞台动作”卡片，并立即重算总时长、当前时间和进度条。</p>
            </div>
            <input
              v-model="includeStageDirections"
              data-testid="performance-stage-direction-toggle"
              type="checkbox"
            />
          </label>
          <label class="toggle-row performance-toggle-row">
            <div>
              <strong>朗读剧情变化</strong>
              <p>关闭后会跳过所有“剧情变化”卡片，全文播放会按新的时间轴继续。</p>
            </div>
            <input
              v-model="includeStoryEffects"
              data-testid="performance-story-effect-toggle"
              type="checkbox"
            />
          </label>
          <div
            class="inline-alert"
            :class="selectionReadyForPlayback ? 'inline-alert--success' : 'inline-alert--info'"
          >
            <strong>{{ selectionPlaybackTitle }}</strong>
            <p>{{ selectionPlaybackMessage }}</p>
          </div>
          <div class="performance-metric-grid performance-metric-grid--compact">
            <article class="performance-metric-card">
              <span>参与播放</span>
              <strong>{{ selectedReadableCount }}</strong>
            </article>
            <article class="performance-metric-card">
              <span>已跳过</span>
              <strong>{{ skippedReadableCount }}</strong>
            </article>
            <article class="performance-metric-card">
              <span>总时长</span>
              <strong data-testid="performance-total-duration">{{ totalDurationLabel }}</strong>
            </article>
            <article class="performance-metric-card">
              <span>当前</span>
              <strong>{{ playheadLabel }}</strong>
            </article>
          </div>
        </section>
      </aside>

      <section class="panel performance-timeline-panel">
        <div class="section-head">
          <div>
            <span class="eyebrow">Timeline</span>
            <h3>演出时间线</h3>
          </div>
          <span class="soft-pill">{{ ttsPerformance.items.length }} 张卡片</span>
        </div>
        <div v-if="ttsPerformance.items.length" class="performance-timeline">
          <article
            v-for="item in ttsPerformance.items"
            :key="item.readable.id"
            :ref="(element) => registerCardElement(item.readable.id, element)"
            class="performance-card"
            :data-active="activeReadableId === item.readable.id ? 'true' : undefined"
            :data-included="isReadableIncluded(item) ? 'true' : 'false'"
            :data-ready="item.readyForPlayback ? 'true' : undefined"
            @click="jumpToReadable(item.readable.id)"
            @dblclick="previewReadable(item.readable.id)"
          >
            <header class="performance-card__head">
              <div>
                <span class="event-kicker">{{ item.readable.kicker }}</span>
                <h4>{{ item.readable.title }}</h4>
              </div>
              <div class="performance-card__meta">
                <span class="soft-pill">{{ item.readable.displaySpeaker }}</span>
                <span
                  v-if="showNarratorLabel(item)"
                  class="performance-card__narrator"
                >
                  朗读：{{ item.readable.ttsSpeaker }}
                </span>
                <span>{{ formatClockTime(item.readable.createdAt) }}</span>
              </div>
            </header>
            <p class="performance-card__body">
              <template v-if="displayParts(item).length">
                <template v-for="(part, index) in displayParts(item)" :key="`${item.readable.id}:display:${index}`">
                  <span v-if="part.type === 'text'">{{ part.text }}</span>
                  <span v-else class="event-inline-tag">{{ part.value }}</span>
                </template>
              </template>
              <template v-else>{{ item.readable.text }}</template>
            </p>
            <footer class="performance-card__foot">
              <span>{{ item.readyForPlayback ? formatDuration(item.durationMs ?? 0) : "未就绪" }}</span>
              <span v-if="!isReadableIncluded(item)" class="soft-pill">已跳过朗读</span>
              <span v-if="item.readable.seq">#{{ item.readable.seq }}</span>
            </footer>
          </article>
        </div>
        <div v-else class="print-empty">
          当前还没有可用于演出模式的朗读内容。
        </div>
      </section>
    </div>

    <section class="panel performance-player" :data-disabled="!selectionReadyForPlayback ? 'true' : undefined">
      <div class="performance-player__row">
        <button
          data-testid="performance-play-toggle"
          class="button primary"
          type="button"
          :disabled="!selectionReadyForPlayback || playbackBusy"
          @click="togglePlayback"
        >
          {{ isPlaying ? "暂停" : "播放" }}
        </button>
        <div class="performance-player__now">
          <strong>{{ activeReadableTitle }}</strong>
          <p>{{ activeReadableSpeaker }}</p>
        </div>
        <div class="performance-player__clock">
          <strong>{{ playheadLabel }}</strong>
          <span>/ {{ totalDurationLabel }}</span>
        </div>
      </div>
      <input
        :value="seekValue"
        class="performance-player__slider"
        type="range"
        min="0"
        :max="Math.max(totalDurationMs, 0)"
        step="50"
        :disabled="!canUsePlaybackSlider || totalDurationMs <= 0"
        @pointerdown="beginScrub"
        @input="handleSeekInput"
        @change="finishScrub"
      />
      <div class="performance-player__status">
        <span v-if="playbackError" class="error-text">{{ playbackError }}</span>
        <span v-else-if="selectedReadableCount === 0" class="soft-note">当前筛选下没有可播放卡片，请至少保留一种朗读类型。</span>
        <span v-else-if="!selectionReadyForPlayback" class="soft-note">当前筛选下仍有卡片未缓存，关闭不需要的类型后会立刻按新时间轴重新计算。</span>
        <span v-else-if="playbackBusy" class="soft-note">正在准备当前卡片的音频…</span>
        <span v-else class="soft-note">拖动进度条时，时间线会自动滚动到对应卡片；双击已缓存卡片可单独试听。</span>
      </div>
    </section>
  </section>

  <section v-else class="panel stack">
    <h2>演出模式加载中</h2>
    <p class="soft-note">正在检查当前会话的全文朗读状态。</p>
    <p v-if="error" class="error-text">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import type { Session, SessionTtsPerformanceState, SessionTtsReadableState } from "@dglab-ai/shared";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";
import { extractInlineDisplayParts, splitInlineDelays, trimInlineDisplayParts, type InlineDisplayPart } from "../lib/inlineDelays";

type TrackItem = SessionTtsReadableState & {
  index: number;
  sourceIndex: number;
  startMs: number;
  audioEndMs: number;
  endMs: number;
};

type PlaybackSettings = {
  includeStageDirections: boolean;
  includeStoryEffects: boolean;
  gapMs: number;
};

type TrackSlot =
  | { type: "segment"; item: TrackItem; offsetMs: number }
  | { type: "gap"; item: TrackItem; offsetMs: number };

const route = useRoute();
const session = ref<Session | null>(null);
const ttsPerformance = ref<SessionTtsPerformanceState | null>(null);
const error = ref("");
const playbackError = ref("");
const gapMs = ref(500);
const includeStageDirections = ref(true);
const includeStoryEffects = ref(true);
const playheadMs = ref(0);
const seekValue = ref(0);
const isPlaying = ref(false);
const playbackBusy = ref(false);
const dismissedBatchNoticeId = ref("");

let audioElement: HTMLAudioElement | null = null;
let playbackFrame: number | null = null;
let gapTimer: number | null = null;
let currentRequestToken = 0;
let pollTimer: number | null = null;
let resumeAfterScrub = false;
let isScrubbing = false;
let activeCardScrollId: string | null = null;
const playbackMode = ref<"full" | "preview" | null>(null);
let playbackContext:
  | { type: "segment"; index: number; startMs: number }
  | { type: "gap"; afterIndex: number; gapStartedAt: number; initialPlayheadMs: number }
  | null = null;

const audioUrlCache = new Map<string, string>();
const cardElements = new Map<string, HTMLElement>();

const trackItems = computed<TrackItem[]>(() => {
  return buildTrackItems(ttsPerformance.value?.items ?? [], currentPlaybackSettings());
});

const totalDurationMs = computed(() => trackItems.value.at(-1)?.endMs ?? 0);
const totalDurationLabel = computed(() => formatDuration(totalDurationMs.value));
const playheadLabel = computed(() => formatDuration(playheadMs.value));
const selectedReadableCount = computed(() => trackItems.value.length);
const skippedReadableCount = computed(() => Math.max(0, (ttsPerformance.value?.items.length ?? 0) - selectedReadableCount.value));
const selectedReadyReadableCount = computed(() => trackItems.value.filter((item) => item.readyForPlayback).length);
const selectionReadyForPlayback = computed(() => (
  selectedReadableCount.value > 0
  && selectedReadyReadableCount.value === selectedReadableCount.value
));
const selectionPlaybackTitle = computed(() => {
  if (selectedReadableCount.value === 0) {
    return "当前没有纳入播放的卡片";
  }
  return selectionReadyForPlayback.value ? "当前筛选可以开始播放" : "当前筛选还不能开始播放";
});
const selectionPlaybackMessage = computed(() => {
  if (selectedReadableCount.value === 0) {
    return "请至少保留一种朗读类型，时间轴和总时长才会重新建立。";
  }
  if (selectionReadyForPlayback.value) {
    return `当前会按所选参数播放 ${selectedReadableCount.value} 张卡片，进度条和总时长都会同步更新。`;
  }
  return `当前已纳入 ${selectedReadableCount.value} 张卡片，其中 ${selectedReadyReadableCount.value} 张已缓存完成。`;
});
const overallProgressPercent = computed(() => {
  if (!ttsPerformance.value?.totalReadableCount) {
    return 0;
  }
  return Math.round((ttsPerformance.value.readyReadableCount / ttsPerformance.value.totalReadableCount) * 100);
});
const overallProgressLabel = computed(() => {
  if (!ttsPerformance.value) {
    return "0%";
  }
  return `${ttsPerformance.value.readyReadableCount} / ${ttsPerformance.value.totalReadableCount}`;
});
const canStartBatch = computed(() => {
  return Boolean(
    ttsPerformance.value
    && ttsPerformance.value.ttsBaseUrlConfigured
    && ttsPerformance.value.missingVoiceSpeakers.length === 0
    && ttsPerformance.value.batchJob?.status !== "running"
  );
});
const batchProgressPercent = computed(() => {
  const job = ttsPerformance.value?.batchJob;
  if (!job?.totalItems) {
    return 0;
  }
  return Math.round((job.completedItems / job.totalItems) * 100);
});
const batchProgressLabel = computed(() => {
  const job = ttsPerformance.value?.batchJob;
  if (!job) {
    return "暂无批量任务";
  }
  return `${job.completedItems} / ${job.totalItems}`;
});
const batchStatusTitle = computed(() => {
  switch (ttsPerformance.value?.batchJob?.status) {
    case "running":
      return ttsPerformance.value.batchJob.cancelRequested ? "正在停止批量任务…" : "正在批量生成中";
    case "completed":
      return "批量生成已完成";
    case "cancelled":
      return "批量生成已取消";
    case "failed":
      return "批量生成失败";
    case "interrupted":
      return "批量任务已中断";
    default:
      return "暂无批量任务";
  }
});
const batchNoticeId = computed(() => {
  const job = ttsPerformance.value?.batchJob;
  if (!session.value || !job) {
    return "";
  }
  return `${session.value.id}:${job.status}:${job.updatedAt}`;
});
const runningBatchCurrentTitle = computed(() => {
  const job = ttsPerformance.value?.batchJob;
  return job?.status === "running" ? job.currentTitle ?? "" : "";
});
const visibleBatchErrorMessage = computed(() => {
  const job = ttsPerformance.value?.batchJob;
  if (!job || dismissedBatchNoticeId.value === batchNoticeId.value) {
    return "";
  }
  return job.status === "failed" || job.status === "interrupted"
    ? job.errorMessage ?? "批量 TTS 任务失败，请稍后重试。"
    : "";
});
const canDismissBatchNotice = computed(() => {
  const job = ttsPerformance.value?.batchJob;
  if (!job) {
    return false;
  }
  return (job.status === "failed" || job.status === "interrupted") && visibleBatchErrorMessage.value.length > 0;
});
const activeReadableId = computed<string | null>(() => {
  const slot = locateTrackSlot(playheadMs.value);
  if (slot?.type === "segment") {
    return slot.item.readable.id;
  }
  if (slot?.type === "gap") {
    return trackItems.value[slot.item.index + 1]?.readable.id ?? slot.item.readable.id;
  }
  return trackItems.value.at(-1)?.readable.id ?? null;
});
const activeTrackItem = computed(() => (
  activeReadableId.value
    ? trackItems.value.find((item) => item.readable.id === activeReadableId.value) ?? null
    : null
));
const activeReadableTitle = computed(() => {
  if (activeTrackItem.value) {
    return activeTrackItem.value.readable.title;
  }
  return selectedReadableCount.value === 0 ? "当前筛选没有卡片" : "尚未开始";
});
const activeReadableSpeaker = computed(() => {
  if (activeTrackItem.value) {
    return activeTrackItem.value.readable.displaySpeaker;
  }
  if (selectedReadableCount.value === 0) {
    return "请在演出参数里保留至少一种朗读内容";
  }
  return selectionReadyForPlayback.value ? "准备就绪后可开始播放" : "当前筛选下仍有卡片未缓存";
});
const canUsePlaybackSlider = computed(() => (
  selectionReadyForPlayback.value
  || playbackMode.value === "preview"
  || isPlaying.value
  || playbackBusy.value
));

watch(playheadMs, (value) => {
  if (!isScrubbing) {
    seekValue.value = value;
  }
});

watch(batchNoticeId, (nextId) => {
  if (!nextId) {
    dismissedBatchNoticeId.value = "";
    return;
  }
  dismissedBatchNoticeId.value = loadDismissedBatchNoticeId(session.value?.id ?? "");
});

watch(activeReadableId, async (nextId) => {
  if (!nextId || nextId === activeCardScrollId) {
    return;
  }
  activeCardScrollId = nextId;
  await nextTick();
  const element = cardElements.get(nextId);
  if (element && typeof element.scrollIntoView === "function") {
    element.scrollIntoView({
      block: "center",
      behavior: "smooth"
    });
  }
});

watch([includeStageDirections, includeStoryEffects], async ([nextIncludeStageDirections, nextIncludeStoryEffects], [previousIncludeStageDirections, previousIncludeStoryEffects]) => {
  const items = ttsPerformance.value?.items ?? [];
  await handleTrackConfigurationChange(
    buildTrackItems(items, {
      includeStageDirections: previousIncludeStageDirections,
      includeStoryEffects: previousIncludeStoryEffects,
      gapMs: gapMs.value
    }),
    buildTrackItems(items, {
      includeStageDirections: nextIncludeStageDirections,
      includeStoryEffects: nextIncludeStoryEffects,
      gapMs: gapMs.value
    })
  );
});

watch(gapMs, async (nextGapMs, previousGapMs) => {
  const items = ttsPerformance.value?.items ?? [];
  const settings = currentPlaybackSettings();
  await handleTrackConfigurationChange(
    buildTrackItems(items, {
      ...settings,
      gapMs: previousGapMs
    }),
    buildTrackItems(items, {
      ...settings,
      gapMs: nextGapMs
    })
  );
});

onMounted(() => {
  audioElement = new Audio();
  audioElement.preload = "auto";
  audioElement.ontimeupdate = () => {
    syncPlayheadFromAudio();
  };
  audioElement.onseeking = () => {
    syncPlayheadFromAudio();
  };
  void loadPage();
});

onBeforeUnmount(() => {
  pausePlayback();
  clearPollTimer();
  if (audioElement) {
    audioElement.pause();
    audioElement.ontimeupdate = null;
    audioElement.onseeking = null;
    audioElement.src = "";
    audioElement = null;
  }
  for (const url of audioUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  audioUrlCache.clear();
  cardElements.clear();
});

async function loadPage() {
  error.value = "";
  try {
    const sessionId = String(route.params.id);
    const [nextSession, nextPerformance] = await Promise.all([
      api.getSession(sessionId),
      api.getSessionTtsPerformance(sessionId)
    ]);
    session.value = nextSession;
    ttsPerformance.value = nextPerformance;
    playheadMs.value = clampPlayhead(playheadMs.value);
    schedulePoll();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "演出模式加载失败";
  }
}

async function refreshPerformanceState() {
  if (!session.value) {
    return;
  }
  try {
    ttsPerformance.value = await api.getSessionTtsPerformance(session.value.id);
    playheadMs.value = clampPlayhead(playheadMs.value);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "无法刷新全文朗读状态";
  } finally {
    schedulePoll();
  }
}

function schedulePoll() {
  clearPollTimer();
  const delay = ttsPerformance.value?.batchJob?.status === "running" ? 1500 : 6000;
  pollTimer = window.setTimeout(() => {
    void refreshPerformanceState();
  }, delay);
}

function clearPollTimer() {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function dismissBatchNotice() {
  if (!session.value || !batchNoticeId.value) {
    return;
  }
  dismissedBatchNoticeId.value = batchNoticeId.value;
  saveDismissedBatchNoticeId(session.value.id, batchNoticeId.value);
}

async function startBatch() {
  if (!session.value || !canStartBatch.value) {
    return;
  }
  error.value = "";
  try {
    ttsPerformance.value = await api.startSessionTtsBatch(session.value.id);
    schedulePoll();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "无法启动批量生成";
  }
}

async function cancelBatch() {
  if (!session.value) {
    return;
  }
  error.value = "";
  try {
    ttsPerformance.value = await api.cancelSessionTtsBatch(session.value.id);
    schedulePoll();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "无法停止批量生成";
  }
}

async function togglePlayback() {
  if (!selectionReadyForPlayback.value) {
    return;
  }
  if (isPlaying.value) {
    pausePlayback();
    return;
  }
  await resumeFromPlayhead();
}

function pausePlayback() {
  currentRequestToken += 1;
  if (playbackContext?.type === "gap") {
    const elapsed = window.performance.now() - playbackContext.gapStartedAt;
    playheadMs.value = clampPlayhead(playbackContext.initialPlayheadMs + elapsed);
  } else if (playbackContext?.type === "segment" && audioElement) {
    playheadMs.value = clampPlayhead(playbackContext.startMs + audioElement.currentTime * 1000);
  }
  isPlaying.value = false;
  playbackBusy.value = false;
  playbackMode.value = null;
  playbackContext = null;
  audioElement?.pause();
  stopPlaybackFrame();
  clearGapTimer();
}

async function resumeFromPlayhead() {
  if (!selectionReadyForPlayback.value || trackItems.value.length === 0) {
    return;
  }

  playbackError.value = "";
  const clampedPlayhead = clampPlayhead(playheadMs.value >= totalDurationMs.value ? 0 : playheadMs.value);
  playheadMs.value = clampedPlayhead;
  const slot = locateTrackSlot(clampedPlayhead);
  if (!slot) {
    return;
  }

  if (slot.type === "segment") {
    await playSegment(slot.item.index, slot.offsetMs, "full");
    return;
  }

  startGap(slot.item.index, slot.offsetMs);
}

async function playSegment(index: number, offsetMs: number, mode: "full" | "preview" = "full") {
  const item = trackItems.value[index];
  if (!item || !session.value || !audioElement) {
    return;
  }

  pausePlayback();
  playbackBusy.value = true;
  const token = ++currentRequestToken;

  try {
    const url = await getAudioUrl(item.readable.id);
    if (token !== currentRequestToken || !audioElement) {
      return;
    }

    await loadAudioIntoElement(audioElement, url, offsetMs / 1000);
    if (token !== currentRequestToken) {
      return;
    }

    audioElement.onended = () => {
      if (token !== currentRequestToken) {
        return;
      }
      handleSegmentEnded(index, mode);
    };
    audioElement.onerror = () => {
      if (token !== currentRequestToken) {
        return;
      }
      playbackError.value = `卡片 “${item.readable.title}” 播放失败。`;
      pausePlayback();
    };

    await audioElement.play();
    if (token !== currentRequestToken) {
      return;
    }

    isPlaying.value = true;
    playbackBusy.value = false;
    playbackMode.value = mode;
    playbackContext = {
      type: "segment",
      index,
      startMs: item.startMs
    };
    startPlaybackFrame();
    if (mode === "full") {
      void prefetchAudioUrl(trackItems.value[index + 1]?.readable.id);
    }
  } catch (caught) {
    if (token !== currentRequestToken) {
      return;
    }
    playbackError.value = caught instanceof Error ? caught.message : "音频加载失败";
    pausePlayback();
  }
}

function handleSegmentEnded(index: number, mode: "full" | "preview") {
  const item = trackItems.value[index];
  if (!item) {
    pausePlayback();
    return;
  }

  playheadMs.value = clampPlayhead(item.audioEndMs);
  if (mode === "preview") {
    pausePlayback();
    playheadMs.value = item.audioEndMs;
    return;
  }
  if (index >= trackItems.value.length - 1) {
    pausePlayback();
    playheadMs.value = totalDurationMs.value;
    return;
  }

  if (gapMs.value <= 0) {
    void playSegment(index + 1, 0, "full");
    return;
  }

  startGap(index, 0);
}

function startGap(afterIndex: number, gapOffsetMs: number) {
  const item = trackItems.value[afterIndex];
  if (!item) {
    pausePlayback();
    return;
  }

  pausePlayback();
  isPlaying.value = true;
  playbackContext = {
    type: "gap",
    afterIndex,
    gapStartedAt: window.performance.now() - gapOffsetMs,
    initialPlayheadMs: item.audioEndMs + gapOffsetMs
  };
  playheadMs.value = clampPlayhead(item.audioEndMs + gapOffsetMs);
  startPlaybackFrame();

  const remainingGapMs = Math.max(0, gapMs.value - gapOffsetMs);
  gapTimer = window.setTimeout(() => {
    gapTimer = null;
    void playSegment(afterIndex + 1, 0, "full");
  }, remainingGapMs);
}

function startPlaybackFrame() {
  stopPlaybackFrame();
  const tick = () => {
    if (playbackContext?.type === "segment" && audioElement) {
      syncPlayheadFromAudio();
    } else if (playbackContext?.type === "gap") {
      const elapsed = window.performance.now() - playbackContext.gapStartedAt;
      playheadMs.value = clampPlayhead(playbackContext.initialPlayheadMs + elapsed);
    }

    if (isPlaying.value) {
      playbackFrame = window.requestAnimationFrame(tick);
    }
  };
  playbackFrame = window.requestAnimationFrame(tick);
}

function syncPlayheadFromAudio() {
  if (!audioElement || playbackContext?.type !== "segment") {
    return;
  }
  playheadMs.value = clampPlayhead(playbackContext.startMs + audioElement.currentTime * 1000);
}

function stopPlaybackFrame() {
  if (playbackFrame !== null) {
    window.cancelAnimationFrame(playbackFrame);
    playbackFrame = null;
  }
}

function clearGapTimer() {
  if (gapTimer !== null) {
    window.clearTimeout(gapTimer);
    gapTimer = null;
  }
}

async function handleTrackConfigurationChange(previousTrackItems: TrackItem[], nextTrackItems: TrackItem[]) {
  const shouldResume = isPlaying.value && playbackMode.value === "full";
  if (isPlaying.value || playbackBusy.value) {
    pausePlayback();
  }
  playheadMs.value = clampPlayheadToTrack(remapPlayheadBetweenTracks(previousTrackItems, nextTrackItems, playheadMs.value), nextTrackItems);
  seekValue.value = playheadMs.value;
  if (shouldResume && selectionReadyForPlayback.value) {
    await resumeFromPlayhead();
  }
}

async function getAudioUrl(readableId: string): Promise<string> {
  const cached = audioUrlCache.get(readableId);
  if (cached) {
    return cached;
  }
  if (!session.value) {
    throw new Error("当前会话尚未加载完成。");
  }
  const blob = await api.getSessionReadableTts(session.value.id, readableId);
  const url = URL.createObjectURL(blob);
  audioUrlCache.set(readableId, url);
  return url;
}

async function prefetchAudioUrl(readableId?: string) {
  if (!readableId || audioUrlCache.has(readableId) || !session.value) {
    return;
  }
  try {
    const blob = await api.getSessionReadableTts(session.value.id, readableId);
    const url = URL.createObjectURL(blob);
    audioUrlCache.set(readableId, url);
  } catch {
    // Ignore prefetch failures; playback will retry on demand.
  }
}

function loadAudioIntoElement(audio: HTMLAudioElement, url: string, offsetSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.onloadedmetadata = null;
      audio.oncanplay = null;
      audio.onerror = null;
    };

    audio.pause();
    audio.src = url;
    audio.preload = "auto";
    audio.onloadedmetadata = () => {
      if (offsetSeconds > 0) {
        const target = Math.min(offsetSeconds, Math.max(0, audio.duration - 0.05));
        audio.currentTime = Number.isFinite(target) ? target : 0;
      }
    };
    audio.oncanplay = () => {
      cleanup();
      resolve();
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("浏览器无法加载当前音频。"));
    };
    audio.load();
  });
}

function locateTrackSlot(playhead: number): TrackSlot | null {
  return locateTrackSlotIn(trackItems.value, playhead);
}

function clampPlayhead(value: number): number {
  return clampPlayheadToTrack(value, trackItems.value);
}

function beginScrub() {
  resumeAfterScrub = isPlaying.value && playbackMode.value === "full";
  isScrubbing = true;
  pausePlayback();
}

function handleSeekInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const nextValue = Number(target.value);
  seekValue.value = nextValue;
  playheadMs.value = clampPlayhead(nextValue);
}

async function finishScrub() {
  const nextPlayhead = clampPlayhead(seekValue.value);
  playheadMs.value = nextPlayhead;
  isScrubbing = false;
  if (resumeAfterScrub) {
    resumeAfterScrub = false;
    await resumeFromPlayhead();
    return;
  }
  resumeAfterScrub = false;
}

function jumpToReadable(readableId: string) {
  const item = trackItems.value.find((entry) => entry.readable.id === readableId);
  if (!item) {
    playbackError.value = "当前演出参数已跳过这张卡片，开启对应朗读后才能跳转。";
    return;
  }
  playbackError.value = "";
  pausePlayback();
  playheadMs.value = item.startMs;
}

async function previewReadable(readableId: string) {
  const item = trackItems.value.find((entry) => entry.readable.id === readableId);
  if (!item) {
    playbackError.value = "当前演出参数已跳过这张卡片，开启对应朗读后才能试听。";
    return;
  }
  if (!item.readyForPlayback) {
    playbackError.value = "这张卡片还没有缓存好，暂时不能试听。";
    return;
  }

  playbackError.value = "";
  playheadMs.value = item.startMs;
  seekValue.value = item.startMs;
  await playSegment(item.index, 0, "preview");
}

function registerCardElement(readableId: string, element: unknown) {
  if (!(element instanceof HTMLElement)) {
    cardElements.delete(readableId);
    return;
  }
  cardElements.set(readableId, element);
}

function dismissedBatchNoticeStorageKey(sessionId: string): string {
  return `dglabai.performance_batch_notice.${sessionId}`;
}

function loadDismissedBatchNoticeId(sessionId: string): string {
  if (!sessionId || typeof window === "undefined") {
    return "";
  }
  try {
    return window.localStorage.getItem(dismissedBatchNoticeStorageKey(sessionId)) ?? "";
  } catch {
    return "";
  }
}

function saveDismissedBatchNoticeId(sessionId: string, noticeId: string) {
  if (!sessionId || typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(dismissedBatchNoticeStorageKey(sessionId), noticeId);
  } catch {
    // Ignore storage failures and keep the in-memory dismissal.
  }
}

function displayParts(item: SessionTtsReadableState): InlineDisplayPart[] {
  return trimInlineDisplayParts(extractInlineDisplayParts(splitInlineDelays(item.readable.text)));
}

function currentPlaybackSettings(): PlaybackSettings {
  return {
    includeStageDirections: includeStageDirections.value,
    includeStoryEffects: includeStoryEffects.value,
    gapMs: gapMs.value
  };
}

function isReadableIncluded(item: SessionTtsReadableState): boolean {
  return shouldIncludeReadable(item, currentPlaybackSettings());
}

function showNarratorLabel(item: SessionTtsReadableState): boolean {
  if (item.readable.ttsSpeaker === item.readable.displaySpeaker) {
    return false;
  }
  if (item.readable.kind === "stage_direction" && item.readable.ttsSpeaker === "旁白") {
    return false;
  }
  return true;
}

function formatClockTime(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDuration(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function shouldIncludeReadable(item: SessionTtsReadableState, settings: PlaybackSettings): boolean {
  if (item.readable.kind === "stage_direction") {
    return settings.includeStageDirections;
  }
  if (item.readable.kind === "story_effect") {
    return settings.includeStoryEffects;
  }
  return true;
}

function buildTrackItems(items: SessionTtsReadableState[], settings: PlaybackSettings): TrackItem[] {
  let cursor = 0;
  return items
    .map((item, sourceIndex) => ({
      item,
      sourceIndex
    }))
    .filter(({ item }) => shouldIncludeReadable(item, settings))
    .map(({ item, sourceIndex }, index, includedItems) => {
      const durationMs = item.durationMs ?? 0;
      const startMs = cursor;
      const audioEndMs = startMs + durationMs;
      const endMs = audioEndMs + (index === includedItems.length - 1 ? 0 : settings.gapMs);
      cursor = endMs;
      return {
        ...item,
        index,
        sourceIndex,
        startMs,
        audioEndMs,
        endMs
      };
    });
}

function totalDurationForTrack(items: TrackItem[]): number {
  return items.at(-1)?.endMs ?? 0;
}

function clampPlayheadToTrack(value: number, items: TrackItem[]): number {
  return Math.min(Math.max(0, value), totalDurationForTrack(items));
}

function locateTrackSlotIn(items: TrackItem[], playhead: number): TrackSlot | null {
  const clamped = clampPlayheadToTrack(playhead, items);
  for (const item of items) {
    if (clamped <= item.audioEndMs) {
      return {
        type: "segment",
        item,
        offsetMs: Math.max(0, clamped - item.startMs)
      };
    }
    if (clamped < item.endMs) {
      return {
        type: "gap",
        item,
        offsetMs: clamped - item.audioEndMs
      };
    }
  }
  return items.at(-1)
    ? {
      type: "segment",
      item: items.at(-1)!,
      offsetMs: Math.max(0, (items.at(-1)?.durationMs ?? 0) - 1)
    }
    : null;
}

function remapPlayheadBetweenTracks(previousTrackItems: TrackItem[], nextTrackItems: TrackItem[], currentPlayhead: number): number {
  if (nextTrackItems.length === 0) {
    return 0;
  }
  if (previousTrackItems.length === 0) {
    return clampPlayheadToTrack(currentPlayhead, nextTrackItems);
  }

  const slot = locateTrackSlotIn(previousTrackItems, currentPlayhead);
  if (!slot) {
    return 0;
  }

  const matchingItem = nextTrackItems.find((item) => item.readable.id === slot.item.readable.id);
  if (slot.type === "segment" && matchingItem) {
    return clampPlayheadToTrack(matchingItem.startMs + Math.min(slot.offsetMs, matchingItem.durationMs ?? 0), nextTrackItems);
  }
  if (slot.type === "gap" && matchingItem && matchingItem.index < nextTrackItems.length - 1) {
    return clampPlayheadToTrack(matchingItem.audioEndMs + Math.min(slot.offsetMs, gapMs.value), nextTrackItems);
  }

  const nextItem = nextTrackItems.find((item) => item.sourceIndex > slot.item.sourceIndex);
  return nextItem ? nextItem.startMs : totalDurationForTrack(nextTrackItems);
}
</script>
