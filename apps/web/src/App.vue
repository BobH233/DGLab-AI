<template>
  <RouterView v-if="isStandaloneRoute" />
  <div v-else class="app-shell">
    <header class="topbar">
      <div class="brand-block">
        <button type="button" class="brand-chip brand-chip--trigger" @click="handleBrandTap">
          Narrative Control
        </button>
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
          <RouterLink to="/llm-calls">模型调用</RouterLink>
          <RouterLink to="/settings">配置</RouterLink>
          <RouterLink to="/devices/e-stim">郊狼配置</RouterLink>
        </nav>
        <button v-if="authStore.isAuthenticated.value" class="button ghost" @click="handleLogout">
          退出登录
        </button>
      </div>
    </header>
    <main class="page-shell">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "./auth";
import { useConfigStore } from "./configStore";

const configStore = useConfigStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const switching = ref(false);
const brandTapCount = ref(0);
let brandTapResetTimer: number | null = null;
const appConfig = computed(() => configStore.appConfig.value);
const isStandaloneRoute = computed(() => route.meta.standalone === true);

function clearBrandTapResetTimer() {
  if (brandTapResetTimer !== null) {
    window.clearTimeout(brandTapResetTimer);
    brandTapResetTimer = null;
  }
}

function handleBrandTap() {
  brandTapCount.value += 1;
  clearBrandTapResetTimer();
  if (brandTapCount.value >= 3) {
    brandTapCount.value = 0;
    void router.push("/internal/build-info");
    return;
  }
  brandTapResetTimer = window.setTimeout(() => {
    brandTapCount.value = 0;
    brandTapResetTimer = null;
  }, 900);
}

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

async function handleLogout() {
  authStore.clearAuthPassword();
  await router.push("/login");
}

function loadConfigIfNeeded() {
  if (!authStore.isAuthenticated.value || route.meta.public === true || configStore.appConfig.value) {
    return;
  }
  void configStore.ensureConfigLoaded();
}

watch(() => [route.fullPath, authStore.isAuthenticated.value], () => {
  loadConfigIfNeeded();
});

onMounted(() => {
  loadConfigIfNeeded();
});

onBeforeUnmount(() => {
  clearBrandTapResetTimer();
});
</script>
