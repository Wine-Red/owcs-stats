<template>
  <teleport to="body">
    <div class="upcoming-fab-root" v-if="displayMatches.length > 0 || isLoading">
      <!-- 向上展开的赛程面板 -->
      <transition name="upcoming-panel">
        <div
          v-show="isOpen"
          ref="panelRef"
          class="upcoming-panel"
          role="dialog"
          aria-label="最近赛程"
        >
          <div class="panel-header">
            <span class="panel-title-bar" aria-hidden="true"></span>
            <span class="panel-title">Upcoming</span>
            <span class="panel-count" v-if="!isLoading">{{ displayMatches.length }}</span>
            <span class="panel-count panel-count--live" v-if="liveCount > 0">
              <span class="vis-live-dot" aria-hidden="true"></span>{{ liveCount }} LIVE
            </span>
          </div>

          <!-- 加载状态 -->
          <div class="panel-loading" v-if="isLoading">
            <div class="loading-spinner"></div>
            <div class="loading-text">加载中...</div>
          </div>

          <!-- 赛程列表：按日期分组，纵向排列 -->
          <transition-group v-else name="upcoming-item" tag="div" class="panel-list">
            <div
              v-for="item in listItems"
              :key="item.key"
              :class="item.type === 'header' ? 'date-divider' : 'upcoming-card vis-card-lift'"
              :style="{ '--item-index': item.index }"
              @click="item.type === 'match' && goToDetail(item.match)"
            >
              <!-- 日期分隔行 -->
              <template v-if="item.type === 'header'">
                <span class="date-label">{{ item.label }}</span>
                <span class="date-line" aria-hidden="true"></span>
              </template>

              <!-- 比赛卡 -->
              <template v-else>
                <!-- 状态与时间 -->
                <div class="match-status">
                  <span v-if="isOngoing(item.match.timestamp)" class="status-badge ongoing">
                    <span class="vis-live-dot" aria-hidden="true"></span>LIVE
                  </span>
                  <span v-else class="status-badge upcoming">
                    <span class="status-time">{{ formatClock(item.match.timestamp) }}</span>
                  </span>
                </div>

                <!-- 队伍对抗 -->
                <div class="match-teams">
                  <div class="team-side left-side">
                    <div class="team-logo-container">
                      <img :src="item.match.team1.logo" class="team-logo" alt="" />
                    </div>
                    <span class="team-name" :title="item.match.team1.name">{{ item.match.team1.name }}</span>
                  </div>

                  <div class="vs-text">vs</div>

                  <div class="team-side right-side">
                    <div class="team-logo-container">
                      <img :src="item.match.team2.logo" class="team-logo" alt="" />
                    </div>
                    <span class="team-name" :title="item.match.team2.name">{{ item.match.team2.name }}</span>
                  </div>
                </div>

                <div class="match-action-hint">赛事前瞻</div>
              </template>
            </div>
          </transition-group>
        </div>
      </transition>

      <!-- 圆形半透明悬浮按钮 -->
      <button
        ref="fabRef"
        type="button"
        class="upcoming-fab"
        :class="{ 'is-open': isOpen, 'is-loading': isLoading }"
        :aria-expanded="isOpen"
        aria-label="展开最近赛程"
        @click="togglePanel"
      >
        <span class="fab-glow" aria-hidden="true"></span>
        <span class="fab-icon fab-icon--calendar" aria-hidden="true">
          <el-icon><Calendar /></el-icon>
        </span>
        <span class="fab-icon fab-icon--close" aria-hidden="true">
          <el-icon><ArrowUp /></el-icon>
        </span>

        <!-- 数量徽标 -->
        <span class="fab-badge" v-if="!isLoading && displayMatches.length > 0">
          {{ displayMatches.length > 9 ? '9+' : displayMatches.length }}
        </span>
        <!-- LIVE 呼吸点 -->
        <span class="fab-live" v-if="liveCount > 0" aria-hidden="true"></span>
      </button>
    </div>
  </teleport>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useStore } from 'vuex';
import { useRoute, useRouter } from 'vue-router';
import { Calendar, ArrowUp } from '@element-plus/icons-vue';
import apiService from '@/services/api';
import { trackPublicEvent } from '@/utils/analytics';
import { TBD_TEAM_LOGO_URL } from '@/utils/teamLogos';
import {
  isLiquipediaTournamentMatch,
  isValidLiquipediaTournamentUrl
} from '@/utils/liquipediaTournament.mjs';

