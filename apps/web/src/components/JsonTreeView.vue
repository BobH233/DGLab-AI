<template>
  <span
    v-if="kind === 'null'"
    class="json-tree__token json-tree__token--null"
  >null</span>
  <span
    v-else-if="kind === 'string'"
    class="json-tree__token json-tree__token--string"
  >"{{ String(value ?? "") }}"</span>
  <span
    v-else-if="kind === 'number'"
    class="json-tree__token json-tree__token--number"
  >{{ String(value) }}</span>
  <span
    v-else-if="kind === 'boolean'"
    class="json-tree__token json-tree__token--boolean"
  >{{ String(value) }}</span>
  <details
    v-else
    class="json-tree"
    :open="depth === 0"
  >
    <summary class="json-tree__summary">
      <span class="json-tree__preview">{{ previewText }}</span>
    </summary>
    <div class="json-tree__children">
      <div
        v-for="entry in normalizedEntries"
        :key="entry.key"
        class="json-tree__entry"
      >
        <span class="json-tree__key">{{ entry.label }}</span>
        <span class="json-tree__colon">: </span>
        <JsonTreeView
          :value="entry.value"
          :depth="depth + 1"
        />
      </div>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed } from "vue";

defineOptions({
  name: "JsonTreeView"
});

type JsonEntry = {
  key: string;
  label: string;
  value: unknown;
};

const props = withDefaults(defineProps<{
  value: unknown;
  depth?: number;
}>(), {
  depth: 0
});

const kind = computed(() => {
  if (props.value === null || props.value === undefined) {
    return "null";
  }
  if (Array.isArray(props.value)) {
    return "array";
  }
  if (typeof props.value === "object") {
    return "object";
  }
  if (typeof props.value === "string") {
    return "string";
  }
  if (typeof props.value === "number") {
    return "number";
  }
  if (typeof props.value === "boolean") {
    return "boolean";
  }
  return "string";
});

const normalizedEntries = computed<JsonEntry[]>(() => {
  if (Array.isArray(props.value)) {
    return props.value.map((entry, index) => ({
      key: `array:${index}`,
      label: String(index),
      value: entry
    }));
  }
  if (props.value && typeof props.value === "object") {
    return Object.entries(props.value).map(([key, value]) => ({
      key,
      label: key,
      value
    }));
  }
  return [];
});

const previewText = computed(() => {
  if (kind.value === "array") {
    return `Array(${normalizedEntries.value.length})`;
  }
  return `Object {${normalizedEntries.value.length}}`;
});
</script>
