<template>
  <div class="memory-run-table">
    <table>
      <thead>
        <tr>
          <th>类型</th>
          <th>范围</th>
          <th>输出</th>
          <th>状态</th>
          <th>耗时</th>
          <th>模型</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="run in runs.slice().reverse()" :key="run.id">
          <td>{{ run.kind }}</td>
          <td>{{ run.inputRange }}</td>
          <td>{{ run.outputLevel }}</td>
          <td>{{ run.status }}</td>
          <td>{{ run.durationMs }} ms</td>
          <td>{{ run.sourceModel ?? "-" }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="latestError" class="error-text">{{ latestError }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { MemoryRunRecord } from "@dglab-ai/shared";

const props = defineProps<{
  runs: MemoryRunRecord[];
}>();

const latestError = computed(() => props.runs.slice().reverse().find((run) => run.errorMessage)?.errorMessage ?? "");
</script>
