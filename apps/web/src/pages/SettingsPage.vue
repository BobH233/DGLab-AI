<template>
  <section class="panel stack">
    <h2>全局 LLM 配置</h2>
    <label>
      <span>API Base URL</span>
      <input v-model="config.baseUrl" class="field" />
    </label>
    <label>
      <span>API Key</span>
      <input v-model="config.apiKey" class="field" type="password" />
    </label>
    <label>
      <span>Model</span>
      <input v-model="config.model" class="field" />
    </label>
    <label>
      <span>Temperature</span>
      <input v-model.number="config.temperature" class="field" type="number" min="0" max="2" step="0.1" />
    </label>
    <label>
      <span>Top P</span>
      <input v-model.number="config.topP" class="field" type="number" min="0" max="1" step="0.05" />
    </label>
    <label>
      <span>Max Tokens</span>
      <input v-model.number="config.maxTokens" class="field" type="number" min="1" step="100" />
    </label>
    <label>
      <span>Request Timeout (ms)</span>
      <input v-model.number="config.requestTimeoutMs" class="field" type="number" min="1000" step="1000" />
    </label>
    <div class="actions">
      <button class="button primary" :disabled="saving" @click="save">
        {{ saving ? "保存中..." : "保存配置" }}
      </button>
    </div>
    <p v-if="message" class="success-text">{{ message }}</p>
    <p v-if="error" class="error-text">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import type { LlmConfig } from "@dglab-ai/shared";
import { onMounted, reactive, ref } from "vue";
import { api } from "../api";

const config = reactive<LlmConfig>({
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "replace-me",
  model: "gpt-4.1-mini",
  temperature: 0.9,
  maxTokens: 1200,
  topP: 1,
  requestTimeoutMs: 120000
});
const saving = ref(false);
const message = ref("");
const error = ref("");

async function loadConfig() {
  Object.assign(config, await api.getConfig());
}

async function save() {
  saving.value = true;
  message.value = "";
  error.value = "";
  try {
    Object.assign(config, await api.saveConfig({ ...config }));
    message.value = "配置已保存。新建 session 会使用新的默认配置。";
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
