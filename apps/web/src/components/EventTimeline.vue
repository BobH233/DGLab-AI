<template>
  <section class="timeline">
    <article
      v-if="automationStatus"
      class="timeline-item"
      data-kind="system"
      data-compact="true"
      data-automation="true"
      :data-live="automationStatus.live ? 'true' : undefined"
    >
      <div class="timeline-rail">
        <span class="timeline-dot" />
      </div>
      <div class="timeline-compact">
        <span class="timeline-compact__kicker">自动推进</span>
        <strong class="timeline-compact__title">{{ automationStatus.title }}</strong>
        <span v-if="automationStatus.meta" class="timeline-compact__meta">{{ automationStatus.meta }}</span>
        <span v-if="automationStatus.live" class="timeline-compact__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    </article>
    <article
      v-for="item in presentationItems"
      :key="item.id"
      class="timeline-item"
      :data-kind="item.kind"
      :data-compact="item.compact ? 'true' : undefined"
      :data-optional-tool="item.optionalTool ? 'true' : undefined"
      :data-live="isLivePause(item) ? 'true' : undefined"
    >
      <div class="timeline-rail">
        <span class="timeline-dot" />
      </div>
      <div v-if="item.compact" class="timeline-compact">
        <span class="timeline-compact__kicker">{{ item.kicker }}</span>
        <strong class="timeline-compact__title">{{ item.title }}</strong>
        <span v-if="item.main" class="timeline-compact__main">{{ item.main }}</span>
        <span v-if="item.meta" class="timeline-compact__meta">{{ item.meta }}</span>
        <span v-if="pauseLiveLabel(item)" class="timeline-compact__status">{{ pauseLiveLabel(item) }}</span>
        <span v-if="isLivePause(item)" class="timeline-compact__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span class="timeline-compact__time">{{ item.timeLabel }}</span>
      </div>
      <div v-else :class="cardClass(item)">
        <header class="event-header">
          <div class="event-title-block">
            <span class="event-kicker">{{ item.kicker }}</span>
            <strong>{{ item.title }}</strong>
          </div>
          <span>#{{ item.seq }} · {{ item.timeLabel }}</span>
        </header>
        <div class="event-body">
          <p v-if="item.main" class="event-main">{{ item.main }}</p>
          <div v-if="item.diffLines?.length" class="event-diff" aria-label="状态差异">
            <p
              v-for="line in item.diffLines"
              :key="`${line.prefix}-${line.value}`"
              class="event-diff__line"
              :data-prefix="line.prefix"
            >
              <span class="event-diff__prefix">{{ line.prefix }}</span>
              <span class="event-diff__value">{{ line.value }}</span>
            </p>
          </div>
          <div v-if="item.details?.length" class="event-detail-list">
            <p v-for="detail in item.details" :key="`${detail.label}-${detail.value}`" class="event-detail-row">
              <strong class="event-detail-label">{{ detail.label }}：</strong>
              <span class="event-detail-value">{{ detail.value }}</span>
            </p>
          </div>
          <p v-if="item.meta" class="event-meta">{{ item.meta }}</p>
        </div>
        <div v-if="item.tags.length" class="event-tags">
          <span v-for="tag in item.tags" :key="tag" class="event-tag">{{ tag }}</span>
        </div>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { SessionEvent } from "@dglab-ai/shared";
import { buildTimelinePresentationItems, type PresentationItem } from "../lib/timelinePresentation";

type ActivePauseState = {
  id: string;
  countdownLabel: string;
};

type AutomationStatusState = {
  title: string;
  meta?: string;
  live?: boolean;
};

const props = defineProps<{
  events: SessionEvent[];
  activePause?: ActivePauseState | null;
  automationStatus?: AutomationStatusState | null;
}>();

const presentationItems = computed<PresentationItem[]>(() => {
  return buildTimelinePresentationItems(props.events).slice().reverse();
});

function isLivePause(item: PresentationItem): boolean {
  return Boolean(item.pauseId) && item.pauseId === props.activePause?.id;
}

function pauseLiveLabel(item: PresentationItem): string | undefined {
  return isLivePause(item) ? props.activePause?.countdownLabel : undefined;
}

function cardClass(item: PresentationItem): string[] {
  return [
    "event-card",
    ...(item.kind === "player" ? ["event-card--player"] : []),
    ...(item.kind === "dialogue" ? ["event-card--dialogue"] : []),
    ...(item.kind === "inventory" ? ["event-card--inventory"] : []),
    ...(item.optionalTool ? ["event-card--optional-tool"] : [])
  ];
}
</script>
