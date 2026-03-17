<template>
  <section v-if="session && debugData" class="console-page">
    <section class="panel memory-debug-hero">
      <div class="section-head">
        <div>
          <span class="eyebrow">Developer View</span>
          <h2>{{ session.title }} · Memory Debug</h2>
          <p class="console-summary">当前页面展示的是系统为下一轮推演真正组装出来的 memory 上下文，以及压缩链路的运行状态。</p>
        </div>
        <div class="actions">
          <RouterLink class="button secondary" :to="`/sessions/${session.id}`">返回会话</RouterLink>
        </div>
      </div>
      <div class="memory-debug-overview">
        <div class="metric-card">
          <span>lastProcessedSeq</span>
          <strong>{{ debugData.memoryState.lastProcessedSeq }}</strong>
        </div>
        <div class="metric-card">
          <span>archive</span>
          <strong>{{ debugData.memoryState.archiveSummary ? "已存在" : "空" }}</strong>
        </div>
        <div class="metric-card">
          <span>episode summaries</span>
          <strong>{{ debugData.memoryState.episodeSummaries.length }}</strong>
        </div>
        <div class="metric-card">
          <span>turn summaries</span>
          <strong>{{ debugData.memoryState.turnSummaries.length }}</strong>
        </div>
        <div class="metric-card">
          <span>recent raw turns</span>
          <strong>{{ debugData.recentRawTurns.length }}</strong>
        </div>
        <div class="metric-card">
          <span>最近刷新</span>
          <strong>{{ formatDateTime(debugData.memoryState.debug.lastRefreshAt) }}</strong>
        </div>
      </div>
      <div class="inline-alert" :data-status="debugData.memoryState.debug.lastRefreshStatus">
        <strong>刷新状态：{{ debugData.memoryState.debug.lastRefreshStatus }}</strong>
        <p>{{ debugData.memoryState.debug.lastRefreshError ?? "最近一次刷新没有报错。" }}</p>
      </div>
    </section>

    <section class="grid two-col memory-debug-layout">
      <section class="panel stack">
        <div class="section-head">
          <div>
            <span class="eyebrow">Compression Tree</span>
            <h3>压缩层级视图</h3>
          </div>
        </div>
        <MemorySummaryCard
          v-if="debugData.memoryState.archiveSummary"
          :summary="debugData.memoryState.archiveSummary"
          label="archive"
        />
        <div class="stack">
          <MemorySummaryCard
            v-for="summary in debugData.memoryState.episodeSummaries"
            :key="summary.id"
            :summary="summary"
            label="episode"
          />
        </div>
        <div class="stack">
          <MemorySummaryCard
            v-for="summary in debugData.memoryState.turnSummaries"
            :key="summary.id"
            :summary="summary"
            label="turn"
          />
        </div>
      </section>

      <section class="panel stack">
        <div class="section-head">
          <div>
            <span class="eyebrow">Prompt Preview</span>
            <h3>下一轮上下文预览</h3>
          </div>
          <span class="soft-pill">{{ debugData.assembledContext.stats.droppedBlocks.length }} dropped</span>
        </div>
        <ContextBlockPreview
          title="Archive"
          subtitle="Compressed long-term memory"
          :text="debugData.assembledContext.archiveBlock"
          :char-count="debugData.assembledContext.stats.charCounts.archive"
        />
        <ContextBlockPreview
          v-for="(block, index) in debugData.assembledContext.episodeBlocks"
          :key="`episode-${index}`"
          title="Episode"
          :subtitle="`Episode block ${index + 1}`"
          :text="block"
          :char-count="block.length"
        />
        <ContextBlockPreview
          v-for="(block, index) in debugData.assembledContext.turnSummaryBlocks"
          :key="`turn-${index}`"
          title="Turn"
          :subtitle="`Turn block ${index + 1}`"
          :text="block"
          :char-count="block.length"
        />
        <ContextBlockPreview
          title="Recent Raw Turns"
          subtitle="Recent raw turn window"
          :text="debugData.assembledContext.recentRawTurnsBlock"
          :char-count="debugData.assembledContext.stats.charCounts.rawTurns"
        />
        <ContextBlockPreview
          title="Player Ledger"
          subtitle="Persistent player utterances"
          :text="debugData.assembledContext.playerMessagesBlock"
          :char-count="debugData.assembledContext.stats.charCounts.playerMessages"
        />
        <ContextBlockPreview
          title="Tick Context"
          subtitle="Queued messages and reasons"
          :text="debugData.assembledContext.tickContextBlock"
          :char-count="debugData.assembledContext.stats.charCounts.tickContext"
        />
        <div class="memory-debug-droppeds">
          <strong>Dropped Blocks</strong>
          <p>{{ debugData.assembledContext.stats.droppedBlocks.join("，") || "无" }}</p>
        </div>
      </section>
    </section>

    <section class="grid two-col memory-debug-layout">
      <section class="panel stack">
        <div class="section-head">
          <div>
            <span class="eyebrow">Recent Window</span>
            <h3>最近原文窗口</h3>
          </div>
        </div>
        <RecentRawTurnPanel :turns="debugData.recentRawTurns" />
      </section>

      <section class="panel stack">
        <div class="section-head">
          <div>
            <span class="eyebrow">Run History</span>
            <h3>压缩运行记录</h3>
          </div>
        </div>
        <MemoryRunTable :runs="debugData.memoryState.debug.recentRuns" />
      </section>
    </section>
  </section>
</template>

<script setup lang="ts">
import type { MemoryDebugResponse, Session } from "@dglab-ai/shared";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import ContextBlockPreview from "../components/ContextBlockPreview.vue";
import MemoryRunTable from "../components/MemoryRunTable.vue";
import MemorySummaryCard from "../components/MemorySummaryCard.vue";
import RecentRawTurnPanel from "../components/RecentRawTurnPanel.vue";
import { api } from "../api";

const route = useRoute();
const session = ref<Session | null>(null);
const debugData = ref<MemoryDebugResponse | null>(null);
let stream: EventSource | null = null;

async function loadPage() {
  const id = String(route.params.id);
  const [nextSession, nextDebug] = await Promise.all([
    api.getSession(id),
    api.getMemoryDebug(id)
  ]);
  session.value = nextSession;
  debugData.value = nextDebug;
  connectStream(id);
}

function connectStream(sessionId: string) {
  stream?.close();
  stream = new EventSource(api.streamUrl(sessionId));
  stream.addEventListener("session.updated", async () => {
    const [nextSession, nextDebug] = await Promise.all([
      api.getSession(sessionId),
      api.getMemoryDebug(sessionId)
    ]);
    session.value = nextSession;
    debugData.value = nextDebug;
  });
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "暂无";
  }
  return new Date(value).toLocaleString();
}

watch(() => route.params.id, () => {
  void loadPage();
});

onMounted(() => {
  void loadPage();
});

onBeforeUnmount(() => {
  stream?.close();
});
</script>
