<template>
  <section v-if="session" class="console-page">
    <section class="console-hero panel">
      <div class="console-hero__main">
        <span class="eyebrow">Session Console</span>
        <h2>{{ session.title }}</h2>
        <p class="console-summary">{{ session.storyState.summary }}</p>
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
          <span class="soft-pill">{{ events.length }} 条事件</span>
        </div>
        <EventTimeline :events="events" />
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

const route = useRoute();
const session = ref<Session | null>(null);
const events = ref<SessionEvent[]>([]);
const message = ref("");
const sending = ref(false);
const error = ref("");
const timerEnabled = ref(false);
const intervalMs = ref(10000);
let stream: EventSource | null = null;

const agentCards = computed(() => {
  const agents = session.value?.confirmedSetup?.agents ?? session.value?.draft.agents ?? [];
  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role === "director" ? "主导者" : "辅助者",
    summary: agent.summary
  }));
});

function syncSession(next: Session) {
  session.value = next;
  timerEnabled.value = next.timerState.enabled;
  intervalMs.value = next.timerState.intervalMs;
}

async function loadSession() {
  const id = String(route.params.id);
  syncSession(await api.getSession(id));
  events.value = await api.getEvents(id);
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
    if (!events.value.some((item) => item.seq === payload.event.seq)) {
      events.value = [...events.value, payload.event];
    }
  });
  stream.addEventListener("error", () => {
    error.value = "实时连接已断开，请刷新页面重试。";
  });
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
  void loadSession();
});

onBeforeUnmount(() => {
  stream?.close();
});
</script>

