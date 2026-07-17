<template>
  <div class="upcoming-matches-wrapper" v-if="displayMatches.length > 0 || isLoading">
    <div class="upcoming-header" @click="toggleCollapse">
      <div class="header-title">
        <el-icon><Calendar /></el-icon>
        <span>Upcoming</span>
      </div>
      <el-icon class="collapse-icon" :class="{ 'is-collapsed': isCollapsed }">
        <ArrowUp />
      </el-icon>
    </div>
    
    <el-collapse-transition>
      <div v-show="!isCollapsed">
        <!-- 简单的转圈加载状态 -->
        <div class="upcoming-loading" v-if="isLoading">
          <div class="loading-spinner"></div>
          <div class="loading-text">加载中...</div>
        </div>

        <!-- 真实数据 -->
        <div class="upcoming-list-container" v-else>
          <div class="upcoming-list">
            <div v-for="(match, index) in displayMatches" :key="index" class="upcoming-card vis-card-lift" @click="goToDetail(match)">
              <!-- 状态与时间 -->
              <div class="match-status">
                <span v-if="isOngoing(match.timestamp)" class="status-badge ongoing"><span class="vis-live-dot" aria-hidden="true"></span>LIVE</span>
                <span v-else class="status-badge upcoming"><span class="status-time">{{ formatTime(match.timestamp) }}</span></span>
              </div>

              <!-- 队伍对抗 -->
              <div class="match-teams">
                <!-- 队伍1 -->
                <div class="team-side left-side">
                  <div class="team-logo-container">
                    <img :src="match.team1.logo" class="team-logo" alt="" />
                  </div>
                  <span class="team-name" :title="match.team1.name">{{ match.team1.name }}</span>
                </div>

                <div class="vs-text">vs</div>

                <!-- 队伍2 -->
                <div class="team-side right-side">
                  <div class="team-logo-container">
                    <img :src="match.team2.logo" class="team-logo" alt="" />
                  </div>
                  <span class="team-name" :title="match.team2.name">{{ match.team2.name }}</span>
                </div>
              </div>
              
              <!-- 底部可点击提示 -->
              <div class="match-action-hint">
                赛事前瞻
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-collapse-transition>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue';
import { useStore } from 'vuex';
import { useRoute, useRouter } from 'vue-router';
import { Calendar, ArrowUp } from '@element-plus/icons-vue';
import apiService from '@/services/api';
import { trackPublicEvent } from '@/utils/analytics';

const CACHE_KEY = 'liquipedia_upcoming_matches';
const CACHE_EXPIRY = 60 * 1000; // 1 minute client-side cache
const TBD_LOGO_URL = 'https://owmini.xyz/images/tbd.png';

// 声明一个模块级别的 Promise，用于防止多个组件实例或并发请求导致重复调用 API
let fetchPromise = null;

