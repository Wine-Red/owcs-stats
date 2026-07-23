import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';

const isStaticExport = import.meta.env.MODE === 'static';

const routes = [
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('../views/dashboard/Dashboard.vue')
  },
  {
    path: '/data-manage/:tab?',
    name: 'DataManage',
    component: () => import('../views/data-manage/DataManage.vue')
  },
  {
    path: '/visualize',
    name: 'Visualize',
    component: () => import('../views/visualize/Visualize.vue'),
    meta: {
      analyticsPage: 'visualize_home'
    }
  },
  {
    path: '/visualize/upcoming-match',
    name: 'UpcomingMatchDetail',
    component: () => import('../views/visualize/UpcomingMatchDetail.vue'),
    meta: {
      analyticsPage: 'visualize_upcoming_match_detail'
    }
  },
  {
    path: '/visualize/team-detail',
    name: 'TeamDetail',
    component: () => import('../views/visualize/TeamDetail.vue'),
    meta: {
      analyticsPage: 'visualize_team_detail'
    }
  },
  {
    path: '/visualize/match-detail',
    name: 'MatchDetail',
    component: () => import('../views/visualize/MatchDetail.vue'),
    meta: {
      analyticsPage: 'visualize_match_detail'
    }
  },
  {
    path: '/visualize/player-detail',
    name: 'PlayerDetail',
    component: () => import('../views/visualize/PlayerDetail.vue'),
    meta: {
      analyticsPage: 'visualize_player_detail'
    }
  },
  {
    path: '/analytics',
    name: 'Analytics',
    component: () => import('../views/analytics/Analytics.vue')
  },
  { 
    path: '', 
    redirect: '/visualize' },
];

const router = createRouter({
  history: isStaticExport
    ? createWebHashHistory(import.meta.env.BASE_URL)
    : createWebHistory(import.meta.env.BASE_URL),
  routes
});

if (isStaticExport) {
  router.beforeEach(to => {
    if (!to.path.startsWith('/visualize')) {
      return { path: '/visualize', replace: true };
    }
    return true;
  });
}

export default router;
