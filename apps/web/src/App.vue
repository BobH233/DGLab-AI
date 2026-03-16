<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand-block">
        <span class="brand-chip">Narrative Control</span>
        <div>
          <h1>DGLabAI</h1>
          <p>多智能体剧情推演工作台</p>
        </div>
      </div>
      <nav class="topnav">
        <RouterLink to="/">会话</RouterLink>
        <RouterLink to="/settings">配置</RouterLink>
      </nav>
    </header>
    <main class="page-shell">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
</script>
