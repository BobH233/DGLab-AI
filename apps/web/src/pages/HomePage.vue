<template>
  <div class="grid two-col">
    <section class="panel">
      <h2>新建推演</h2>
      <p class="soft-note">
        当前默认后端：
        <strong>{{ activeBackendLabel }}</strong>
      </p>
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
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { isToolEnabled, type ToolContext, type SessionListItem } from "@dglab-ai/shared";
import { useConfigStore } from "../configStore";
import { buildElectroStimToolContext, loadElectroStimLocalConfig } from "../lib/eStim";

const router = useRouter();
const configStore = useConfigStore();
const playerBrief = ref("");
const sessions = ref<SessionListItem[]>([]);
const loading = ref(false);
const error = ref("");
const activeBackendLabel = computed(() => {
  const appConfig = configStore.appConfig.value;
  const activeBackend = appConfig?.backends.find((backend) => backend.id === appConfig.activeBackendId);
  return activeBackend ? activeBackend.name : "加载中...";
});

async function loadSessions() {
  sessions.value = await api.listSessions();
}

async function createDraft() {
  loading.value = true;
  error.value = "";
  try {
    const appConfig = await configStore.ensureConfigLoaded();
    const activeBackend = appConfig.backends.find((backend) => backend.id === appConfig.activeBackendId);
    let toolContext: ToolContext | undefined;
    if (activeBackend && isToolEnabled("control_e_stim_toy", activeBackend.toolStates)) {
      toolContext = buildElectroStimToolContext(loadElectroStimLocalConfig());
    }
    const session = await api.createDraft(playerBrief.value.trim(), toolContext);
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
  void configStore.ensureConfigLoaded();
  void loadSessions();
});
</script>
