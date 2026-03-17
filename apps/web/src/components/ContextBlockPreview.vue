<template>
  <article class="context-block">
    <header class="context-block__head">
      <div>
        <span class="eyebrow">{{ title }}</span>
        <h4>{{ subtitle }}</h4>
      </div>
      <span class="soft-pill">{{ charCount }} chars</span>
    </header>
    <pre class="context-block__body">{{ text }}</pre>
  </article>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string;
  subtitle?: string;
  text: string;
  charCount: number;
}>(), {
  subtitle: "Prompt Block"
});
</script>
