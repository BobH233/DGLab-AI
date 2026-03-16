import type { AppConfig } from "@dglab-ai/shared";
import { computed, reactive, readonly } from "vue";
import { api } from "./api";

const state = reactive({
  appConfig: null as AppConfig | null,
  loading: false
});

async function reloadConfig(): Promise<AppConfig> {
  state.loading = true;
  try {
    const config = await api.getAppConfig();
    state.appConfig = config;
    return config;
  } finally {
    state.loading = false;
  }
}

async function ensureConfigLoaded(): Promise<AppConfig> {
  return state.appConfig ?? reloadConfig();
}

async function saveAppConfig(config: AppConfig): Promise<AppConfig> {
  state.loading = true;
  try {
    const saved = await api.saveAppConfig(config);
    state.appConfig = saved;
    return saved;
  } finally {
    state.loading = false;
  }
}

async function setActiveBackend(backendId: string): Promise<AppConfig> {
  state.loading = true;
  try {
    const saved = await api.setActiveBackend(backendId);
    state.appConfig = saved;
    return saved;
  } finally {
    state.loading = false;
  }
}

export function useConfigStore() {
  return {
    state: readonly(state),
    appConfig: computed(() => state.appConfig),
    ensureConfigLoaded,
    reloadConfig,
    saveAppConfig,
    setActiveBackend
  };
}
