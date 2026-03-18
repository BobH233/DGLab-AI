<template>
  <RouterView v-if="isStandaloneRoute" />
  <div v-else class="app-shell">
    <header class="topbar">
      <div class="brand-block">
        <span class="brand-chip">Narrative Control</span>
        <div>
          <h1>DGLabAI</h1>
          <p>多智能体剧情推演工作台</p>
        </div>
      </div>
      <div class="topbar-actions">
        <label class="backend-switch">
          <span>当前模型后端</span>
          <select
            class="field field--compact"
            :disabled="switching || !appConfig"
            :value="appConfig?.activeBackendId ?? ''"
            @change="handleBackendChange"
          >
            <option value="" disabled>
              {{ appConfig ? "请选择后端" : "加载中..." }}
            </option>
            <option
              v-for="backend in appConfig?.backends ?? []"
              :key="backend.id"
              :value="backend.id"
            >
              {{ backend.name }}
            </option>
          </select>
        </label>
        <nav class="topnav">
          <RouterLink to="/">会话</RouterLink>
          <RouterLink to="/settings">配置</RouterLink>
          <RouterLink to="/devices/e-stim">郊狼配置</RouterLink>
        </nav>
      </div>
    </header>
    <main class="page-shell">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useConfigStore } from "./configStore";

const configStore = useConfigStore();
const route = useRoute();
const switching = ref(false);
const appConfig = computed(() => configStore.appConfig.value);
const isStandaloneRoute = computed(() => route.meta.standalone === true);

async function handleBackendChange(event: Event) {
  const backendId = (event.target as HTMLSelectElement).value;
  if (!backendId || backendId === appConfig.value?.activeBackendId) {
    return;
  }
  switching.value = true;
  try {
    await configStore.setActiveBackend(backendId);
  } finally {
    switching.value = false;
  }
}

onMounted(() => {
  void configStore.ensureConfigLoaded();
});
</script>
