<template>
  <div class="grid two-col">
    <section class="panel">
      <h2>新建推演</h2>
      <textarea
        v-model="playerBrief"
        class="field textarea"
        rows="12"
        placeholder="输入故事背景、角色关系、你希望的氛围与人物设定。"
      />
      <button class="button primary" :disabled="loading || !playerBrief.trim()" @click="createDraft">
        {{ loading ? "生成中..." : "生成草案" }}
      </button>
      <p v-if="error" class="error-text">{{ error }}</p>
    </section>

    <section class="panel">
      <h2>恢复已有 Session</h2>
      <div class="session-list">
        <RouterLink
          v-for="session in sessions"
          :key="session.id"
          class="session-item"
          :to="session.status === 'draft' ? `/sessions/${session.id}/draft` : `/sessions/${session.id}`"
        >
          <strong>{{ session.title }}</strong>
          <span>{{ session.status }}</span>
          <small>{{ formatDate(session.updatedAt) }}</small>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import type { SessionListItem } from "@dglab-ai/shared";

const router = useRouter();
const playerBrief = ref("");
const sessions = ref<SessionListItem[]>([]);
const loading = ref(false);
const error = ref("");

async function loadSessions() {
  sessions.value = await api.listSessions();
}

async function createDraft() {
  loading.value = true;
  error.value = "";
  try {
    const session = await api.createDraft(playerBrief.value.trim());
    await router.push(`/sessions/${session.id}/draft`);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "创建失败";
  } finally {
    loading.value = false;
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

onMounted(() => {
  void loadSessions();
});
</script>

