<template>
  <section class="login-page">
    <div class="login-page__backdrop" />
    <div class="login-card panel">
      <span class="brand-chip">Access Control</span>
      <h1>DGLabAI</h1>
      <p class="login-copy">
        输入访问密码后才能使用站内功能。验证通过后，密码会保存在当前浏览器，并自动附带到后续 API 请求中。
      </p>
      <form class="login-form" @submit.prevent="submit">
        <label>
          <span>访问密码</span>
          <input
            v-model="password"
            class="field"
            type="password"
            autocomplete="current-password"
            placeholder="请输入访问密码"
          />
        </label>
        <button class="button primary button-block" :disabled="loading || !password.trim()" type="submit">
          {{ loading ? "验证中..." : "进入工作台" }}
        </button>
      </form>
      <p v-if="redirectLabel" class="soft-note">登录后会返回到：{{ redirectLabel }}</p>
      <p v-if="error" class="error-text">{{ error }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";
import { setSavedAuthPassword, useAuthStore } from "../auth";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const password = ref(authStore.password.value);
const loading = ref(false);
const error = ref("");

const redirectTarget = computed(() => {
  const redirect = route.query.redirect;
  if (typeof redirect === "string" && redirect.startsWith("/")) {
    return redirect;
  }
  return "/";
});

const redirectLabel = computed(() => redirectTarget.value === "/" ? "" : redirectTarget.value);

async function submit() {
  const candidate = password.value.trim();
  if (!candidate) {
    error.value = "请输入访问密码";
    return;
  }

  loading.value = true;
  error.value = "";
  try {
    await api.login(candidate);
    setSavedAuthPassword(candidate);
    await router.replace(redirectTarget.value);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "登录失败";
  } finally {
    loading.value = false;
  }
}
</script>
