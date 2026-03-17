<template>
  <section class="stack">
    <article v-for="turn in turns" :key="turn.id" class="recent-raw-turn">
      <header class="recent-raw-turn__head">
        <div>
          <span class="eyebrow">Recent Raw Turn</span>
          <h4>seq {{ turn.fromSeq }}-{{ turn.toSeq }}</h4>
        </div>
        <span class="soft-pill">{{ turn.eventCount }} events</span>
      </header>
      <pre class="recent-raw-turn__body">{{ formatTurn(turn.events) }}</pre>
    </article>
  </section>
</template>

<script setup lang="ts">
import type { RecentRawTurn, SessionEvent } from "@dglab-ai/shared";

defineProps<{
  turns: RecentRawTurn[];
}>();

function textOf(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function formatTurn(events: SessionEvent[]): string {
  return events.map((event) => {
    switch (event.type) {
      case "player.message":
        return `[${event.seq}] player: ${textOf(event.payload.text)}`;
      case "agent.speak_player":
        return `[${event.seq}] ${textOf(event.payload.speaker)} -> player: ${textOf(event.payload.message)}`;
      case "agent.stage_direction":
        return `[${event.seq}] ${textOf(event.payload.speaker)} action: ${textOf(event.payload.direction)}`;
      case "scene.updated":
        return `[${event.seq}] scene.updated: ${textOf(event.payload.summary)}`;
      default:
        return `[${event.seq}] ${event.type}: ${JSON.stringify(event.payload)}`;
    }
  }).join("\n");
}
</script>