const CACHE_KEY = 'liquipedia_upcoming_matches';
const CACHE_EXPIRY = 60 * 1000; // 1 minute client-side cache
const TBD_LOGO_URL = TBD_TEAM_LOGO_URL;
const WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 声明一个模块级别的 Promise，用于防止多个组件实例或并发请求导致重复调用 API
let fetchPromise = null;

const pad2 = (value) => String(value).padStart(2, '0');

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export default {
  name: 'UpcomingMatches',
  components: {
    Calendar,
    ArrowUp
  },
  props: {
    liquipediaTournamentUrl: {
      type: String,
      default: ''
    },
    seasonId: {
      type: [String, Number],
      default: ''
    }
  },
  setup(props) {
    const store = useStore();
    const route = useRoute();
    const router = useRouter();
    const allMatches = ref([]);
    const isLoading = ref(true);
    const isOpen = ref(false);
    const panelRef = ref(null);
    const fabRef = ref(null);
    const hasLiquipediaTournamentUrl = computed(() => (
      isValidLiquipediaTournamentUrl(props.liquipediaTournamentUrl)
    ));

    const togglePanel = () => {
      isOpen.value = !isOpen.value;
    };

    const closePanel = () => {
      isOpen.value = false;
    };

    const onDocClick = (event) => {
      if (!isOpen.value) return;
      const target = event.target;
      if (panelRef.value?.contains(target) || fabRef.value?.contains(target)) return;
      closePanel();
    };

    const onDocKeydown = (event) => {
      if (event.key === 'Escape') closePanel();
    };

    const displayMatches = computed(() => {
      if (!hasLiquipediaTournamentUrl.value) return [];

      return allMatches.value
        .filter(m => {
          if (!isLiquipediaTournamentMatch(m.link, props.liquipediaTournamentUrl)) return false;

          // 静态快照不会像 Liquipedia 实时接口一样移除已结束比赛。
          // 静态版在预计开赛 8 小时后自动隐藏，避免旧比赛长期显示为 LIVE。
          if (import.meta.env.MODE === 'static' && Number.isFinite(m.timestamp)) {
            const staticLiveWindowMs = 8 * 60 * 60 * 1000;
            if (m.timestamp < Date.now() - staticLiveWindowMs) return false;
          }

          // 只过滤双方都还是 TBD 的占位对局，单边 TBD 仍然展示
          const t1Name = String(m.teamA?.name || m.team1?.name || m.team1 || '').toLowerCase();
          const t2Name = String(m.teamB?.name || m.team2?.name || m.team2 || '').toLowerCase();

          const isT1Tbd = t1Name === 'tbd' || t1Name === '' || t1Name === 'to be determined' || t1Name.includes('tbd');
          const isT2Tbd = t2Name === 'tbd' || t2Name === '' || t2Name === 'to be determined' || t2Name.includes('tbd');

          return !(isT1Tbd && isT2Tbd);
        })
        .slice()
        .sort((a, b) => {
          const left = Number.isFinite(a.timestamp) ? a.timestamp : Number.MAX_SAFE_INTEGER;
          const right = Number.isFinite(b.timestamp) ? b.timestamp : Number.MAX_SAFE_INTEGER;
          return left - right;
        });
    });

    const liveCount = computed(() =>
      displayMatches.value.filter(match => isOngoing(match.timestamp)).length
    );

    const isOngoing = (timestamp) => {
      if (!timestamp) return false;
      const now = Date.now();
      return timestamp <= now && timestamp > now - 8 * 60 * 60 * 1000;
    };

    // 卡片内只显示当天时刻，日期由分组标题承担
    const formatClock = (timestamp) => {
      if (!timestamp) return 'TBD';
      const date = new Date(timestamp);
      return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    };

    // 日期分组标题：今天 / 明天 / MM/DD 周X
    const formatDateLabel = (timestamp) => {
      const date = new Date(timestamp);
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);

      const mmdd = `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;
      const week = WEEK_LABELS[date.getDay()];

      if (isSameDay(date, today)) return `今天 · ${mmdd} ${week}`;
      if (isSameDay(date, tomorrow)) return `明天 · ${mmdd} ${week}`;
      return `${mmdd} ${week}`;
    };

    const dateKeyOf = (timestamp) => {
      const date = new Date(timestamp);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    };

    // 拍平为 [日期标题, 比赛卡, ...] 的渲染序列，index 用于级联入场动效
    const listItems = computed(() => {
      const items = [];
      let lastKey = null;
      let index = 0;

      displayMatches.value.forEach((match, matchIndex) => {
        const key = Number.isFinite(match.timestamp) ? dateKeyOf(match.timestamp) : 'tbd';
        if (key !== lastKey) {
          items.push({
            type: 'header',
            key: `header-${key}`,
            label: key === 'tbd' ? '时间待定' : formatDateLabel(match.timestamp),
            index: index++
          });
          lastKey = key;
        }
        items.push({
          type: 'match',
          key: `match-${match.timestamp || 'tbd'}-${match.team1.name}-${match.team2.name}-${matchIndex}`,
          match,
          index: index++
        });
      });

      return items;
    });

    const getTeamByApiName = (apiName) => {
      if (!apiName || apiName === 'TBD') return null;
      const nameLower = apiName.toLowerCase();
      // Precise matching first
      let matchedTeam = store.state.teams.find(t =>
        t.name.toLowerCase() === nameLower ||
        (t.abbreviation && t.abbreviation.toLowerCase() === nameLower)
      );

      // If no exact match, try a more cautious partial match
      if (!matchedTeam) {
        // e.g. DAL should NOT match AL, but Team Falcons could match Falcons
        // We only match if the lengths are reasonably close or if words match
        matchedTeam = store.state.teams.find(t => {
          const tNameLower = t.name.toLowerCase();
          return tNameLower.includes(nameLower) && nameLower.length > 3 ||
                 nameLower.includes(tNameLower) && tNameLower.length > 3;
        });
      }
      return matchedTeam;
    };

    const normalizeTeamLogo = (logo) => {
      const value = String(logo || '').trim();
      return value || TBD_LOGO_URL;
    };

    const remapMatches = (matches) => {
      const parsedMatches = Array.isArray(matches) ? matches : [];

      allMatches.value = parsedMatches.map((match) => {
        const apiName1 = String(match?.team1?.name || match?.teamA?.name || match?.team1 || 'TBD').trim() || 'TBD';
        const apiName2 = String(match?.team2?.name || match?.teamB?.name || match?.team2 || 'TBD').trim() || 'TBD';
        const localTeam1 = getTeamByApiName(apiName1);
        const localTeam2 = getTeamByApiName(apiName2);

        return {
          tournamentName: String(match?.tournamentName || '').trim(),
          timestamp: Number.isFinite(match?.timestamp) ? match.timestamp : null,
          link: String(match?.link || '').trim(),
          team1: {
            name: localTeam1 ? localTeam1.name : apiName1,
            logo: normalizeTeamLogo(localTeam1?.logo)
          },
          team2: {
            name: localTeam2 ? localTeam2.name : apiName2,
            logo: normalizeTeamLogo(localTeam2?.logo)
          }
        };
      });
    };

    const fetchLiquipediaMatches = async () => {
      // 只有在没有配置时才会快速跳过，配置存在则正常展示 loading
      if (!hasLiquipediaTournamentUrl.value) {
        isLoading.value = false;
        return;
      }

      isLoading.value = true;
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { timestamp, data } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_EXPIRY && Array.isArray(data)) {
            remapMatches(data);
            return;
          }
          sessionStorage.removeItem(CACHE_KEY);
        }

        // 如果已经有正在进行的请求，直接等待该请求完成
        if (fetchPromise) {
          await fetchPromise;
          const newCached = sessionStorage.getItem(CACHE_KEY);
          if (newCached) {
            const { data } = JSON.parse(newCached);
            if (Array.isArray(data)) {
              remapMatches(data);
            }
          }
          return;
        }

        fetchPromise = apiService.getUpcomingMatches();
        const responseData = await fetchPromise;

        if (responseData && Array.isArray(responseData.data)) {
          const matchList = responseData.data;
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: matchList
          }));
          remapMatches(matchList);
        }
      } catch (error) {
        console.error('Failed to fetch upcoming matches:', error);
      } finally {
        isLoading.value = false;
        fetchPromise = null;
      }
    };

    onMounted(() => {
      fetchLiquipediaMatches();
      document.addEventListener('click', onDocClick, true);
      document.addEventListener('keydown', onDocKeydown);
    });

    onBeforeUnmount(() => {
      document.removeEventListener('click', onDocClick, true);
      document.removeEventListener('keydown', onDocKeydown);
    });

    watch(() => props.liquipediaTournamentUrl, () => {
      fetchLiquipediaMatches();
    });

    watch(() => store.state.teams, () => {
      if (allMatches.value.length > 0) {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data } = JSON.parse(cached);
          if (Array.isArray(data)) {
            remapMatches(data);
          }
        }
      }
    });

    const goToDetail = (match) => {
      if (!props.seasonId) return;

      closePanel();

      trackPublicEvent('首页-打开未开赛详情', {
        source: 'upcoming_matches',
        seasonId: props.seasonId,
        team1Name: match?.team1?.name,
        team2Name: match?.team2?.name
      }, route);

      const matchData = {
        seasonId: props.seasonId,
        team1: match.team1.name,
        team2: match.team2.name,
        team1Logo: match.team1.logo,
        team2Logo: match.team2.logo,
        time: match.timestamp,
        tournament: match.tournamentName
      };
      sessionStorage.setItem('current_upcoming_match', JSON.stringify(matchData));

      router.push({
        path: '/visualize/upcoming-match',
        query: {
          seasonId: props.seasonId,
          t1: match.team1.name,
          t2: match.team2.name
        }
      });
    };

    return {
      displayMatches,
      listItems,
      liveCount,
      isLoading,
      isOpen,
      panelRef,
      fabRef,
      togglePanel,
      isOngoing,
      formatClock,
      goToDetail
    };
  }
};
</script>

<style scoped>
/* ================= 悬浮根容器：右下角固定 ================= */
.upcoming-fab-root {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  pointer-events: none;
}

.upcoming-fab-root > * {
  pointer-events: auto;
}

/* ================= 圆形半透明悬浮按钮 ================= */
.upcoming-fab {
  position: relative;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  border: 1px solid var(--vis-border-strong);
  background: rgba(255, 255, 255, 0.72);
  -webkit-backdrop-filter: blur(14px) saturate(1.4);
  backdrop-filter: blur(14px) saturate(1.4);
  box-shadow: 0 6px 20px rgba(17, 17, 17, 0.12);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--vis-text-strong);
  transition:
    transform var(--vis-dur) var(--vis-ease),
    box-shadow var(--vis-dur) var(--vis-ease),
    background var(--vis-dur) var(--vis-ease),
    border-color var(--vis-dur) var(--vis-ease),
    color var(--vis-dur) var(--vis-ease);
}

/* 品牌橙微光，hover / 展开时浮现 */
.fab-glow {
  position: absolute;
  inset: -1px;
  border-radius: 50%;
  background: var(--vis-primary-gradient);
  opacity: 0;
  transition: opacity var(--vis-dur) var(--vis-ease);
}

.upcoming-fab:hover .fab-glow,
.upcoming-fab.is-open .fab-glow {
  opacity: 1;
}

.upcoming-fab:hover,
.upcoming-fab.is-open {
  border-color: transparent;
  color: #ffffff;
  box-shadow: 0 8px 24px rgba(255, 106, 0, 0.32);
  transform: translateY(-2px);
}

.upcoming-fab:active {
  transform: translateY(0) scale(0.92);
  transition-duration: 0.1s;
}

/* 双图标交叉淡入淡出 + 旋转 */
.fab-icon {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  transition:
    opacity var(--vis-dur) var(--vis-ease),
    transform var(--vis-dur) var(--vis-ease);
}

.fab-icon--calendar {
  opacity: 1;
  transform: rotate(0deg) scale(1);
}

.fab-icon--close {
  opacity: 0;
  transform: rotate(-90deg) scale(0.6);
}

.upcoming-fab.is-open .fab-icon--calendar {
  opacity: 0;
  transform: rotate(90deg) scale(0.6);
}

.upcoming-fab.is-open .fab-icon--close {
  opacity: 1;
  transform: rotate(0deg) scale(1);
}

/* 加载态：图标换旋转描边圈 */
.upcoming-fab.is-loading .fab-icon {
  opacity: 0;
}

.upcoming-fab.is-loading::after {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(17, 17, 17, 0.12);
  border-top-color: var(--vis-accent);
  border-radius: 50%;
  animation: upcoming-spin 0.8s linear infinite;
}

@keyframes upcoming-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 数量徽标：品牌橙渐变胶囊 */
.fab-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--vis-primary-gradient);
  color: #ffffff;
  font-family: var(--vis-font-numeric);
  font-size: 11px;
  font-weight: 800;
  line-height: 20px;
  text-align: center;
  border: 2px solid #ffffff;
  box-shadow: 0 2px 6px rgba(255, 106, 0, 0.35);
  transition: transform var(--vis-dur) var(--vis-ease);
}

.upcoming-fab:hover .fab-badge {
  transform: scale(1.1);
}

/* LIVE 呼吸点（左下，与数量徽标错开） */
.fab-live {
  position: absolute;
  bottom: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--vis-live);
  border: 2px solid #ffffff;
  animation: vis-live-pulse 2s var(--vis-ease) infinite;
}

/* ================= 向上展开的赛程面板 ================= */
.upcoming-panel {
  width: 300px;
  max-width: calc(100vw - 40px);
  max-height: min(74vh, 660px);
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  border: 1px solid var(--vis-border);
  background: rgba(255, 255, 255, 0.86);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  backdrop-filter: blur(16px) saturate(1.4);
  box-shadow: 0 12px 40px rgba(17, 17, 17, 0.14);
  overflow: hidden;
  transform-origin: bottom right;
}

/* 面板入场：自右下放大 + 上移 + 淡入，弹性回稳 */
.upcoming-panel-enter-active {
  transition:
    opacity 0.28s var(--vis-ease),
    transform 0.32s cubic-bezier(0.34, 1.4, 0.5, 1);
}

.upcoming-panel-leave-active {
  transition:
    opacity 0.2s var(--vis-ease),
    transform 0.22s var(--vis-ease);
}

.upcoming-panel-enter-from,
.upcoming-panel-leave-to {
  opacity: 0;
  transform: translateY(14px) scale(0.88);
}

/* 面板头部：斜切渐变条 + 标题 + 计数 */
.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--vis-border);
  flex-shrink: 0;
}

.panel-title-bar {
  width: 4px;
  height: 14px;
  border-radius: 1px;
  background: var(--vis-primary-gradient);
  transform: skewX(var(--vis-slant));
  flex: 0 0 auto;
}

.panel-title {
  font-family: var(--vis-font-display);
  font-style: italic;
  font-weight: 800;
  font-size: 14px;
  letter-spacing: 0.02em;
  color: var(--vis-text-strong);
}

.panel-count {
  margin-left: auto;
  font-family: var(--vis-font-numeric);
  font-size: 11px;
  font-weight: 800;
  color: var(--vis-text-tertiary);
  background: var(--vis-bg-muted);
  border-radius: 999px;
  padding: 2px 8px;
  font-variant-numeric: tabular-nums;
}

.panel-count--live {
  margin-left: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(245, 108, 108, 0.12);
  color: var(--vis-live);
}

.panel-count--live .vis-live-dot {
  width: 5px;
  height: 5px;
}

/* 列表：纵向滚动，隐藏滚动条 */
.panel-list {
  overflow-y: auto;
  padding: 8px 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  scrollbar-width: none;
  -ms-overflow-style: none;
  overscroll-behavior: contain;
}

.panel-list::-webkit-scrollbar {
  display: none;
}

/* 日期分隔行：斜切渐变小节标 + 延伸细线 */
.date-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 2px 0;
  flex-shrink: 0;
}

.date-divider:first-child {
  padding-top: 2px;
}

.date-label {
  font-family: var(--vis-font-numeric);
  font-style: italic;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--vis-text-secondary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.date-label::before {
  content: '';
  display: inline-block;
  width: 3px;
  height: 10px;
  margin-right: 6px;
  border-radius: 1px;
  background: var(--vis-primary-gradient);
  transform: skewX(var(--vis-slant)) translateY(1px);
}

.date-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, var(--vis-border-strong), transparent);
}

/* 卡片依次浮现（面板展开时的级联动效，超过 10 项后不再递增延迟） */
.upcoming-item-enter-active {
  transition:
    opacity 0.3s var(--vis-ease),
    transform 0.3s var(--vis-ease);
  transition-delay: calc(min(var(--item-index, 0), 10) * 40ms);
}

.upcoming-item-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.96);
}

.upcoming-item-leave-active {
  transition: opacity 0.15s var(--vis-ease);
  position: absolute;
}

.upcoming-item-leave-to {
  opacity: 0;
}

/* 比赛卡：沿用白底轻边框 + 全局 .vis-card-lift hover */
.upcoming-card {
  background: var(--vis-bg-card);
  border: 1px solid var(--vis-border);
  border-radius: 12px;
  box-shadow: var(--vis-shadow);
  padding: 10px 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}

.upcoming-card:active {
  transform: translateY(0) scale(0.98);
  box-shadow: var(--vis-shadow);
}

.match-teams {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 4px;
}

.match-status {
  display: flex;
  justify-content: center;
}

/* M4 · 斜切 chip：时间浅灰底 / LIVE 红色呼吸点 */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.2;
  padding: 2px 7px;
  border-radius: 3px;
  transform: skewX(var(--vis-slant));
  white-space: nowrap;
}

.status-time {
  display: inline-block;
  transform: skewX(calc(var(--vis-slant) * -1));
  font-family: var(--vis-font-numeric);
  font-variant-numeric: tabular-nums;
}

.status-badge.ongoing {
  background: rgba(245, 108, 108, 0.12);
  color: var(--vis-live);
}

.status-badge.ongoing .vis-live-dot {
  width: 5px;
  height: 5px;
}

.status-badge.upcoming {
  background: var(--vis-bg-muted);
  color: var(--vis-text-secondary);
}

.match-action-hint {
  text-align: center;
  font-size: 9px;
  font-weight: 600;
  color: var(--vis-text-tertiary);
  letter-spacing: 0.5px;
  opacity: 0.75;
  transition: color var(--vis-dur-fast) var(--vis-ease), opacity var(--vis-dur-fast) var(--vis-ease);
}

.upcoming-card:hover .match-action-hint {
  color: var(--vis-accent);
  opacity: 1;
}

.team-side {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  overflow: hidden;
}

.team-side.left-side {
  justify-content: flex-end;
}

.team-side.right-side {
  justify-content: flex-end;
  flex-direction: row-reverse;
}

.team-logo-container {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.team-logo {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

/* 左队黑 / 右队橙 严格镜像，队名不换行 */
.team-name {
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.team-side.left-side .team-name {
  color: var(--vis-team-left);
  text-align: right;
}

.team-side.right-side .team-name {
  color: var(--vis-team-right);
  text-align: left;
}

.vs-text {
  font-family: var(--vis-font-numeric);
  font-style: italic;
  font-size: 10px;
  font-weight: 800;
  color: var(--vis-text-disabled);
  text-align: center;
  padding: 0 2px;
  text-transform: uppercase;
}

/* 面板内加载状态 */
.panel-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 28px 16px;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top-color: var(--vis-accent);
  border-radius: 50%;
  animation: upcoming-spin 0.8s linear infinite;
}

.loading-text {
  font-size: 12px;
  color: var(--vis-text-secondary);
  font-weight: 500;
}

/* ================= 响应式 ================= */
@media (max-width: 767px) {
  .upcoming-fab-root {
    right: 14px;
    bottom: 14px;
  }

  .upcoming-fab {
    width: 50px;
    height: 50px;
  }

  .upcoming-panel {
    width: min(300px, calc(100vw - 28px));
    max-height: min(70vh, 600px);
  }
}

/* 尊重减少动效偏好 */
@media (prefers-reduced-motion: reduce) {
  .upcoming-panel-enter-active,
  .upcoming-panel-leave-active,
  .upcoming-item-enter-active,
  .upcoming-item-leave-active,
  .upcoming-fab,
  .fab-icon,
  .fab-glow,
  .fab-badge {
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
  }

  .fab-live {
    animation: none;
  }
}
</style>
