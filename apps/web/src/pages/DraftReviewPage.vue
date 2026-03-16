<template>
  <section v-if="session" class="stack">
    <div class="panel">
      <h2>设定草案确认</h2>
      <p>系统已补全剧情世界观和参与者，你可以局部修改后确认进入推演。</p>
    </div>

    <div class="grid two-col">
      <section class="panel stack">
        <label>
          <span>标题</span>
          <input v-model="draft.title" class="field" />
        </label>
        <label>
          <span>世界背景</span>
          <textarea v-model="draft.worldSummary" class="field textarea" rows="8" />
        </label>
        <label>
          <span>开场局势</span>
          <textarea v-model="draft.openingSituation" class="field textarea" rows="6" />
        </label>
        <label>
          <span>玩家处境</span>
          <textarea v-model="draft.playerState" class="field textarea" rows="5" />
        </label>
        <label>
          <span>节奏建议</span>
          <textarea v-model="draft.suggestedPace" class="field textarea" rows="4" />
        </label>
        <label>
          <span>安全框架</span>
          <textarea v-model="draft.safetyFrame" class="field textarea" rows="4" />
        </label>
      </section>

      <section class="panel stack">
        <h3>参与 Agent</h3>
        <article
          v-for="agent in draft.agents"
          :key="agent.id"
          class="agent-card"
        >
          <label>
            <span>名字</span>
            <input v-model="agent.name" class="field" />
          </label>
          <label>
            <span>角色</span>
            <select v-model="agent.role" class="field">
              <option value="director">director</option>
              <option value="support">support</option>
            </select>
          </label>
          <label>
            <span>摘要</span>
            <textarea v-model="agent.summary" class="field textarea" rows="3" />
          </label>
          <label>
            <span>Persona</span>
            <textarea v-model="agent.persona" class="field textarea" rows="4" />
          </label>
          <label>
            <span>Goals（每行一条）</span>
            <textarea :value="agent.goals.join('\n')" class="field textarea" rows="4" @input="updateList(agent, 'goals', $event)" />
          </label>
          <label>
            <span>Style（每行一条）</span>
            <textarea :value="agent.style.join('\n')" class="field textarea" rows="3" @input="updateList(agent, 'style', $event)" />
          </label>
        </article>
      </section>
    </div>

    <div class="actions">
      <button class="button secondary" :disabled="saving" @click="saveDraft">
        {{ saving ? "保存中..." : "保存修改" }}
      </button>
      <button class="button primary" :disabled="confirming" @click="confirmDraft">
        {{ confirming ? "确认中..." : "确认并进入推演" }}
      </button>
    </div>
    <p v-if="error" class="error-text">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import type { AgentProfile, Session, UpdateDraftRequest } from "@dglab-ai/shared";
import { onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";

const route = useRoute();
const router = useRouter();
const session = ref<Session | null>(null);
const draft = reactive<UpdateDraftRequest & { title: string; agents: AgentProfile[] }>({
  title: "",
  worldSummary: "",
  openingSituation: "",
  playerState: "",
  suggestedPace: "",
  safetyFrame: "",
  sceneGoals: [],
  contentNotes: [],
  agents: []
});
const saving = ref(false);
const confirming = ref(false);
const error = ref("");

function toDisplayText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map((item) => toDisplayText(item)).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const preferredKeys = ["summary", "description", "content", "text", "state", "status"];
    for (const key of preferredKeys) {
      const candidate = source[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }
    return Object.entries(source)
      .map(([key, item]) => `${key}：${toDisplayText(item)}`)
      .join("\n");
  }
  return String(value);
}

function syncDraft(nextSession: Session) {
  session.value = nextSession;
  Object.assign(draft, structuredClone(nextSession.draft));
  draft.worldSummary = toDisplayText(draft.worldSummary);
  draft.openingSituation = toDisplayText(draft.openingSituation);
  draft.playerState = toDisplayText(draft.playerState);
  draft.suggestedPace = toDisplayText(draft.suggestedPace);
  draft.safetyFrame = toDisplayText(draft.safetyFrame);
}

async function loadSession() {
  const nextSession = await api.getSession(String(route.params.id));
  syncDraft(nextSession);
}

function updateList(agent: AgentProfile, field: "goals" | "style", event: Event) {
  const target = event.target as HTMLTextAreaElement;
  agent[field] = target.value.split("\n").map((item) => item.trim()).filter(Boolean);
}

async function saveDraft() {
  saving.value = true;
  error.value = "";
  try {
    const next = await api.updateDraft(String(route.params.id), serializeDraft());
    syncDraft(next);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

async function confirmDraft() {
  confirming.value = true;
  error.value = "";
  try {
    await api.updateDraft(String(route.params.id), serializeDraft());
    const next = await api.confirmSession(String(route.params.id));
    await router.push(`/sessions/${next.id}`);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "确认失败";
  } finally {
    confirming.value = false;
  }
}

function serializeDraft(): UpdateDraftRequest {
  return JSON.parse(JSON.stringify(draft)) as UpdateDraftRequest;
}

onMounted(() => {
  void loadSession();
});
</script>
