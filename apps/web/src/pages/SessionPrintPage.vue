<template>
  <section v-if="session" class="print-page" :data-orientation="orientation">
    <header class="print-toolbar screen-only">
      <div class="print-toolbar__intro">
        <span class="eyebrow">Print Preview</span>
        <h2>导出当前会话为 PDF</h2>
        <p class="soft-note">当前打印模式为{{ orientationLabel }}；网页预览不会大幅变化，方向主要作用在最终 PDF 上。</p>
      </div>
      <div class="print-toolbar__actions">
        <button
          class="button primary"
          type="button"
          @click="printWithOrientation('portrait')"
        >
          打印竖版
        </button>
        <button
          class="button primary"
          type="button"
          @click="printWithOrientation('landscape')"
        >
          打印横版
        </button>
        <RouterLink class="button secondary" :to="`/sessions/${session.id}`">返回会话</RouterLink>
      </div>
    </header>

    <article class="print-sheet">
      <section class="print-cover">
        <div class="print-cover__head">
          <div>
            <span class="print-kicker">DGLabAI Session Export</span>
            <h1>{{ session.title }}</h1>
            <p class="print-summary">{{ displaySummary || "当前会话暂无摘要。" }}</p>
          </div>
          <div class="print-badge">{{ statusLabel }}</div>
        </div>
        <div class="print-meta-grid">
          <div class="print-meta-card">
            <span>导出时间</span>
            <strong>{{ exportTimestamp }}</strong>
          </div>
          <div class="print-meta-card">
            <span>阶段</span>
            <strong>{{ session.storyState.phase }}</strong>
          </div>
          <div class="print-meta-card">
            <span>地点</span>
            <strong>{{ session.storyState.location }}</strong>
          </div>
          <div class="print-meta-card">
            <span>张力</span>
            <strong>{{ session.storyState.tension }}/10</strong>
          </div>
        </div>
      </section>

      <section class="print-section">
        <div class="print-section__head">
          <span class="print-section__kicker">Overview</span>
          <h3>场景概览</h3>
        </div>
        <div class="print-info-grid">
          <article class="print-info-card">
            <h4>世界背景</h4>
            <p>{{ setupSource.worldSummary }}</p>
          </article>
          <article class="print-info-card">
            <h4>开场局势</h4>
            <p>{{ setupSource.openingSituation }}</p>
          </article>
          <article class="print-info-card">
            <h4>玩家处境</h4>
            <p>{{ setupSource.playerState }}</p>
          </article>
          <article class="print-info-card">
            <h4>当前玩家身体道具</h4>
            <p>{{ playerBodyItemStateLabel }}</p>
          </article>
          <article class="print-info-card">
            <h4>安全框架</h4>
            <p>{{ setupSource.safetyFrame }}</p>
          </article>
        </div>
      </section>

      <section class="print-section">
        <div class="print-section__head">
          <span class="print-section__kicker">Cast</span>
          <h3>参与角色</h3>
        </div>
        <div class="print-cast-list">
          <article v-for="agent in agentCards" :key="agent.id" class="print-cast-card">
            <div class="print-cast-card__head">
              <strong>{{ agent.name }}</strong>
              <span>{{ agent.role }}</span>
            </div>
            <p>{{ agent.summary }}</p>
          </article>
        </div>
      </section>

      <section class="print-section">
        <div class="print-section__head">
          <span class="print-section__kicker">LLM</span>
          <h3>会话使用的后端模型</h3>
        </div>
        <div class="print-model-grid">
          <article class="print-info-card">
            <h4>提供方</h4>
            <p>{{ providerLabel }}</p>
          </article>
          <article class="print-info-card">
            <h4>接口地址</h4>
            <p>{{ baseUrlLabel }}</p>
          </article>
        </div>
        <div v-if="usedModels.length" class="print-tags print-tags--dense">
          <span v-for="model in usedModels" :key="model" class="print-tag">{{ model }}</span>
        </div>
        <div v-else class="print-empty">
          当前会话没有记录到模型调用信息。
        </div>
      </section>

      <section class="print-section">
        <div class="print-section__head">
          <span class="print-section__kicker">Timeline</span>
          <h3>剧情时间线</h3>
        </div>
        <div v-if="timelineItems.length" class="print-timeline">
          <article
            v-for="item in timelineItems"
            :key="item.id"
            class="print-timeline-item"
            :data-kind="item.kind"
          >
            <header class="print-timeline-item__head">
              <div>
                <span class="print-timeline-item__kicker">{{ item.kicker }}</span>
                <h4>{{ item.title }}</h4>
              </div>
              <div class="print-timeline-item__meta">
                <span>#{{ item.seq }}</span>
                <span>{{ formatDateTime(item.createdAt) }}</span>
              </div>
            </header>
            <p v-if="item.main" class="print-timeline-item__main">{{ item.main }}</p>
            <div v-if="item.diffLines?.length" class="print-timeline-item__diff">
              <p v-for="line in item.diffLines" :key="`${item.id}-${line.prefix}-${line.value}`" :data-prefix="line.prefix">
                <strong>{{ line.prefix }}</strong> {{ line.value }}
              </p>
            </div>
            <div v-if="item.details?.length" class="print-timeline-item__details">
              <p v-for="detail in item.details" :key="`${item.id}-${detail.label}-${detail.value}`">
                <strong>{{ detail.label }}：</strong>{{ detail.value }}
              </p>
            </div>
            <p v-if="item.meta" class="print-timeline-item__sub">{{ item.meta }}</p>
            <div v-if="item.tags.length" class="print-tags">
              <span v-for="tag in item.tags" :key="`${item.id}-${tag}`" class="print-tag">{{ tag }}</span>
            </div>
          </article>
        </div>
        <div v-else class="print-empty">
          当前会话还没有可导出的时间线事件。
        </div>
      </section>
    </article>
  </section>

  <section v-else class="panel stack">
    <h2>打印预览加载中</h2>
    <p class="soft-note">正在准备可打印内容。</p>
    <p v-if="error" class="error-text">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import type { AgentProfile, Session, SessionEvent, SessionDraft } from "@dglab-ai/shared";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";
