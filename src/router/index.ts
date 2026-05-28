import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/commandes',
    },
    {
      path: '/commandes',
      name: 'commandes',
      component: () => import('../views/CommandesView.vue'),
    },
    {
      path: '/panneaux',
      name: 'panneaux',
      component: () => import('../views/PanneauxView.vue'),
    },
    {
      path: '/pieces',
      name: 'pieces',
      component: () => import('../views/PiecesView.vue'),
    },
    {
      path: '/jumeau-numerique',
      name: 'jumeau-numerique',
      component: () => import('../views/JumeauNumeriqueView.vue'),
    },
    {
      path: '/registres-donnees',
      name: 'registres-donnees',
      component: () => import('../views/RegistresDonneesView.vue'),
    },
    {
      path: '/taches',
      name: 'taches',
      component: () => import('../views/TachesView.vue'),
    },
    {
      path: '/donnees',
      name: 'donnees',
      component: () => import('../views/InstructionsView.vue'),
    },
    {
      path: '/stl-rendu-3d',
      redirect: '/donnees',
    },
    {
      path: '/g-codes',
      redirect: '/donnees',
    },
  ],
})

export default router
