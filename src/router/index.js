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
    path: '/analytics',
    name: 'Analytics',
    component: () => import('../views/analytics/Analytics.vue')
  },
  {
    path: '/ai-guest',
    name: 'AIGuest',
    component: () => import('@/views/data-manage/components/AIReportChat.vue'),
    meta: { 
      title: '赛事数据助手',
      layout: 'blank' 
    }
  },
  { 
    path: '', 
    redirect: '/visualize' },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
});

export default router;
