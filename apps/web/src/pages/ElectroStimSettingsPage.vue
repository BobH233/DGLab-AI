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

      <div class="e-stim-curve-card stack">
        <div class="section-head">
          <div>
            <h3>力度曲线映射</h3>
            <p class="soft-note">剧情和 agent 给出的 0-100% 强度会先走这条曲线，再换算成真实下发到本地设备的力度。</p>
          </div>
          <span class="soft-pill e-stim-curve-pill">{{ activeCurvePresetLabel }}</span>
        </div>

        <div class="e-stim-curve-presets">
          <button
            v-for="preset in intensityCurvePresetOptions"
            :key="preset.id"
            type="button"
            class="e-stim-curve-preset"
            :class="{ 'e-stim-curve-preset--active': form.intensityCurve.preset === preset.id }"
            @click="applyIntensityCurvePreset(preset.id)"
          >
            <strong>{{ preset.label }}</strong>
            <span>{{ preset.description }}</span>
          </button>
        </div>

        <div class="e-stim-curve-preview">
          <div class="e-stim-curve-chart">
            <svg :viewBox="`0 0 ${curveChartSvgWidth} ${curveChartSvgHeight}`" aria-label="力度曲线预览">
              <line
                v-for="gridLine in intensityCurveVerticalGridLines"
                :key="`x-${gridLine.key}`"
                :x1="gridLine.position"
                :y1="curveChartBounds.top"
                :x2="gridLine.position"
                :y2="curveChartBounds.bottom"
                class="e-stim-curve-gridline"
              />
              <line
                v-for="gridLine in intensityCurveHorizontalGridLines"
                :key="`y-${gridLine.key}`"
                :x1="curveChartBounds.left"
                :y1="gridLine.position"
                :x2="curveChartBounds.right"
                :y2="gridLine.position"
                class="e-stim-curve-gridline"
              />
              <path :d="intensityCurveAreaPath" class="e-stim-curve-area" />
              <path :d="intensityCurveBaselinePath" class="e-stim-curve-baseline" />
              <path :d="intensityCurvePath" class="e-stim-curve-path" />
              <circle
                v-for="point in intensityCurveChartPoints"
                :key="point.inputPercent"
                :cx="point.x"
                :cy="point.y"
                r="6"
                class="e-stim-curve-point"
              />
            </svg>
            <span class="e-stim-curve-axis e-stim-curve-axis--y">真实下发</span>
            <span class="e-stim-curve-axis e-stim-curve-axis--x">剧情强度</span>
          </div>

          <div class="e-stim-curve-samples">
            <article
              v-for="sample in intensityCurveSamples"
              :key="sample.inputPercent"
              class="e-stim-curve-sample-card"
            >
              <span>剧情 {{ sample.inputPercent }}%</span>
              <strong>实际 {{ sample.outputPercent }}%</strong>
            </article>
          </div>
        </div>

        <div class="stack">
          <label
            v-for="point in editableIntensityCurvePoints"
            :key="point.inputPercent"
            class="e-stim-curve-row"
          >
            <span class="e-stim-curve-row__label">剧情 {{ point.inputPercent }}%</span>
            <input
              :value="point.outputPercent"
              class="e-stim-curve-row__slider"
              type="range"
              :min="point.minOutput"
              max="100"
              step="1"
              :disabled="point.locked"
              @input="updateIntensityCurvePoint(point.inputPercent, $event)"
            />
            <input
              :value="point.outputPercent"
              class="field field--compact e-stim-curve-row__number"
              type="number"
              :min="point.minOutput"
              max="100"
              step="1"
              :disabled="point.locked"
              @input="updateIntensityCurvePoint(point.inputPercent, $event)"
            />
            <small>真实 {{ point.outputPercent }}%</small>
          </label>
        </div>

        <p class="soft-note">0% 固定映射到 0%。其余节点会保持单调不下降，避免剧情更强时真实下发反而更弱；如果想整体更保守，可以把 100% 节点也调低。</p>
      </div>

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
  ELECTRO_STIM_INTENSITY_CURVE_ANCHORS,
  createDefaultElectroStimLocalConfig,
  createPresetElectroStimIntensityCurve,
  fetchElectroStimPulseList,
  loadElectroStimLocalConfig,
  mapIntensityPercentThroughCurve,
  parseGameConnectionCode,
  saveElectroStimLocalConfig,
  testElectroStimConnection,
  type ElectroStimIntensityCurvePreset,
  type ElectroStimLocalConfig
} from "../lib/eStim";

const form = reactive<ElectroStimLocalConfig>(loadElectroStimLocalConfig());
const testingConnection = ref(false);
const loadingPulses = ref(false);
const saving = ref(false);
const message = ref("");
const error = ref("");
const connectionSummary = ref("");
const intensityCurvePresetOptions = [
  {
    id: "linear",
    label: "线性",
    description: "剧情 50%，真实就按 50% 下发。"
  },
  {
    id: "easeOut",
    label: "渐缓",
    description: "前段更敏感，后段更平滑。"
  },
  {
    id: "easeIn",
    label: "渐快",
    description: "前段更克制，后段再明显抬升。"
  },
  {
    id: "sCurve",
    label: "S 曲线",
    description: "首尾更温和，中段过渡更顺。"
  },
  {
    id: "custom",
    label: "自定义",
    description: "手动调每个关键节点的映射。"
  }
] as const satisfies ReadonlyArray<{
  id: ElectroStimIntensityCurvePreset;
  label: string;
  description: string;
}>;

