<template>
  <section v-if="session" class="print-page">
    <header class="print-toolbar screen-only">
      <div>
        <span class="eyebrow">Print Preview</span>
        <h2>导出当前会话为 PDF</h2>
        <p class="soft-note">建议使用浏览器打印中的“另存为 PDF”。</p>
      </div>
      <div class="actions">
        <RouterLink class="button secondary" :to="`/sessions/${session.id}`">返回会话</RouterLink>
        <button class="button primary" type="button" @click="printDocument">打印 / 导出 PDF</button>
      </div>
    </header>

    <article class="print-sheet">
      <section class="print-cover">
        <div class="print-cover__head">
          <div>
            <span class="print-kicker">DGLabAI Session Export</span>
            <h1>{{ session.title }}</h1>
            <p class="print-summary">{{ session.storyState.summary || "当前会话暂无摘要。" }}</p>
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
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";
import { buildTimelinePresentationItems } from "../lib/timelinePresentation";

const route = useRoute();
const session = ref<Session | null>(null);
const events = ref<SessionEvent[]>([]);
const error = ref("");

const setupSource = computed<SessionDraft>(() => session.value?.confirmedSetup ?? session.value?.draft ?? {
  title: "",
  playerBrief: "",
  worldSummary: "",
  openingSituation: "",
  playerState: "",
  suggestedPace: "",
  safetyFrame: "",
  agents: [],
  sceneGoals: [],
  contentNotes: []
});

const timelineItems = computed(() => buildTimelinePresentationItems(events.value));
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
const agentCards = computed(() => {
  return setupSource.value.agents.map((agent: AgentProfile) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role === "director" ? "主导者" : "辅助者",
    summary: agent.summary
  }));
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
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "打印预览加载失败";
  }
}

function printDocument() {
  if (typeof window !== "undefined") {
    window.print();
  }
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

onMounted(() => {
  void loadPrintView();
});
</script>
