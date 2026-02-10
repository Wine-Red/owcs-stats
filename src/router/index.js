import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('../views/dashboard/Dashboard.vue')
  },
  {
    path: '/data-entry',
    name: 'DataEntry',
    component: () => import('../views/data-entry/DataEntry.vue')
  },
  {
    path: '/data-manage',
    name: 'DataManage',
    component: () => import('../views/data-manage/DataManage.vue')
  },
  {
    path: '/visualize',
    name: 'Visualize',
    component: () => import('../views/visualize/Visualize.vue')
  },
  { 
    path: '/', 
    redirect: '/dashboard' },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
});

export default router;