const parsedConnection = computed(() => parseGameConnectionCode(form.gameConnectionCode));
const selectedPulseCount = computed(() => form.allowedPulseIds.length);
const curveChartSvgWidth = 360;
const curveChartSvgHeight = 220;
const curveChartBounds = {
  left: 12,
  right: 336,
  top: 12,
  bottom: 188
};
const intensityCurveGridLines = [0, 25, 50, 75, 100];
const activeCurvePresetLabel = computed(() => intensityCurvePresetOptions.find((item) => item.id === form.intensityCurve.preset)?.label ?? "自定义");
const intensityCurveSamples = computed(() => ELECTRO_STIM_INTENSITY_CURVE_ANCHORS.map((inputPercent) => ({
  inputPercent,
  outputPercent: mapIntensityPercentThroughCurve(form.intensityCurve, inputPercent) ?? inputPercent
})));
const editableIntensityCurvePoints = computed(() => form.intensityCurve.points.map((point, index) => ({
  ...point,
  locked: index === 0,
  minOutput: index === 0 ? 0 : form.intensityCurve.points[index - 1]?.outputPercent ?? 0
})));
const intensityCurveVerticalGridLines = computed(() => intensityCurveGridLines.map((value) => ({
  key: value,
  position: curveChartBounds.left + ((curveChartBounds.right - curveChartBounds.left) * value) / 100
})));
const intensityCurveHorizontalGridLines = computed(() => intensityCurveGridLines.map((value) => ({
  key: value,
  position: curveChartBounds.bottom - ((curveChartBounds.bottom - curveChartBounds.top) * value) / 100
})));
const intensityCurveChartPoints = computed(() => form.intensityCurve.points.map((point) => ({
  ...point,
  x: curveChartBounds.left + ((curveChartBounds.right - curveChartBounds.left) * point.inputPercent) / 100,
  y: curveChartBounds.bottom - ((curveChartBounds.bottom - curveChartBounds.top) * point.outputPercent) / 100
})));
const intensityCurvePath = computed(() => intensityCurveChartPoints.value.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "));
const intensityCurveBaselinePath = computed(() => {
  const startX = curveChartBounds.left;
  const startY = curveChartBounds.bottom;
  const endX = curveChartBounds.right;
  const endY = curveChartBounds.top;
  return `M ${startX} ${startY} L ${endX} ${endY}`;
});
const intensityCurveAreaPath = computed(() => {
  const points = intensityCurveChartPoints.value;
  if (points.length === 0) {
    return "";
  }
  const commands = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  return `${commands} L ${lastPoint.x} ${curveChartBounds.bottom} L ${firstPoint.x} ${curveChartBounds.bottom} Z`;
});

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
    channelPlacements: {
      ...form.channelPlacements
    },
    intensityCurve: {
      preset: form.intensityCurve.preset,
      points: form.intensityCurve.points.map((point) => ({
        inputPercent: point.inputPercent,
        outputPercent: point.outputPercent
      }))
    },
    availablePulses: [...form.availablePulses],
    allowedPulseIds: [...form.allowedPulseIds]
  });
  message.value = text;
}

function applyIntensityCurvePreset(preset: ElectroStimIntensityCurvePreset) {
  if (preset === "custom") {
    form.intensityCurve = {
      preset: "custom",
      points: form.intensityCurve.points.map((point) => ({
        inputPercent: point.inputPercent,
        outputPercent: point.outputPercent
      }))
    };
    return;
  }
  form.intensityCurve = createPresetElectroStimIntensityCurve(preset);
}

function updateIntensityCurvePoint(inputPercent: number, event: Event) {
  const target = event.target as HTMLInputElement;
  const parsedValue = Number(target.value);
  const nextValue = Number.isFinite(parsedValue) ? Math.min(100, Math.max(0, Math.round(parsedValue))) : 0;
  const nextPoints = form.intensityCurve.points.map((point) => ({
    inputPercent: point.inputPercent,
    outputPercent: point.outputPercent
  }));
  const pointIndex = nextPoints.findIndex((point) => point.inputPercent === inputPercent);
  if (pointIndex <= 0) {
    return;
  }
  nextPoints[pointIndex].outputPercent = Math.max(nextPoints[pointIndex - 1].outputPercent, nextValue);
  for (let index = pointIndex + 1; index < nextPoints.length; index += 1) {
    nextPoints[index].outputPercent = Math.max(nextPoints[index - 1].outputPercent, nextPoints[index].outputPercent);
  }
  form.intensityCurve = {
    preset: "custom",
    points: nextPoints
  };
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
