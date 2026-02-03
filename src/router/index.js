import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
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
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;