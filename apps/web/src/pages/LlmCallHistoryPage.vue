<template>
  <section class="panel stack">
    <div class="section-head">
      <div>
        <h2>模型调用记录</h2>
        <p class="soft-note">展示全部 LLM 调用，默认按开始时间倒序排列，可分页查看。</p>
      </div>
      <div class="actions">
        <label class="list-size-control">
          <span>每页</span>
          <select v-model.number="pageSize" class="field field--compact" @change="handlePageSizeChange">
            <option :value="10">10</option>
            <option :value="25">25</option>
            <option :value="50">50</option>
          </select>
        </label>
        <button class="button secondary" :disabled="loading" @click="loadCalls">
          {{ loading ? "刷新中..." : "刷新" }}
        </button>
      </div>
    </div>

    <div class="usage-overview">
      <div class="usage-stat-card">
        <span class="soft-note">总记录数</span>
        <strong>{{ listData.total }}</strong>
      </div>
      <div class="usage-stat-card">
        <span class="soft-note">当前页</span>
        <strong>{{ page }} / {{ totalPages }}</strong>
      </div>
      <div class="usage-stat-card">
        <span class="soft-note">本页成功率</span>
        <strong>{{ successRate }}</strong>
      </div>
    </div>

    <p v-if="error" class="error-text">{{ error }}</p>

    <div class="llm-call-table-wrap">
      <table class="llm-call-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>模型</th>
            <th>用时</th>
            <th>提示</th>
            <th>补全</th>
            <th>总计</th>
            <th>状态</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in listData.items" :key="item.id">
            <td>{{ formatDate(item.startedAt) }}</td>
            <td>
              <div class="llm-call-model">
                <strong>{{ item.model }}</strong>
                <small>{{ item.schemaName }}</small>
              </div>
            </td>
            <td>{{ formatDuration(item.durationMs) }}</td>
            <td>{{ item.promptTokens }}</td>
            <td>{{ item.completionTokens }}</td>
            <td>{{ item.totalTokens }}</td>
            <td>
              <span
                class="llm-call-badge"
                :class="item.status === 'success' ? 'llm-call-badge--success' : 'llm-call-badge--error'"
              >
                {{ item.status === "success" ? "成功" : "失败" }}
              </span>
            </td>
            <td>
              <div class="llm-call-detail">
                <strong>{{ item.kind }}</strong>
                <small v-if="item.sessionId">Session: {{ item.sessionId }}</small>
                <small v-if="item.errorMessage">{{ item.errorMessage }}</small>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && listData.items.length === 0">
            <td colspan="8" class="empty-cell">还没有模型调用记录。</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="pagination-bar">
      <button class="button secondary" :disabled="loading || page <= 1" @click="goToPage(page - 1)">
        上一页
      </button>
      <p class="soft-note">第 {{ page }} 页，共 {{ totalPages }} 页</p>
      <button class="button secondary" :disabled="loading || page >= totalPages" @click="goToPage(page + 1)">
        下一页
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../api";
import type { LlmCallListResponse } from "@dglab-ai/shared";

const loading = ref(false);
const error = ref("");
const page = ref(1);
const pageSize = ref(25);
const listData = ref<LlmCallListResponse>({
  items: [],
  page: 1,
  pageSize: 25,
  total: 0,
  totalPages: 0
});

const totalPages = computed(() => Math.max(listData.value.totalPages, 1));
const successRate = computed(() => {
  if (listData.value.items.length === 0) {
    return "0%";
  }
  const successCount = listData.value.items.filter((item) => item.status === "success").length;
  return `${Math.round((successCount / listData.value.items.length) * 100)}%`;
});

async function loadCalls() {
  loading.value = true;
  error.value = "";
  try {
    let result = await api.listLlmCalls(page.value, pageSize.value);
    if (result.totalPages > 0 && page.value > result.totalPages) {
      page.value = result.totalPages;
      result = await api.listLlmCalls(page.value, pageSize.value);
    }
    listData.value = result;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "加载模型调用记录失败";
  } finally {
    loading.value = false;
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }
  return `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)} s`;
}

function goToPage(nextPage: number) {
  if (loading.value || nextPage < 1 || nextPage === page.value || nextPage > totalPages.value) {
    return;
  }
  page.value = nextPage;
  void loadCalls();
}

function handlePageSizeChange() {
  page.value = 1;
  void loadCalls();
}

onMounted(() => {
  void loadCalls();
});
</script>
