<template>
  <div class="grid two-col settings-layout">
    <section class="panel stack">
      <div class="section-head">
        <div>
          <h2>模型后端列表</h2>
          <p class="soft-note">管理多个模型后端，顶部下拉可快速切换当前默认后端。</p>
        </div>
        <button class="button secondary" @click="addBackend">新增后端</button>
      </div>

      <div class="backend-list">
        <button
          v-for="backend in form.backends"
          :key="backend.id"
          class="backend-card"
          :class="{ 'backend-card--selected': backend.id === selectedBackendId }"
          type="button"
          @click="selectedBackendId = backend.id"
        >
          <div class="backend-card__head">
            <strong>{{ backend.name }}</strong>
            <span v-if="backend.id === form.activeBackendId" class="soft-pill">当前</span>
          </div>
          <p>{{ backend.model }}</p>
          <small>{{ backend.baseUrl }}</small>
        </button>
      </div>

      <p v-if="message" class="success-text">{{ message }}</p>
      <p v-if="error" class="error-text">{{ error }}</p>
    </section>

    <section v-if="selectedBackend" class="panel stack">
      <div class="section-head">
        <div>
          <h2>编辑后端</h2>
          <p class="soft-note">每个后端都维护独立的模型参数和工具默认开关，新建 session 时使用当前后端。</p>
        </div>
        <div class="actions">
          <button
            class="button secondary"
            :disabled="selectedBackend.id === form.activeBackendId"
            @click="form.activeBackendId = selectedBackend.id"
          >
            设为当前
          </button>
          <button
            class="button secondary"
            :disabled="form.backends.length === 1"
            @click="removeBackend(selectedBackend.id)"
          >
            删除后端
          </button>
        </div>
      </div>

      <label>
        <span>后端名称</span>
        <input v-model="selectedBackend.name" class="field" />
      </label>
      <label>
        <span>API Base URL</span>
        <input v-model="selectedBackend.baseUrl" class="field" />
      </label>
      <label>
        <span>API Key</span>
        <input v-model="selectedBackend.apiKey" class="field" type="password" />
      </label>
      <label>
        <span>Model</span>
        <input v-model="selectedBackend.model" class="field" />
      </label>
      <label>
        <span>Temperature</span>
        <input
          v-model.number="selectedBackend.temperature"
          class="field"
          type="number"
          min="0"
          max="2"
          step="0.1"
        />
      </label>
      <label>
        <span>推理强度</span>
        <select v-model="selectedBackend.reasoningEffort" class="field">
          <option
            v-for="effort in reasoningEffortOptions"
            :key="effort"
            :value="effort"
          >
            {{ reasoningEffortLabels[effort] }}
          </option>
        </select>
      </label>
      <label>
        <span>Top P</span>
        <input
          v-model.number="selectedBackend.topP"
          class="field"
          type="number"
          min="0"
          max="1"
          step="0.05"
        />
      </label>
      <label>
        <span>Max Tokens</span>
        <input v-model.number="selectedBackend.maxTokens" class="field" type="number" min="1" step="100" />
      </label>
      <label>
        <span>Request Timeout (ms)</span>
        <input v-model.number="selectedBackend.requestTimeoutMs" class="field" type="number" min="1000" step="1000" />
      </label>
      <p class="soft-note">
        当前会把这个设置作为 OpenAI-compatible `/chat/completions` 的 `reasoning_effort`
        参数发送；若目标后端不支持，服务端会自动回退为不带该参数重试。
      </p>

      <div class="stack">
        <h3>工具默认开关</h3>
        <label
          v-for="tool in toolCatalog"
          :key="tool.id"
          class="tool-toggle"
        >
          <div>
            <strong>{{ tool.name }}</strong>
            <p class="tool-description">{{ tool.description }}</p>
            <p class="tool-meta">
              {{ tool.required ? "必选工具，始终启用" : "当前后端作为默认模型时，新建对话将按这里的设置启用工具" }}
            </p>
          </div>
          <input
            v-model="selectedBackend.toolStates[tool.id]"
            type="checkbox"
            :disabled="tool.required"
          />
        </label>
      </div>

      <div class="actions">
        <button class="button primary" :disabled="saving" @click="save">
          {{ saving ? "保存中..." : "保存全部配置" }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import {
  createDefaultModelBackend,
  reasoningEffortOptions,
  toolCatalog,
  type AppConfig,
  type ModelBackend,
  type ReasoningEffort
} from "@dglab-ai/shared";
import { computed, onMounted, reactive, ref } from "vue";
import { useConfigStore } from "../configStore";

const configStore = useConfigStore();
const form = reactive<AppConfig>({
  activeBackendId: "",
  backends: []
});
const selectedBackendId = ref("");
const saving = ref(false);
const message = ref("");
const error = ref("");
const reasoningEffortLabels: Record<ReasoningEffort, string> = {
  low: "低强度推理",
  medium: "中强度推理",
  high: "高强度推理"
};

const selectedBackend = computed<ModelBackend | null>(() => (
  form.backends.find((backend) => backend.id === selectedBackendId.value)
  ?? form.backends[0]
  ?? null
));

function cloneBackend(backend: ModelBackend): ModelBackend {
  return {
    ...backend,
    toolStates: { ...backend.toolStates }
  };
}

function replaceForm(config: AppConfig) {
  form.activeBackendId = config.activeBackendId;
  form.backends = config.backends.map(cloneBackend);
  if (!form.backends.some((backend) => backend.id === selectedBackendId.value)) {
    selectedBackendId.value = form.activeBackendId || form.backends[0]?.id || "";
  }
}

function createBackendId(): string {
  return `backend-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function addBackend() {
  const template = selectedBackend.value ?? createDefaultModelBackend();
  const backend = cloneBackend({
    ...template,
    id: createBackendId(),
    name: `${template.name} ${form.backends.length + 1}`
  });
  form.backends.push(backend);
  selectedBackendId.value = backend.id;
}

function removeBackend(backendId: string) {
  if (form.backends.length === 1) {
    return;
  }
  const nextBackends = form.backends.filter((backend) => backend.id !== backendId);
  form.backends = nextBackends;
  if (form.activeBackendId === backendId) {
    form.activeBackendId = nextBackends[0]?.id ?? "";
  }
  if (selectedBackendId.value === backendId) {
    selectedBackendId.value = form.activeBackendId || nextBackends[0]?.id || "";
  }
}

async function loadConfig() {
  error.value = "";
  replaceForm(await configStore.ensureConfigLoaded());
}

async function save() {
  saving.value = true;
  message.value = "";
  error.value = "";
  try {
    const saved = await configStore.saveAppConfig({
      activeBackendId: form.activeBackendId,
      backends: form.backends.map(cloneBackend)
    });
    replaceForm(saved);
    message.value = "配置已保存。当前默认后端会用于之后新建的 session。";
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadConfig();
});
</script>