export default {
  name: 'UpcomingMatches',
  components: {
    Calendar,
    ArrowUp
  },
  props: {
    liquipediaTournamentName: {
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
    const isCollapsed = ref(false);

    const toggleCollapse = () => {
      isCollapsed.value = !isCollapsed.value;
    };

    const displayMatches = computed(() => {
      if (!props.liquipediaTournamentName) return [];
      
      const targetName = props.liquipediaTournamentName.toLowerCase();
      const filtered = allMatches.value
        .filter(m => {
          if (!m.tournamentName.toLowerCase().includes(targetName)) return false;
          
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

      const firstTimedMatch = filtered.find(match => Number.isFinite(match.timestamp));
      if (!firstTimedMatch) return filtered;

      const windowStart = firstTimedMatch.timestamp;
      const windowEnd = windowStart + (3 * 24 * 60 * 60 * 1000);
      return filtered.filter(match => !Number.isFinite(match.timestamp) || (match.timestamp >= windowStart && match.timestamp <= windowEnd));
    });

    const isOngoing = (timestamp) => {
      if (!timestamp) return false;
      return timestamp < Date.now();
    };

    const formatTime = (timestamp) => {
      if (!timestamp) return 'TBD';
      const date = new Date(timestamp);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${month}/${day} ${hours}:${minutes}`;
    };

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
      if (!props.liquipediaTournamentName) {
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
    });

    watch(() => props.liquipediaTournamentName, () => {
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
      isLoading,
      isCollapsed,
      toggleCollapse,
      isOngoing,
      formatTime,
      goToDetail
    };
  }
};
</script>

<style scoped>
.upcoming-matches-wrapper {
  margin-bottom: 16px;
}

.upcoming-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 36px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vis-text-primary);
  margin-bottom: 8px;
  cursor: pointer;
  user-select: none;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background-color var(--vis-dur-fast) var(--vis-ease);
  width: max-content;
}

.upcoming-header:hover {
  background-color: var(--vis-team-left-soft);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--vis-font-display);
  font-style: italic;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--vis-text-strong);
}

.collapse-icon {
  font-size: 12px;
  color: var(--vis-text-tertiary);
  transition: transform var(--vis-dur) var(--vis-ease);
  margin-left: 8px;
}

.collapse-icon.is-collapsed {
  transform: rotate(180deg);
}

.upcoming-header .el-icon {
  color: var(--vis-accent);
  font-size: 14px;
}

.upcoming-list-container {
  width: 100%;
  overflow-x: auto;
  padding-bottom: 4px;
  /* 隐藏滚动条 */
  scrollbar-width: none;
  -ms-overflow-style: none;
  /* 移动端横向 scroll-snap */
  scroll-snap-type: x proximity;
}

.upcoming-list-container::-webkit-scrollbar {
  display: none;
}

.upcoming-list {
  display: flex;
  gap: 10px;
  min-width: max-content;
}

/* 比赛卡：白底轻边框 + 全局 .vis-card-lift hover（上浮 + 顶部渐变线） */
.upcoming-card {
  scroll-snap-align: start;
  background: var(--vis-bg-card);
  border: 1px solid var(--vis-border);
  border-radius: 12px;
  box-shadow: var(--vis-shadow);
  padding: 10px 10px 8px;
  width: 148px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
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
  background: transparent;
  padding: 0;
  margin-top: 0;
  transition: color var(--vis-dur-fast) var(--vis-ease), opacity var(--vis-dur-fast) var(--vis-ease);
  letter-spacing: 0.5px;
  opacity: 0.75;
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

/* 转圈加载动画 */
.upcoming-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--vis-bg-card);
  border: 1px solid var(--vis-border);
  border-radius: 10px;
  width: max-content;
  box-shadow: var(--vis-shadow);
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top-color: var(--vis-accent);
  border-radius: 50%;
  animation: spinner-rotate 0.8s linear infinite;
}

.loading-text {
  font-size: 12px;
  color: var(--vis-text-secondary);
  font-weight: 500;
}

@keyframes spinner-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 767px) {
  .upcoming-card {
    box-shadow: var(--vis-shadow);
  }
}

@media (max-width: 420px) {
  .upcoming-card {
    width: 140px;
  }
}

@media (min-width: 768px) {
  .upcoming-matches-wrapper {
    margin-bottom: 24px;
  }

  .upcoming-header {
    font-size: 14px;
    margin-bottom: 12px;
  }

  .upcoming-list {
    gap: 12px;
  }

  .upcoming-card {
    width: 180px;
    padding: 12px;
    border-radius: 14px;
    gap: 8px;
  }

  .team-logo-container {
    width: 18px;
    height: 18px;
  }

  .team-name {
    font-size: 12px;
  }

  .status-badge {
    font-size: 10px;
    padding: 2px 8px;
  }

  .vs-text {
    font-size: 10px;
    padding: 0 6px;
  }

  .match-action-hint {
    font-size: 10px;
  }
}
</style>
