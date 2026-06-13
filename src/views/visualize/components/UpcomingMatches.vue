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
            <div v-for="(match, index) in displayMatches" :key="index" class="upcoming-card" @click="goToDetail(match)">
              <!-- 状态与时间 -->
              <div class="match-status">
                <span v-if="isOngoing(match.timestamp)" class="status-badge ongoing">LIVE</span>
                <span v-else class="status-badge upcoming">{{ formatTime(match.timestamp) }}</span>
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
import { useRouter } from 'vue-router';
import { Calendar, ArrowUp } from '@element-plus/icons-vue';
import apiService from '@/services/api';

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
          
          // Filter out matches where BOTH teams are TBD
          const t1Name = String(m.teamA?.name || m.team1?.name || m.team1 || '').toLowerCase();
          const t2Name = String(m.teamB?.name || m.team2?.name || m.team2 || '').toLowerCase();
          
          const isT1Tbd = t1Name === 'tbd' || t1Name === '' || t1Name === 'to be determined' || t1Name.includes('tbd');
          const isT2Tbd = t2Name === 'tbd' || t2Name === '' || t2Name === 'to be determined' || t2Name.includes('tbd');
          
          // Filter out if either team is TBD
          return !(isT1Tbd || isT2Tbd);
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
          // 检查缓存是否有效
          if (Date.now() - timestamp < CACHE_EXPIRY) {
            parseAndSetMatches(data);
            return;
          }
        }

        // 如果已经有正在进行的请求，直接等待该请求完成
        if (fetchPromise) {
          await fetchPromise;
          
          // 请求完成后，直接从缓存读取最新的数据
          const newCached = sessionStorage.getItem(CACHE_KEY);
          if (newCached) {
            const { data } = JSON.parse(newCached);
            parseAndSetMatches(data);
          }
          return;
        }

        // 创建新的请求并保存到 fetchPromise
        fetchPromise = apiService.getUpcomingMatches();

        const responseData = await fetchPromise;
        
        if (responseData && responseData.data) {
          const htmlStr = responseData.data;
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: htmlStr
          }));
          parseAndSetMatches(htmlStr);
        }
      } catch (error) {
        console.error('Failed to fetch upcoming matches:', error);
      } finally {
        isLoading.value = false;
        // 请求结束后，清空 promise，允许后续（缓存过期后）发起新请求
        fetchPromise = null;
      }
    };

    const parseAndSetMatches = (htmlString) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');
      const matchElements = doc.querySelectorAll('.match-info');
      const parsedMatches = [];

      matchElements.forEach(el => {
        const tournamentEl = el.querySelector('.match-info-tournament-name a');
        if (!tournamentEl) return;
        const tournamentName = tournamentEl.textContent.trim();

        const timeEl = el.querySelector('.timer-object');
        const timestamp = timeEl ? parseInt(timeEl.getAttribute('data-timestamp')) * 1000 : null;

        const teamLeftEl = el.querySelector('.match-info-header-opponent-left');
        const opponents = el.querySelectorAll('.match-info-header-opponent');
        const teamRightEl = opponents.length > 1 ? opponents[1] : null;

        const extractTeamName = (teamEl) => {
          if (!teamEl) return 'TBD';
          const nameEl = teamEl.querySelector('.name a') || teamEl.querySelector('.name');
          return nameEl ? nameEl.textContent.trim() : 'TBD';
        };

        const apiName1 = extractTeamName(teamLeftEl);
        const apiName2 = extractTeamName(teamRightEl);

        const localTeam1 = getTeamByApiName(apiName1);
        const localTeam2 = getTeamByApiName(apiName2);

        parsedMatches.push({
          tournamentName,
          timestamp,
          link: 'https://liquipedia.net' + (tournamentEl.getAttribute('href') || ''),
          team1: {
            name: localTeam1 ? localTeam1.name : apiName1,
            logo: normalizeTeamLogo(localTeam1?.logo)
          },
          team2: {
            name: localTeam2 ? localTeam2.name : apiName2,
            logo: normalizeTeamLogo(localTeam2?.logo)
          }
        });
      });

      allMatches.value = parsedMatches;
    };

    onMounted(() => {
      fetchLiquipediaMatches();
    });

    // 监听赛季名称变化，如果名称变了也要重新处理一下显示逻辑
    watch(() => props.liquipediaTournamentName, () => {
      fetchLiquipediaMatches();
    });

    // Optional: Re-map team logos if store.state.teams changes
    watch(() => store.state.teams, () => {
      if (allMatches.value.length > 0) {
        // Just re-run parse if we stored the raw html, or simply rely on Vue reactivity
        // Since we parsed them into the ref array, we might want to re-map.
        // For simplicity, re-fetching from cache is fast.
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data } = JSON.parse(cached);
          parseAndSetMatches(data);
        }
      }
    });

    const goToDetail = (match) => {
      if (!props.seasonId) return;
      
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
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
  cursor: pointer;
  user-select: none;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
  width: max-content;
}

.upcoming-header:hover {
  background-color: rgba(0, 0, 0, 0.04);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.collapse-icon {
  font-size: 12px;
  color: #999;
  transition: transform 0.3s ease;
  margin-left: 8px;
}

.collapse-icon.is-collapsed {
  transform: rotate(180deg);
}

.upcoming-header .el-icon {
  color: #FF9E0F;
  font-size: 14px;
}

.upcoming-list-container {
  width: 100%;
  overflow-x: auto;
  padding-bottom: 4px;
  /* 隐藏滚动条 */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.upcoming-list-container::-webkit-scrollbar {
  display: none;
}

.upcoming-list {
  display: flex;
  gap: 8px;
  min-width: max-content;
}

.upcoming-card {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  padding: 6px 8px;
  width: 140px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.upcoming-card:hover {
  background: #fff;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.08);
}

.upcoming-card:active {
  transform: translateY(0) scale(0.98);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

/* 移除那个怪异的箭头 */
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

.status-badge {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 4px;
}

.status-badge.ongoing {
  background-color: #ffeaea;
  color: #f56c6c;
  animation: pulse 2s infinite;
}

.status-badge.upcoming {
  background-color: #f5f7fa;
  color: #909399;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.6; }
  100% { opacity: 1; }
}

.match-action-hint {
  text-align: center;
  font-size: 9px;
  font-weight: 600;
  color: #909399;
  background: transparent;
  padding: 0;
  margin-top: 0;
  transition: all 0.2s;
  letter-spacing: 0.5px;
  opacity: 0.7;
}

.upcoming-card:hover .match-action-hint {
  color: #111;
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
  width: 14px;
  height: 14px;
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

.team-name {
  font-size: 11px;
  font-weight: 500;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.team-side.left-side .team-name {
  text-align: right;
}

.team-side.right-side .team-name {
  text-align: left;
}

.vs-text {
  font-size: 9px;
  font-weight: bold;
  color: #ccc;
  text-align: center;
  padding: 0 2px;
}

/* 转圈加载动画 */
.upcoming-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  width: max-content;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top-color: #FF9E0F;
  border-radius: 50%;
  animation: spinner-rotate 0.8s linear infinite;
}

.loading-text {
  font-size: 12px;
  color: #666;
  font-weight: 500;
}

@keyframes spinner-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 767px) {
  .upcoming-card {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
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
    padding: 8px 12px;
    border-color: rgba(0, 0, 0, 0.06);
  }
  
  .upcoming-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    border-color: rgba(0, 0, 0, 0.1);
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
    padding: 2px 6px;
  }

  .vs-text {
    font-size: 10px;
    padding: 0 6px;
  }
}
</style>
