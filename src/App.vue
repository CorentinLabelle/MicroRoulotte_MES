<script setup lang="ts">
import { RouterView } from 'vue-router'
import SidebarNav from './components/SidebarNav.vue'
</script>

<template>
  <div class="app-shell">
    <SidebarNav />
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
  background: #f5f5f5;
  overflow-x: hidden;
  padding-left: 260px;
}

.content {
  flex: 1;
  min-width: 0;
  padding: 2.5rem 3rem;
  background: #f5f5f5;
  overflow-x: hidden;
}

@media (max-width: 1024px) {
  .app-shell {
    flex-direction: column;
    padding-left: 0;
  }

  .content {
    padding: 1.25rem 1rem 2rem;
  }
}
</style>