import { stripInlineDelays } from "../lib/inlineDelays";
import { buildTimelinePresentationItems } from "../lib/timelinePresentation";

const route = useRoute();
const router = useRouter();
const session = ref<Session | null>(null);
const events = ref<SessionEvent[]>([]);
const error = ref("");
let printPageStyleElement: HTMLStyleElement | null = null;
let autoPrintTriggered = false;

const setupSource = computed<SessionDraft>(() => session.value?.confirmedSetup ?? session.value?.draft ?? {
  title: "",
  playerBrief: "",
  worldSummary: "",
  openingSituation: "",
  playerState: "",
  initialPlayerBodyItemState: [],
  suggestedPace: "",
  safetyFrame: "",
  agents: [],
  sceneGoals: [],
  contentNotes: []
});

const timelineItems = computed(() => {
  const printableEvents = events.value.filter((event) => !isHiddenInPrint(event.type));
  return buildTimelinePresentationItems(printableEvents, {}, setupSource.value.agents ?? []);
});
const orientation = computed<"portrait" | "landscape">(() => {
  const queryValue = route.query.orientation;
  const value = Array.isArray(queryValue) ? queryValue[0] : queryValue;
  return value === "landscape" ? "landscape" : "portrait";
});
const shouldAutoPrint = computed(() => {
  const queryValue = route.query.autoprint;
  const value = Array.isArray(queryValue) ? queryValue[0] : queryValue;
  return value === "1";
});
const orientationLabel = computed(() => orientation.value === "landscape" ? "横版" : "竖版");
const exportTimestamp = computed(() => formatDateTime(new Date().toISOString()));
const statusLabel = computed(() => {
  if (!session.value) {
    return "";
  }
  if (session.value.status === "active") {
    return "进行中";
  }
  if (session.value.status === "ended") {
    return "已结束";
  }
  return "草案";
});
const usedModels = computed(() => {
  const models = new Set<string>();
  for (const call of session.value?.usageTotals.byCall ?? []) {
    if (typeof call.model === "string" && call.model.trim()) {
      models.add(call.model.trim());
    }
  }
  const lastModel = session.value?.usageTotals.session.lastModel;
  if (typeof lastModel === "string" && lastModel.trim()) {
    models.add(lastModel.trim());
  }
  const snapshotModel = session.value?.llmConfigSnapshot?.model;
  if (typeof snapshotModel === "string" && snapshotModel.trim()) {
    models.add(snapshotModel.trim());
  }
  return Array.from(models);
});
const providerLabel = computed(() => session.value?.llmConfigSnapshot?.provider ?? "未记录");
const baseUrlLabel = computed(() => session.value?.llmConfigSnapshot?.baseUrl ?? "未记录");
const displaySummary = computed(() => stripInlineDelays(session.value?.storyState.summary ?? ""));
const agentCards = computed(() => {
  return setupSource.value.agents.map((agent: AgentProfile) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role === "director" ? "主导者" : "辅助者",
    summary: agent.summary
  }));
});
const playerBodyItemStateLabel = computed(() => {
  const items = session.value?.playerBodyItemState ?? [];
  return items.length > 0 ? items.join("\n") : "当前没有记录中的身体道具。";
});

async function loadPrintView() {
  error.value = "";
  try {
    const id = String(route.params.id);
    const [nextSession, nextEvents] = await Promise.all([
      api.getSession(id),
      api.getEvents(id)
    ]);
    session.value = nextSession;
    events.value = nextEvents;
    if (typeof document !== "undefined") {
      document.title = `${nextSession.title} · 打印预览`;
    }
    await maybeAutoPrint();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "打印预览加载失败";
  }
}

function printDocument() {
  if (typeof window !== "undefined") {
    window.print();
  }
}

async function printWithOrientation(nextOrientation: "portrait" | "landscape") {
  if (orientation.value !== nextOrientation) {
    await router.replace({
      query: {
        ...route.query,
        orientation: nextOrientation
      }
    });
    await nextTick();
  }
  applyPrintPageOrientation();
  await nextTick();
  printDocument();
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

function isHiddenInPrint(type: SessionEvent["type"]): boolean {
  return type === "system.timer_updated" || type === "system.usage_recorded" || type === "system.tick_failed";
}

async function maybeAutoPrint() {
  if (!shouldAutoPrint.value || autoPrintTriggered || !session.value || typeof window === "undefined") {
    return;
  }
  autoPrintTriggered = true;
  await nextTick();
  window.print();
}

function applyPrintPageOrientation() {
  if (typeof document === "undefined") {
    return;
  }
  if (!printPageStyleElement) {
    printPageStyleElement = document.createElement("style");
    printPageStyleElement.setAttribute("data-print-orientation", "session-print");
    document.head.appendChild(printPageStyleElement);
  }
  printPageStyleElement.textContent = `@media print { @page { size: A4 ${orientation.value}; margin: 8mm; } }`;
}

onMounted(() => {
  void loadPrintView();
});

watch(orientation, () => {
  applyPrintPageOrientation();
}, {
  immediate: true
});

onBeforeUnmount(() => {
  printPageStyleElement?.remove();
  printPageStyleElement = null;
});
</script>
