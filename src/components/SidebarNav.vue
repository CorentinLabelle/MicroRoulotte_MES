<template>
  <aside class="sidebar">
    <RouterLink to="/" class="brand" aria-label="Accueil">
      <img alt="Lab-Usine Logo" class="logo" src="/logoLabUsine.svg" />
    </RouterLink>

    <nav class="nav-links" aria-label="Navigation principale">
      <RouterLink to="/commandes">Commandes</RouterLink>
      <RouterLink to="/panneaux">Panneaux</RouterLink>
      <RouterLink to="/pieces">Pieces</RouterLink>
      <RouterLink to="/jumeau-numerique">Jumeau numerique</RouterLink>
      <RouterLink to="/registres-donnees">Registres de donnees</RouterLink>
      <RouterLink to="/taches">Tâches</RouterLink>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<style scoped>
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  width: 260px;
  height: 100vh;
  padding: 2rem 1.5rem;
  background: #000000;
  border-right: 1px solid #1f1f1f;
  color: #ffffff;
  overflow-y: auto;
  z-index: 100;
}

.brand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.logo {
  width: 160px;
  max-width: 100%;
  height: auto;
  object-fit: contain;
}

.nav-links {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.nav-links a {
  display: inline-flex;
  align-items: center;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  font-size: 1.125rem;
  color: inherit;
  text-decoration: none;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.nav-links a:hover {
  background: #2f343c;
}

.nav-links a.router-link-exact-active {
  background: #3a3f47;
  color: #ffffff;
}

@media (max-width: 1024px) {
  .sidebar {
    position: sticky;
    width: 100%;
    height: auto;
    padding: 1.25rem 1rem;
    left: 0;
  }

  .nav-links {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .nav-links a {
    flex: 1 1 45%;
    justify-content: center;
    font-size: 1rem;
  }
}

@media (max-width: 640px) {
  .nav-links a {
    flex-basis: 100%;
  }
}
</style>
