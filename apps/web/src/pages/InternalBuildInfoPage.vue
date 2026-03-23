<template>
  <div class="stack build-info-layout">
    <section class="panel stack">
      <div class="section-head">
        <div>
          <span class="eyebrow">Internal Build</span>
          <h2>内部构建信息</h2>
          <p class="soft-note">
            连续点击顶部的 Narrative Control 三次即可进入这里，用来确认当前界面对应的是哪一次 GitHub Actions 构建。
          </p>
        </div>
        <RouterLink class="button ghost" to="/">返回会话</RouterLink>
      </div>

      <div class="build-info-hero">
        <article class="build-info-stat">
          <span>构建完成时间</span>
          <strong>{{ formatDateTime(buildInfo.completedAt ?? buildInfo.startedAt) }}</strong>
          <small>{{ buildInfo.completedAt ?? buildInfo.startedAt ?? "未注入" }}</small>
        </article>
        <article class="build-info-stat">
          <span>构建耗时</span>
          <strong>{{ formatDuration(buildInfo.durationMs) }}</strong>
          <small>{{ formatDurationDetail(buildInfo.durationMs) }}</small>
        </article>
        <article class="build-info-stat">
          <span>Commit</span>
          <strong class="build-info-mono">{{ buildInfo.commitShortSha ?? "未注入" }}</strong>
          <small class="build-info-mono">{{ buildInfo.commitSha ?? "未注入" }}</small>
        </article>
      </div>

      <p v-if="showFallbackNote" class="soft-note">
        当前显示的是编译时兜底信息，说明 `build-info.json` 没有被加载到；本地开发环境下这是正常的。
      </p>
    </section>

    <div class="grid two-col build-info-grid">
      <section class="panel stack build-info-card">
        <div class="section-head">
          <div>
            <h3>提交信息</h3>
            <p class="soft-note">用于快速确认这个前端 bundle 是从哪一次提交打出来的。</p>
          </div>
          <a
            v-if="commitUrl"
            class="build-info-link"
            :href="commitUrl"
            target="_blank"
            rel="noreferrer"
          >
            查看 Commit
          </a>
        </div>

        <div class="build-info-fields">
          <div class="build-info-field">
            <span>Commit Message</span>
            <strong class="build-info-message">{{ buildInfo.commitMessage ?? "未注入" }}</strong>
          </div>
          <div class="build-info-field">
            <span>Branch</span>
            <strong>{{ buildInfo.branch ?? "未注入" }}</strong>
          </div>
          <div class="build-info-field">
            <span>Repository</span>
            <strong>{{ buildInfo.repository ?? "未注入" }}</strong>
          </div>
          <div class="build-info-field">
            <span>触发事件</span>
            <strong>{{ buildInfo.eventName ?? "未注入" }}</strong>
          </div>
        </div>
      </section>

      <section class="panel stack build-info-card">
        <div class="section-head">
          <div>
            <h3>GitHub Actions</h3>
            <p class="soft-note">这里显示注入到产物里的 workflow run 元数据，便于排查线上到底跑了哪一趟。</p>
          </div>
          <a
            v-if="resolvedRunUrl"
            class="build-info-link"
            :href="resolvedRunUrl"
            target="_blank"
            rel="noreferrer"
          >
            打开 Run
          </a>
        </div>

        <div class="build-info-fields">
          <div class="build-info-field">
            <span>Workflow</span>
            <strong>{{ buildInfo.workflowName ?? "未注入" }}</strong>
          </div>
          <div class="build-info-field">
            <span>Run Number</span>
            <strong>#{{ buildInfo.runNumber ?? "未注入" }}</strong>
          </div>
          <div class="build-info-field">
            <span>Run Attempt</span>
            <strong>{{ buildInfo.runAttempt ?? "未注入" }}</strong>
          </div>
          <div class="build-info-field">
            <span>Triggered By</span>
            <strong>{{ buildInfo.actor ?? "未注入" }}</strong>
          </div>
          <div class="build-info-field">
            <span>Metadata Source</span>
            <strong>{{ buildInfo.source }}</strong>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { loadBuildInfo, staticBuildInfo, type BuildInfo } from "../lib/buildInfo";

const buildInfo = ref<BuildInfo>(staticBuildInfo);

const commitUrl = computed(() => {
  if (!buildInfo.value.repository || !buildInfo.value.commitSha) {
    return null;
  }
  return `https://github.com/${buildInfo.value.repository}/commit/${buildInfo.value.commitSha}`;
});

const resolvedRunUrl = computed(() => {
  if (buildInfo.value.runUrl) {
    return buildInfo.value.runUrl;
  }
  if (!buildInfo.value.repository || !buildInfo.value.runId) {
    return null;
  }
  return `https://github.com/${buildInfo.value.repository}/actions/runs/${buildInfo.value.runId}`;
});

const showFallbackNote = computed(() => (
  buildInfo.value.source !== "github-actions" && buildInfo.value.source !== "build-info.json"
));

function formatDateTime(value: string | null): string {
  if (!value) {
    return "未注入";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatDuration(value: number | null): string {
  if (value === null) {
    return "未注入";
  }
  const totalSeconds = Math.max(0, Math.round(value / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds} 秒`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分 ${seconds} 秒`;
  }
  return `${minutes} 分 ${seconds} 秒`;
}

function formatDurationDetail(value: number | null): string {
  if (value === null) {
    return "GitHub Actions 未写入耗时";
  }
  return `${value} ms`;
}

onMounted(async () => {
  buildInfo.value = await loadBuildInfo();
});
</script>
