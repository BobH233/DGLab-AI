<template>
  <article class="memory-summary-card" :data-level="summary.level">
    <header class="memory-summary-card__head">
      <div>
        <span class="eyebrow">{{ label }}</span>
        <h4>{{ heading }}</h4>
      </div>
      <span class="soft-pill">{{ summary.source }}</span>
    </header>
    <p class="memory-summary-card__range">seq {{ summary.fromSeq }}-{{ summary.toSeq }} · turns {{ summary.turnStart }}-{{ summary.turnEnd }}</p>
    <div class="memory-summary-card__meta">
      <span>阶段：{{ summary.scene.phase }}</span>
      <span>地点：{{ summary.scene.location }}</span>
      <span>张力：{{ summary.scene.tension }}/10</span>
    </div>
    <p class="memory-summary-card__summary">{{ summary.scene.summary || "暂无场景摘要" }}</p>
    <p v-if="summary.playerTrajectory" class="memory-summary-card__line"><strong>玩家轨迹：</strong>{{ summary.playerTrajectory }}</p>
    <p v-if="summary.carryForward" class="memory-summary-card__line"><strong>向前携带：</strong>{{ summary.carryForward }}</p>
    <div v-if="summary.keyDevelopments.length" class="memory-summary-card__tags">
      <span v-for="item in summary.keyDevelopments" :key="item" class="event-tag">{{ item }}</span>
    </div>
    <div v-if="summary.characterStates.length" class="memory-summary-card__list">
      <strong>角色状态</strong>
      <ul>
        <li v-for="item in summary.characterStates" :key="item">{{ item }}</li>
      </ul>
    </div>
    <div v-if="summary.unresolvedThreads.length" class="memory-summary-card__list">
      <strong>未决线索</strong>
      <ul>
        <li v-for="item in summary.unresolvedThreads" :key="item">{{ item }}</li>
      </ul>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { NarrativeSummary } from "@dglab-ai/shared";

const props = defineProps<{
  summary: NarrativeSummary;
  label?: string;
}>();

const label = computed(() => props.label ?? `${props.summary.level} memory`);
const heading = computed(() => {
  switch (props.summary.level) {
    case "archive":
      return "Archive Summary";
    case "episode":
      return "Episode Summary";
    default:
      return "Turn Summary";
  }
});
</script>
