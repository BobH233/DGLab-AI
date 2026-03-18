<template>
  <div class="grid two-col e-stim-layout">
    <section class="panel stack">
      <div class="section-head">
        <div>
          <span class="eyebrow">Local Device</span>
          <h2>DGLab-GameHub连接</h2>
          <p class="soft-note">这里的配置只保存在当前浏览器，用于调用玩家本机 localhost 上的电击器接口。</p>
        </div>
      </div>

      <label>
        <span>游戏连接码</span>
        <input
          v-model="form.gameConnectionCode"
          class="field"
          placeholder="客户端ID@http://127.0.0.1:8920"
        />
      </label>

      <div class="e-stim-connection-grid">
        <article class="metric-card">
          <span>客户端 ID</span>
          <strong>{{ parsedConnection?.clientId ?? "未解析" }}</strong>
        </article>
        <article class="metric-card">
          <span>本地后端地址</span>
          <strong>{{ parsedConnection?.baseUrl ?? "未解析" }}</strong>
        </article>
      </div>

      <div class="actions">
        <button class="button secondary" :disabled="testingConnection" @click="handleTestConnection">
          {{ testingConnection ? "测试中..." : "测试连接" }}
        </button>
        <button class="button secondary" :disabled="loadingPulses" @click="handleLoadPulses">
          {{ loadingPulses ? "获取中..." : "获取波形配置" }}
        </button>
        <button class="button primary" :disabled="saving" @click="handleSave">
          {{ saving ? "保存中..." : "保存本地配置" }}
        </button>
      </div>

      <p v-if="message" class="success-text">{{ message }}</p>
      <p v-if="error" class="error-text">{{ error }}</p>

      <div v-if="connectionSummary" class="e-stim-summary-card">
        <strong>最近一次连接测试</strong>
        <p>{{ connectionSummary }}</p>
      </div>
    </section>

    <section class="panel stack">
      <div class="section-head">
        <div>
          <span class="eyebrow">Gameplay</span>
          <h2>可用通道与波形</h2>
          <p class="soft-note">这些配置会在确认会话、发送消息和自动推进前同步给后端，让 agent 知道哪些能力可以调用。</p>
        </div>
      </div>

      <label class="toggle-row">
        <div>
          <strong>启用 B 通道</strong>
          <p>关闭后，后端提示词会明确禁止 agent 调用 B 通道。</p>
        </div>
        <input v-model="form.bChannelEnabled" type="checkbox" />
      </label>

      <label>
        <span>A 通道电极位置</span>
        <input v-model="form.channelPlacements.a" class="field" placeholder="例如：臀部 / 大腿根 / 腰侧" />
      </label>
      <label v-if="form.bChannelEnabled">
        <span>B 通道电极位置</span>
        <input v-model="form.channelPlacements.b" class="field" placeholder="例如：大腿两侧 / 背部 / 小腹" />
      </label>

      <div class="stack">
        <div class="section-head">
          <div>
            <h3>允许 agent 调用的波形</h3>
            <p class="soft-note">agent 只会看到波形名称，真正执行时前端再把名称映射回 pulseId。</p>
          </div>
          <span class="soft-pill">{{ selectedPulseCount }} / {{ form.availablePulses.length }}</span>
        </div>
        <p v-if="form.availablePulses.length === 0" class="soft-note">
          还没有加载到波形列表。先用上方按钮调用“获取波形配置”。
        </p>
        <label
          v-for="pulse in form.availablePulses"
          :key="pulse.id"
          class="tool-toggle"
        >
          <div>
            <strong>{{ pulse.name }}</strong>
            <p class="tool-meta">pulseId: {{ pulse.id }}</p>
          </div>
          <input
            :checked="form.allowedPulseIds.includes(pulse.id)"
            type="checkbox"
            @change="togglePulse(pulse.id, $event)"
          />
        </label>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import {
  createDefaultElectroStimLocalConfig,
  fetchElectroStimPulseList,
  loadElectroStimLocalConfig,
  parseGameConnectionCode,
  saveElectroStimLocalConfig,
  testElectroStimConnection,
  type ElectroStimLocalConfig
} from "../lib/eStim";

const form = reactive<ElectroStimLocalConfig>(loadElectroStimLocalConfig());
const testingConnection = ref(false);
const loadingPulses = ref(false);
const saving = ref(false);
const message = ref("");
const error = ref("");
const connectionSummary = ref("");

const parsedConnection = computed(() => parseGameConnectionCode(form.gameConnectionCode));
const selectedPulseCount = computed(() => form.allowedPulseIds.length);

function togglePulse(pulseId: string, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  const nextSet = new Set(form.allowedPulseIds);
  if (checked) {
    nextSet.add(pulseId);
  } else {
    nextSet.delete(pulseId);
  }
  form.allowedPulseIds = [...nextSet];
}

function persistWithMessage(text: string) {
  saveElectroStimLocalConfig({
    ...form,
    availablePulses: [...form.availablePulses],
    allowedPulseIds: [...form.allowedPulseIds]
  });
  message.value = text;
}

async function handleTestConnection() {
  testingConnection.value = true;
  message.value = "";
  error.value = "";
  try {
    const gameInfo = await testElectroStimConnection(form);
    form.lastValidatedAt = new Date().toISOString();
    connectionSummary.value = `连接成功。A 通道当前强度 ${gameInfo.clientStrength?.a?.strength ?? 0}/${gameInfo.clientStrength?.a?.limit ?? 0}，B 通道当前强度 ${gameInfo.clientStrength?.b?.strength ?? 0}/${gameInfo.clientStrength?.b?.limit ?? 0}。`;
    persistWithMessage("测试连接成功，本地接口可访问。");
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "连接测试失败";
  } finally {
    testingConnection.value = false;
  }
}

async function handleLoadPulses() {
  loadingPulses.value = true;
  message.value = "";
  error.value = "";
  try {
    const pulses = await fetchElectroStimPulseList(form);
    const allowed = new Set(form.allowedPulseIds);
    form.availablePulses = pulses;
    form.allowedPulseIds = pulses.filter((item) => allowed.has(item.id)).map((item) => item.id);
    persistWithMessage(`已获取 ${pulses.length} 个波形配置。`);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "获取波形失败";
  } finally {
    loadingPulses.value = false;
  }
}

function handleSave() {
  saving.value = true;
  message.value = "";
  error.value = "";
  try {
    persistWithMessage("电击器本地配置已保存。");
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
</script>
