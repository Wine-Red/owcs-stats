<template>
  <div class="recent-matches-container">
    <div v-for="group in displayedMatches" :key="group.date" class="vis-grid overview-section" style="margin-bottom: 24px;">
      <div class="vis-col span-12">
        <div class="liquipedia-matches-container">
          <div class="match-date-header">{{ group.formattedDate }}</div>
          
          <div class="matches-list">
            <div v-for="match in group.matches" :key="match.id" class="match-row" @click="openMatchDetails(match)">
              <div class="match-content">
                <!-- 左侧队伍 -->
                <div class="team-side left-side">
                  <span class="team-name" :class="{'winner-name': match.winnerId === match.team1Id}">{{ getTeamName(match.team1Id) }}</span>
                  <div class="team-logo-container">
                    <img v-if="getTeamLogo(match.team1Id)" :src="getTeamLogo(match.team1Id)" class="team-logo" alt="" />
                    <div v-else class="team-logo-placeholder">{{ getTeamName(match.team1Id)?.charAt(0) || 'T' }}</div>
                  </div>
                </div>
                
                <!-- 中间比分 -->
                <div class="score-section">
                  <div class="score-row">
                    <span class="winner-arrow left-arrow" :class="{ 'visible': match.winnerId === match.team1Id }">◀</span>
                    <span class="score-number">{{ match.team1Score !== null ? match.team1Score : '-' }}</span>
                    <span class="score-colon">:</span>
                    <span class="score-number">{{ match.team2Score !== null ? match.team2Score : '-' }}</span>
                    <span class="winner-arrow right-arrow" :class="{ 'visible': match.winnerId === match.team2Id }">▶</span>
                  </div>
                  <div class="bo-format" v-if="match.boFormat">({{ match.boFormat }})</div>
                </div>
                
                <!-- 右侧队伍 -->
                <div class="team-side right-side">
                  <div class="team-logo-container">
                    <img v-if="getTeamLogo(match.team2Id)" :src="getTeamLogo(match.team2Id)" class="team-logo" alt="" />
                    <div v-else class="team-logo-placeholder">{{ getTeamName(match.team2Id)?.charAt(0) || 'T' }}</div>
                  </div>
                  <span class="team-name" :class="{'winner-name': match.winnerId === match.team2Id}">{{ getTeamName(match.team2Id) }}</span>
                </div>
              </div>
              
              <!-- 录像代码 (Replay Codes) -->
              <div class="match-replays" v-if="hasMapGames(match.id)">
                <div class="replay-label" @click.stop="toggleReplays(match.id)">
                  <el-icon><VideoCamera /></el-icon>
                  <span>回放</span>
                  <el-icon class="expand-icon" :class="{ 'is-expanded': isReplaysExpanded(match.id) }"><ArrowDown /></el-icon>
                </div>
                
                <el-collapse-transition>
                  <div v-show="isReplaysExpanded(match.id)">
                    <div class="replay-tags">
                      <template v-for="(item, index) in getMapGamesInfo(match.id)" :key="item.mapId + '-' + index">
                        <!-- 有代码时显示可复制的胶囊 -->
                        <span class="replay-tag" v-if="item.code" @click.stop="copyCode(item.code, $event)" :title="`点击复制 ${item.mapName} 代码`">
                          <span class="replay-map-name">{{ item.mapName }}</span>
                          <span class="replay-code">{{ item.code }}</span>
                          <el-icon class="copy-icon"><DocumentCopy /></el-icon>
                        </span>
                        <!-- 无代码时显示置灰禁用的地图名称 -->
                        <span class="replay-tag disabled" v-else title="暂无回放代码" @click.stop>
                          <span class="replay-map-name">{{ item.mapName }}</span>
                          <span class="replay-code empty-code">-</span>
                        </span>
                      </template>
                    </div>
                  </div>
                </el-collapse-transition>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div v-if="hasMoreMatches" class="show-more-container">
      <el-button @click="toggleShowAll" plain size="large" class="show-more-btn">
        {{ showAllMatches ? '收起全部比赛' : '查看全部比赛' }}
        <el-icon class="el-icon--right">
          <component :is="showAllMatches ? 'ArrowUp' : 'ArrowDown'" />
        </el-icon>
      </el-button>
    </div>

    <!-- Match Details Modal -->
    <Transition name="modal-fade">
      <div v-if="selectedMatch" class="match-modal-overlay" @click.self="closeMatchDetails">
        <div class="match-modal-content">
          <!-- Close Button -->
          <button class="modal-close-btn" @click="closeMatchDetails">
            <el-icon><Close /></el-icon>
          </button>

        <!-- Modal Header -->
        <div class="modal-header">
          <!-- Team 1 -->
          <div class="modal-team left">
            <span class="modal-team-name">{{ getTeamName(selectedMatch.team1Id) }}</span>
            <img v-if="getTeamLogo(selectedMatch.team1Id)" :src="getTeamLogo(selectedMatch.team1Id)" class="modal-team-logo" alt="" />
          </div>
          <!-- Score -->
          <div class="modal-score">
            <span :class="{'winner': selectedMatch.winnerId === selectedMatch.team1Id}">{{ selectedMatch.team1Score !== null ? selectedMatch.team1Score : '-' }}</span>
            <span class="colon">:</span>
            <span :class="{'winner': selectedMatch.winnerId === selectedMatch.team2Id}">{{ selectedMatch.team2Score !== null ? selectedMatch.team2Score : '-' }}</span>
          </div>
          <!-- Team 2 -->
          <div class="modal-team right">
            <img v-if="getTeamLogo(selectedMatch.team2Id)" :src="getTeamLogo(selectedMatch.team2Id)" class="modal-team-logo" alt="" />
            <span class="modal-team-name">{{ getTeamName(selectedMatch.team2Id) }}</span>
          </div>
        </div>

        <!-- Modal Body -->
        <div class="modal-body">
          <div v-if="isLoadingDetails" class="modal-loading">
            <div class="loading-spinner"></div>
            <p>正在加载数据...</p>
          </div>
          <div v-else-if="matchDetails && matchDetails.mapGames.length > 0" class="modal-data-container">
            <!-- Tabs -->
            <div class="modal-tabs">
              <button 
                class="modal-tab" 
                :class="{ active: activeTab === 'overall' }"
                @click="activeTab = 'overall'"
              >
                全局数据
              </button>
              <button 
                v-for="mapGame in matchDetails.mapGames" 
                :key="mapGame.id"
                class="modal-tab" 
                :class="{ active: activeTab === mapGame.id }"
                @click="activeTab = mapGame.id"
              >
                {{ getMapName(mapGame.mapId) }}
              </button>
            </div>

            <!-- Map Info Banner -->
            <div class="map-info-banner" v-if="currentMapGame && activeTab !== 'overall'" :style="{ backgroundImage: `url(${getMapImageUrl(currentMapGame.mapId)})` }">
              <div class="banner-overlay"></div>
              <div class="banner-content">
                <div class="banner-left">
                  <h3 class="map-name">{{ getMapName(currentMapGame.mapId) }}</h3>
                  <div class="map-meta">
                    <span class="meta-item"><el-icon><Timer /></el-icon> {{ formatDuration(currentMapGame.duration) }}</span>
                    <span class="meta-item" v-if="currentMapGame.replayId"><el-icon><VideoCamera /></el-icon> {{ currentMapGame.replayId }}</span>
                  </div>
                </div>
                <div class="banner-right">
                  <div class="map-score">
                    <span class="score-team" :class="{ winner: currentMapGame.winnerId === currentMapGame.team1Id }">{{ getTeamName(currentMapGame.team1Id) }}</span>
                    <span class="score-number">{{ currentMapGame.team1Score !== null ? currentMapGame.team1Score : '-' }}</span>
                    <span class="score-divider">:</span>
                    <span class="score-number">{{ currentMapGame.team2Score !== null ? currentMapGame.team2Score : '-' }}</span>
                    <span class="score-team" :class="{ winner: currentMapGame.winnerId === currentMapGame.team2Id }">{{ getTeamName(currentMapGame.team2Id) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Content Area (Dual Column Grid) -->
            <div class="modal-stats-area">
              <div v-if="activeTab === 'overall'" class="overall-stats-container">
                <div class="overall-team-section" v-for="(teamPlayers, index) in [overallStats.team1, overallStats.team2]" :key="index">
                  <div class="overall-team-header" :class="index === 0 ? 'team1-header' : 'team2-header'">
                    <img v-if="getTeamLogo(index === 0 ? selectedMatch.team1Id : selectedMatch.team2Id)" 
                         :src="getTeamLogo(index === 0 ? selectedMatch.team1Id : selectedMatch.team2Id)" 
                         class="overall-team-logo" alt="" />
                    <span>{{ index === 0 ? getTeamName(selectedMatch.team1Id) : getTeamName(selectedMatch.team2Id) }}</span>
                  </div>
                  <div class="overall-table">
                    <div class="overall-table-header">
                      <div class="col-role"></div>
                      <div class="col-name">选手</div>
                      <div class="col-kda">K / A / D</div>
                      <div class="col-kd">K/D</div>
                      <div class="col-dmg">伤害</div>
                      <div class="col-heal">治疗</div>
                      <div class="col-mit">抵挡</div>
                    </div>
                    <div class="overall-table-row" v-for="player in teamPlayers" :key="player.playerId">
                      <div class="col-role"><img :src="getRoleIconUrl(player.role)" class="role-icon" alt="" /></div>
                      <div class="col-name" :class="player.role">{{ player.name }}</div>
                      <div class="col-kda">{{ player.kills }} / {{ player.assists }} / {{ player.deaths }}</div>
                      <div class="col-kd" :class="{ 'highlight-kd': true, 'match-best': player.kdValue > 0 && player.kdValue === overallStats.maxStats.kd }">{{ player.kd }}</div>
                      <div class="col-dmg" :class="{ 'match-best': player.damage > 0 && player.damage === overallStats.maxStats.damage }">{{ formatNumber(player.damage) }}</div>
                      <div class="col-heal" :class="{ 'match-best': player.healing > 0 && player.healing === overallStats.maxStats.healing }">{{ formatNumber(player.healing) }}</div>
                      <div class="col-mit" :class="{ 'match-best': player.mitigation > 0 && player.mitigation === overallStats.maxStats.mitigation }">{{ formatNumber(player.mitigation) }}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-else class="stats-grid">
                <!-- Columns header -->
                <div class="team-col-header team1-header">{{ getTeamName(selectedMatch.team1Id) }}</div>
                <div class="team-col-header team2-header">{{ getTeamName(selectedMatch.team2Id) }}</div>

                <!-- Matchup Rows will be rendered here by computed property -->
                <template v-for="(row, idx) in currentStatsRows" :key="idx">
                  <!-- Team 1 Player Card -->
                  <div class="player-card team1-card">
                    <template v-if="row.team1">
                      <div class="player-card-header">
                        <div class="player-role-name">
                          <img :src="getRoleIconUrl(row.team1.role)" class="role-icon" alt="" />
                          <span class="player-name" :class="row.team1.role">{{ row.team1.name }}</span>
                        </div>
                        <span class="player-kda">{{ row.team1.kills }}/{{ row.team1.assists }}/{{ row.team1.deaths }}</span>
                      </div>
                      <div class="player-stats">
                        <div class="stat-row">
                          <span class="stat-label">伤害</span>
                          <div class="stat-bar-track">
                            <div class="stat-bar-fill damage-color" :style="{ width: row.team1.damagePercent + '%' }"></div>
                          </div>
                          <span class="stat-value">{{ formatNumber(row.team1.damage) }}</span>
                        </div>
                        <div class="stat-row">
                          <span class="stat-label">治疗</span>
                          <div class="stat-bar-track">
                            <div class="stat-bar-fill healing-color" :style="{ width: row.team1.healingPercent + '%' }"></div>
                          </div>
                          <span class="stat-value">{{ formatNumber(row.team1.healing) }}</span>
                        </div>
                        <div class="stat-row">
                          <span class="stat-label">抵挡</span>
                          <div class="stat-bar-track">
                            <div class="stat-bar-fill mitigation-color" :style="{ width: row.team1.mitigationPercent + '%' }"></div>
                          </div>
                          <span class="stat-value">{{ formatNumber(row.team1.mitigation) }}</span>
                        </div>
                      </div>
                    </template>
                    <div v-else class="empty-player">无数据</div>
                  </div>

                  <!-- Team 2 Player Card -->
                  <div class="player-card team2-card">
                    <template v-if="row.team2">
                      <div class="player-card-header">
                        <div class="player-role-name">
                          <img :src="getRoleIconUrl(row.team2.role)" class="role-icon" alt="" />
                          <span class="player-name" :class="row.team2.role">{{ row.team2.name }}</span>
                        </div>
                        <span class="player-kda">{{ row.team2.kills }}/{{ row.team2.assists }}/{{ row.team2.deaths }}</span>
                      </div>
                      <div class="player-stats">
                        <div class="stat-row">
                          <span class="stat-label">伤害</span>
                          <div class="stat-bar-track">
                            <div class="stat-bar-fill damage-color" :style="{ width: row.team2.damagePercent + '%' }"></div>
                          </div>
                          <span class="stat-value">{{ formatNumber(row.team2.damage) }}</span>
                        </div>
                        <div class="stat-row">
                          <span class="stat-label">治疗</span>
                          <div class="stat-bar-track">
                            <div class="stat-bar-fill healing-color" :style="{ width: row.team2.healingPercent + '%' }"></div>
                          </div>
                          <span class="stat-value">{{ formatNumber(row.team2.healing) }}</span>
                        </div>
                        <div class="stat-row">
                          <span class="stat-label">抵挡</span>
                          <div class="stat-bar-track">
                            <div class="stat-bar-fill mitigation-color" :style="{ width: row.team2.mitigationPercent + '%' }"></div>
                          </div>
                          <span class="stat-value">{{ formatNumber(row.team2.mitigation) }}</span>
                        </div>
                      </div>
                    </template>
                    <div v-else class="empty-player">无数据</div>
                  </div>
                </template>
              </div>
            </div>
          </div>
          <div v-else class="modal-empty-state">
            暂无比赛详情数据
</div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script>
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useStore } from 'vuex';
import { ArrowUp, ArrowDown, Close, Timer, VideoCamera, DocumentCopy, DataLine, MapLocation } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import apiService from '@/services/api';
import { getMapImageUrl } from '@/utils/mapImages';

export default {
  name: 'RecentMatches',
  components: {
    ArrowUp,
    ArrowDown,
    Close,
    Timer,
    VideoCamera,
    DocumentCopy,
    DataLine,
    MapLocation
  },
  props: {
    matches: {
      type: Array,
      default: () => []
    },
    mapGames: {
      type: Array,
      default: () => []
    }
  },
  setup(props) {
    const store = useStore();
    const showAllMatches = ref(false);

    // Modal State
    const selectedMatch = ref(null);
    const isLoadingDetails = ref(false);
    const matchDetails = ref({ mapGames: [], playerStats: [] });
    const activeTab = ref('overall');
    
    // Replay Expand State
    const expandedReplays = ref(new Set());
    
    const toggleReplays = (matchId) => {
      if (expandedReplays.value.has(matchId)) {
        expandedReplays.value.delete(matchId);
      } else {
        expandedReplays.value.add(matchId);
      }
    };
    
    const isReplaysExpanded = (matchId) => {
      return expandedReplays.value.has(matchId);
    };

    // 提取所有有效的日期并去重排序（降序）
    const allDatesSorted = computed(() => {
      return [...new Set(
        props.matches
          .map(m => m.matchDate)
          .filter(Boolean)
      )].sort((a, b) => new Date(b) - new Date(a));
    });

    const hasMoreMatches = computed(() => {
      return allDatesSorted.value.length > 2;
    });

    const displayedMatches = computed(() => {
      if (!props.matches || props.matches.length === 0) return [];
      
      const dates = allDatesSorted.value;
      if (dates.length === 0) return [];

      // 如果未展开，则只取最近的两天；如果已展开，则取全部天数
      const targetDates = showAllMatches.value ? dates : dates.slice(0, 2);

      // 返回对应的所有比赛，并按日期降序排序
      const filteredMatches = props.matches
        .filter(m => targetDates.includes(m.matchDate))
        .sort((a, b) => new Date(b.matchDate) - new Date(a.matchDate));

      // 按日期分组
      const groups = {};
      filteredMatches.forEach(match => {
        const date = match.matchDate;
        if (!groups[date]) {
          groups[date] = {
            date: date,
            formattedDate: formatDateStr(date),
            matches: []
          };
        }
        groups[date].matches.push(match);
      });
      
      // 将对象转为数组并按日期降序排序
      return Object.values(groups).sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    const toggleShowAll = () => {
      showAllMatches.value = !showAllMatches.value;
    };

    const formatDateStr = (dateStr) => {
      if (!dateStr) return '';
      try {
        const date = new Date(dateStr);
        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
      } catch (e) {
        return dateStr;
      }
    };

    const getTeamName = (teamId) => {
      const team = store.state.teams.find(t => t.id === teamId);
      return team ? team.name : 'Unknown';
    };

    const getTeamLogo = (teamId) => {
      const team = store.state.teams.find(t => t.id === teamId);
      return team ? team.logo : null;
    };

    const getMapName = (mapId) => {
      const map = store.state.maps.find(m => m.id === mapId);
      return map ? map.name : '未知地图';
    };

    const getMapImageUrlWrapper = (mapId) => {
      const map = store.state.maps.find(m => m.id === mapId);
      return getMapImageUrl(map);
    };

    const formatDuration = (minutesFloat) => {
      if (!minutesFloat) return '00:00';
      const m = Math.floor(minutesFloat);
      const s = Math.round((minutesFloat - m) * 60);
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const openMatchDetails = async (match) => {
      selectedMatch.value = match;
      isLoadingDetails.value = true;
      activeTab.value = null;
      matchDetails.value = { mapGames: [], playerStats: [] };
      
      try {
        // Fetch map games
        const mapGames = await apiService.getMatchMapGames(match.id);
        const mapGamesList = Array.isArray(mapGames) ? mapGames : mapGames.data || [];
        matchDetails.value.mapGames = mapGamesList;
        
        activeTab.value = 'overall';
        
        // Fetch player stats for all map games concurrently
        const statsPromises = mapGamesList.map(mg => apiService.getMapGamePlayerStats(mg.id));
        const statsResults = await Promise.all(statsPromises);
        
        // Flatten the results
        const allPlayerStats = [];
        statsResults.forEach(res => {
          const stats = Array.isArray(res) ? res : res.data || [];
          allPlayerStats.push(...stats);
        });
        
        matchDetails.value.playerStats = allPlayerStats;
      } catch (err) {
        console.error('Failed to load match details:', err);
      } finally {
        isLoadingDetails.value = false;
      }
    };

    const closeMatchDetails = () => {
      selectedMatch.value = null;
      matchDetails.value = { mapGames: [], playerStats: [] };
    };

    const formatNumber = (num) => {
      if (num == null) return '0';
      return Math.round(num).toLocaleString();
    };

    const getRoleIconUrl = (role) => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!role) return `${baseUrl}icons/role/DPS.png`;
      const lowerRole = role.toLowerCase();
      if (lowerRole === 'tank') return `${baseUrl}icons/role/Tank.png`;
      if (lowerRole === 'damage') return `${baseUrl}icons/role/DPS.png`;
      if (lowerRole === 'support') return `${baseUrl}icons/role/Support.png`;
      return `${baseUrl}icons/role/DPS.png`;
    };

    const currentMapGame = computed(() => {
      if (!matchDetails.value || !matchDetails.value.mapGames) return null;
      return matchDetails.value.mapGames.find(mg => mg.id === activeTab.value) || null;
    });

    const hasMapGames = (matchId) => {
      if (!props.mapGames || !Array.isArray(props.mapGames)) return false;
      return props.mapGames.some(mg => mg.matchId === matchId);
    };

    const getMapGamesInfo = (matchId) => {
      if (!props.mapGames || !Array.isArray(props.mapGames)) return [];
      const games = props.mapGames.filter(mg => mg.matchId === matchId);
      // 根据 mapGame 的 ID 或创建时间正序排序，确保地图顺序与比赛实际发生顺序一致
      const sortedGames = [...games].sort((a, b) => a.id - b.id);
      return sortedGames.map(mg => ({
        mapId: mg.mapId,
        code: mg.replayId && mg.replayId.trim() !== '' ? mg.replayId.trim() : null,
        mapName: getMapName(mg.mapId)
      }));
    };

    const copyCode = async (code, event) => {
      if (event) event.stopPropagation();
      try {
        await navigator.clipboard.writeText(code);
        ElMessage.success({ message: `录像代码 ${code} 已复制`, duration: 2000 });
      } catch (err) {
        ElMessage.error('复制失败');
      }
    };

    const overallStats = computed(() => {
      if (!selectedMatch.value || !matchDetails.value || !matchDetails.value.playerStats) {
        return { team1: [], team2: [] };
      }

      const team1Id = selectedMatch.value.team1Id;
      const team2Id = selectedMatch.value.team2Id;

      const playerMap = new Map();
      matchDetails.value.playerStats.forEach(stat => {
        const pId = stat.playerId;
        if (!playerMap.has(pId)) {
          playerMap.set(pId, {
            playerId: pId,
            teamId: stat.teamId,
            name: stat.player?.name || 'Unknown',
            role: stat.player?.role || 'damage',
            kills: 0,
            deaths: 0,
            assists: 0,
            damage: 0,
            healing: 0,
            mitigation: 0
          });
        }
        const p = playerMap.get(pId);
        p.kills += (stat.kills || 0);
        p.deaths += (stat.deaths || 0);
        p.assists += (stat.assists || 0);
        p.damage += (stat.damage || 0);
        p.healing += (stat.healing || 0);
        p.mitigation += (stat.mitigation || 0);
      });

      const allPlayers = Array.from(playerMap.values()).map(p => {
        p.kd = p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2);
        p.kdValue = parseFloat(p.kd); // For numeric comparison
        return p;
      });

      // Calculate match maximums for highlighting
      let maxKd = 0, maxDamage = 0, maxHealing = 0, maxMitigation = 0;
      allPlayers.forEach(p => {
        if (p.kdValue > maxKd) maxKd = p.kdValue;
        if (p.damage > maxDamage) maxDamage = p.damage;
        if (p.healing > maxHealing) maxHealing = p.healing;
        if (p.mitigation > maxMitigation) maxMitigation = p.mitigation;
      });

      const roleOrder = { 'tank': 1, 'damage': 2, 'support': 3 };
      
      const team1Players = allPlayers.filter(p => p.teamId === team1Id).sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
      const team2Players = allPlayers.filter(p => p.teamId === team2Id).sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

      return { 
        team1: team1Players, 
        team2: team2Players,
        maxStats: {
          kd: maxKd,
          damage: maxDamage,
          healing: maxHealing,
          mitigation: maxMitigation
        }
      };
    });

    const currentStatsRows = computed(() => {
      if (!selectedMatch.value || !matchDetails.value || !matchDetails.value.playerStats || activeTab.value === 'overall') {
        return [];
      }

      const team1Id = selectedMatch.value.team1Id;
      const team2Id = selectedMatch.value.team2Id;

      // Filter stats based on activeTab
      let filteredStats = matchDetails.value.playerStats.filter(s => s.mapGameId === activeTab.value);

      // Group by playerId
      const playerMap = new Map();
      filteredStats.forEach(stat => {
        const pId = stat.playerId;
        if (!playerMap.has(pId)) {
          playerMap.set(pId, {
            playerId: pId,
            teamId: stat.teamId,
            name: stat.player?.name || 'Unknown',
            role: stat.player?.role || 'damage', // fallback
            kills: 0,
            deaths: 0,
            assists: 0,
            damage: 0,
            healing: 0,
            mitigation: 0
          });
        }
        const p = playerMap.get(pId);
        p.kills += (stat.kills || 0);
        p.deaths += (stat.deaths || 0);
        p.assists += (stat.assists || 0);
        p.damage += (stat.damage || 0);
        p.healing += (stat.healing || 0);
        p.mitigation += (stat.mitigation || 0);
      });

      const allPlayers = Array.from(playerMap.values());

      // Calculate max values for progress bars
      let maxDamage = 0;
      let maxHealing = 0;
      let maxMitigation = 0;

      allPlayers.forEach(p => {
        if (p.damage > maxDamage) maxDamage = p.damage;
        if (p.healing > maxHealing) maxHealing = p.healing;
        if (p.mitigation > maxMitigation) maxMitigation = p.mitigation;
      });

      // Assign percentages
      allPlayers.forEach(p => {
        p.damagePercent = maxDamage > 0 ? (p.damage / maxDamage) * 100 : 0;
        p.healingPercent = maxHealing > 0 ? (p.healing / maxHealing) * 100 : 0;
        p.mitigationPercent = maxMitigation > 0 ? (p.mitigation / maxMitigation) * 100 : 0;
      });

      // Split into teams and sort by role
      const roleOrder = { 'tank': 1, 'damage': 2, 'support': 3 };
      
      const team1Players = allPlayers.filter(p => p.teamId === team1Id).sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
      const team2Players = allPlayers.filter(p => p.teamId === team2Id).sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

      // Zip into rows
      const rows = [];
      const maxLen = Math.max(team1Players.length, team2Players.length);
      for (let i = 0; i < maxLen; i++) {
        rows.push({
          team1: team1Players[i] || null,
          team2: team2Players[i] || null
        });
      }

      return rows;
    });

    // Handle auto-resize of player names
    const fitPlayerNames = () => {
      const nameElements = document.querySelectorAll('.player-name');
      nameElements.forEach(el => {
        const container = el.parentElement; // .player-role-name
        if (!container) return;
        
        // Reset scale to measure real width
        el.style.transform = 'scale(1)';
        
        // Get the available width in the container, minus the role icon (16px + 8px gap)
        const containerWidth = container.clientWidth;
        const availableWidth = containerWidth - 24; 
        
        const textWidth = el.scrollWidth;
        
        if (textWidth > availableWidth && availableWidth > 0) {
          const scale = availableWidth / textWidth;
          // Apply scale, but don't shrink too much to remain legible
          const finalScale = Math.max(scale, 0.6);
          el.style.transform = `scale(${finalScale})`;
        }
      });
    };

    // Watch for tab changes or modal open to recalculate
    watch([activeTab, selectedMatch], () => {
      nextTick(() => {
        // Small timeout to allow DOM to render and flexbox to calculate
        setTimeout(fitPlayerNames, 50);
      });
    });

    // Handle window resize
    onMounted(() => {
      window.addEventListener('resize', fitPlayerNames);
    });
    
    onUnmounted(() => {
      window.removeEventListener('resize', fitPlayerNames);
    });

    return {
      overallStats,
      displayedMatches,
      showAllMatches,
      hasMoreMatches,
      toggleShowAll,
      getTeamName,
      getTeamLogo,
      getMapName,
      getMapImageUrl: getMapImageUrlWrapper,
      formatDuration,
      selectedMatch,
      isLoadingDetails,
      matchDetails,
      activeTab,
      currentMapGame,
      openMatchDetails,
      closeMatchDetails,
      currentStatsRows,
      formatNumber,
      getRoleIconUrl,
      hasMapGames,
      getMapGamesInfo,
      copyCode,
      toggleReplays,
      isReplaysExpanded
    };
  }
};
</script>

<style scoped>
.recent-matches-container {
  width: 100%;
}

.show-more-container {
  display: flex;
  justify-content: center;
  margin-top: -8px;
  margin-bottom: 24px;
}

.show-more-btn {
  width: 100%;
  max-width: 600px;
  font-weight: 600;
}

.liquipedia-matches-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

.match-date-header {
  font-family: 'Oxanium', monospace;
  font-size: 14px;
  font-weight: 600;
  color: #495057;
  background-color: #f8f9fa;
  padding: 4px 12px;
  border-radius: 4px;
  text-align: center;
  border: 1px solid #dee2e6;
  display: inline-block;
  margin-bottom: 8px;
}

.matches-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 600px;
}

.match-row {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  background: #f8f9fa;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  border: 1px solid #e4e7ed;
  transition: box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
}

.match-row:hover {
  background: #f0f2f5;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: #dcdfe6;
  transform: translateY(-2px);
}

.match-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
}

.match-replays {
  display: flex;
  flex-direction: column;
  background: #fafafa;
  border-top: 1px solid #f0f0f0;
}

.replay-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #888;
  padding: 8px 0;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.replay-label:hover {
  color: #111;
  background: #f0f0f0;
}

.expand-icon {
  font-size: 12px;
  transition: transform 0.3s ease;
}

.expand-icon.is-expanded {
  transform: rotate(180deg);
}

.replay-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  padding: 8px 20px 8px;
}

.replay-tag {
  display: inline-flex;
  align-items: stretch;
  background: #ffffff;
  color: #333;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid #e8e8e8;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
  line-height: 1;
}

.replay-map-name {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: #f5f5f5;
  font-weight: 600;
  color: #555;
  border-right: 1px solid #e8e8e8;
  transition: background-color 0.2s ease, color 0.2s ease;
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1;
}

.replay-code {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  font-family: 'Oxanium', monospace;
  font-weight: 500;
  color: #444;
  letter-spacing: 0.5px;
  line-height: 1;
}

.copy-icon {
  align-self: center;
  font-size: 20px;
  opacity: 0.4;
  padding-right: 8px;
  padding-left: 2px;
  flex-shrink: 0;
  transition: opacity 0.2s ease, color 0.2s ease;
}

.replay-tag:hover {
  border-color: #d9d9d9;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transform: translateY(-1px);
}

.replay-tag:hover .replay-map-name {
  background: #111;
  color: #fff;
  border-right-color: #111;
}

.replay-tag:hover .replay-code {
  color: #111;
}

.replay-tag:hover .copy-icon {
  opacity: 1;
  color: #111;
}

/* 禁用状态样式 (无代码时) */
.replay-tag.disabled {
  cursor: default;
  background: #f9f9f9;
  border-color: #f0f0f0;
  box-shadow: none;
}

.replay-tag.disabled:hover {
  transform: none;
  border-color: #f0f0f0;
  box-shadow: none;
}

.replay-tag.disabled .replay-map-name {
  background: #f9f9f9;
  color: #a0a0a0;
  border-right-color: #f0f0f0;
}

.replay-tag.disabled .replay-code.empty-code {
  color: #c0c0c0;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 700;
  padding: 4px 12px;
  line-height: 1;
}

.team-side {
  display: flex;
  align-items: center;
  gap: 24px;
  flex: 1;
}

.left-side {
  justify-content: flex-end;
}

.right-side {
  justify-content: flex-start;
}

.team-logo-container {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.team-logo {
  max-width: 30px;
  max-height: 30px;
  width: auto;
  height: auto;
  object-fit: contain;
}

.team-logo-placeholder {
  width: 64px;
  height: 64px;
  background: #f0f2f5;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: bold;
  color: #909399;
}

.team-name {
  font-weight: 700;
  font-size: 28px;
  color: #606266;
  font-family: 'Oxanium', monospace;
}

.winner-name {
  color: #303133;
  font-weight: 800;
}

.score-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 100px;
  padding: 0 16px;
}

.score-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 22px;
  font-weight: 700;
  color: #303133;
  font-family: 'Oxanium', monospace;
}

.score-number {
  min-width: 20px;
  text-align: center;
}

.score-colon {
  color: #909399;
  font-size: 18px;
  position: relative;
  top: -2px;
}

.winner-arrow {
  color: #409EFF;
  font-size: 12px;
  opacity: 0;
}

.winner-arrow.visible {
  opacity: 1;
}

.bo-format {
  font-size: 12px;
  color: #909399;
  margin-top: 6px;
  font-family: 'Oxanium', monospace;
  background: #f4f4f5;
  padding: 2px 8px;
  border-radius: 12px;
}

@media (max-width: 768px) {
  .team-name {
    font-size: 14px;
  }
  .match-content {
    padding: 10px 12px;
  }
  .match-replays {
    flex-direction: column;
  }
  .replay-label {
    padding: 6px 0;
    font-size: 12px;
  }
  .replay-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px 12px 4px;
  }
  .replay-tag {
    font-size: 11px;
  }
  .replay-map-name, .replay-code {
    padding: 3px 6px;
  }
  .team-logo-container {
    width: 24px;
    height: 24px;
  }
}

/* Modal Styles */
.match-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.match-modal-content {
  position: relative;
  background: #ffffff;
  border-radius: 12px;
  width: 100%;
  max-width: 800px;
  max-height: 96vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.08);
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

/* Modal Transition Animations */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-active .match-modal-content,
.modal-fade-leave-active .match-modal-content {
  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .match-modal-content,
.modal-fade-leave-to .match-modal-content {
  transform: translateY(20px) scale(0.95);
  opacity: 0;
}

.modal-close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  background: transparent;
  border: none;
  font-size: 20px;
  color: #666;
  cursor: pointer;
  z-index: 10;
  transition: color 0.2s, transform 0.2s;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.modal-close-btn:hover {
  color: #111;
  background: rgba(0, 0, 0, 0.04);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #f0f0f0;
  background: #ffffff;
}

.modal-team {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.modal-team.left {
  justify-content: flex-end;
}

.modal-team.right {
  justify-content: flex-start;
}

.modal-team-name {
  font-size: 20px;
  font-weight: 800;
  font-family: 'Inter', 'Oxanium', sans-serif;
  color: #111;
  letter-spacing: -0.5px;
}

.modal-team-logo {
  width: 40px;
  height: 40px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.05));
}

.modal-score {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 28px;
  font-weight: 900;
  font-family: 'Inter', 'Oxanium', sans-serif;
  padding: 0 24px;
  letter-spacing: -1px;
}

.modal-score .colon {
  color: #dcdcdc;
  font-size: 28px;
  position: relative;
  top: -3px;
}

.modal-score .winner {
  color: #111;
}
.modal-score span:not(.winner):not(.colon) {
  color: #888;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.modal-loading, .modal-empty-state {
  padding: 40px;
  text-align: center;
  color: #909399;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #409EFF;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.modal-data-container {
  display: flex;
  flex-direction: column;
}

.modal-tabs {
  display: flex;
  gap: 8px;
  padding: 12px 24px;
  background: #ffffff;
  border-bottom: 1px solid #f0f0f0;
  overflow-x: auto;
  scrollbar-width: none;
}
.modal-tabs::-webkit-scrollbar {
  display: none;
}

.modal-tab {
  background: #f4f5f7;
  border: none;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.modal-tab:hover {
  background: #e9ebee;
  color: #111;
}

.modal-tab.active {
  background: #111;
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.map-info-banner {
  position: relative;
  height: 56px;
  background-size: cover;
  background-position: center;
  border-radius: 6px;
  margin: 12px 24px 0;
  overflow: hidden;
  display: flex;
  align-items: center;
}

.overall-summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 16px 24px 0;
  padding: 12px 16px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #ebeef5;
  color: #303133;
}

.summary-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  font-family: 'Inter', 'Oxanium', sans-serif;
}

.summary-title .el-icon {
  color: #409EFF;
  font-size: 18px;
}

.summary-meta {
  font-size: 13px;
  color: #909399;
  font-weight: 500;
}

.banner-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 40%, rgba(0,0,0,0.85) 100%);
  z-index: 1;
}

.banner-content {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 0 16px;
  color: #fff;
}

.banner-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.map-name {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  font-family: 'Oxanium', monospace;
  text-shadow: 0 2px 4px rgba(0,0,0,0.6);
  letter-spacing: 0.5px;
}

.map-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #e4e7ed;
  font-family: 'Oxanium', monospace;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.banner-right {
  display: flex;
  align-items: center;
}

.map-score {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
  font-weight: 800;
  font-family: 'Oxanium', monospace;
  text-shadow: 0 2px 4px rgba(0,0,0,0.6);
  background: rgba(0,0,0,0.4);
  padding: 2px 10px;
  border-radius: 16px;
  backdrop-filter: blur(2px);
  border: 1px solid rgba(255,255,255,0.1);
}

.score-team {
  font-size: 13px;
  opacity: 0.7;
}

.score-team.winner {
  opacity: 1;
  color: #e6a23c;
}

.score-divider {
  font-size: 16px;
  opacity: 0.6;
}

.modal-stats-area {
  padding: 16px 24px 20px;
  background: #f8f9fa;
}

.overall-stats-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.overall-team-section {
  background: #ffffff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

.overall-team-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 900;
  padding: 12px 20px;
  background: #f4f5f7;
  border-bottom: 2px solid #e4e7ed;
  font-family: 'Inter', 'Oxanium', sans-serif;
  color: #111;
  letter-spacing: -0.5px;
}

.overall-team-logo {
  width: 24px;
  height: 24px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.05));
}

.overall-table {
  display: flex;
  flex-direction: column;
}

.overall-table-header {
  display: flex;
  padding: 8px 16px;
  background: #fcfcfd;
  font-size: 12px;
  font-weight: 600;
  color: #909399;
  border-bottom: 1px solid #ebeef5;
}

.overall-table-row {
  display: flex;
  padding: 10px 16px;
  align-items: center;
  font-size: 13px;
  border-bottom: 1px solid #f0f2f5;
  transition: background-color 0.2s;
}

.overall-table-row:last-child {
  border-bottom: none;
}

.overall-table-row:hover {
  background-color: #f5f7fa;
}

.col-role { width: 40px; display: flex; justify-content: center; flex-shrink: 0; }
.col-name { flex: 1; font-weight: 700; font-family: 'Inter', 'Oxanium', sans-serif; text-transform: uppercase; color: #111; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-kda { width: 90px; text-align: center; font-weight: 600; color: #606266; font-family: 'Inter', 'Oxanium', sans-serif; flex-shrink: 0; }
.col-kd { width: 50px; text-align: center; font-weight: 700; font-family: 'Inter', 'Oxanium', sans-serif; flex-shrink: 0; }
.highlight-kd { color: #409EFF; }
.col-dmg, .col-heal, .col-mit { width: 70px; text-align: right; font-weight: 600; font-family: 'Inter', 'Oxanium', sans-serif; color: #303133; flex-shrink: 0; }

.match-best {
  color: #20c997 !important;
  font-weight: 800 !important;
}

.stats-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.team-col-header {
  font-size: 16px;
  font-weight: 800;
  text-align: center;
  padding-bottom: 8px;
  border-bottom: 2px solid #e4e7ed;
  color: #111;
  font-family: 'Inter', 'Oxanium', sans-serif;
  letter-spacing: -0.5px;
}

.player-card {
  background: #ffffff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.player-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.player-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 6px;
  border-bottom: 1px dashed #f0f0f0;
  gap: 8px;
}

.player-role-name {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.role-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
  filter: brightness(0) invert(0.2);
  flex-shrink: 0;
}

.player-name {
  font-weight: 800;
  font-size: 14px;
  color: #111;
  text-transform: uppercase;
  font-family: 'Inter', 'Oxanium', sans-serif;
  letter-spacing: -0.5px;
  white-space: nowrap;
  display: inline-block;
  transform-origin: left center;
}

.player-kda {
  background: #f4f5f7;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  color: #444;
  font-family: 'Inter', 'Oxanium', sans-serif;
  flex-shrink: 0;
}

.player-stats {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  position: relative;
}

.stat-label {
  color: #666;
  width: 28px;
  flex-shrink: 0;
  font-weight: 500;
}

.stat-bar-track {
  flex: 1;
  height: 5px;
  background: #f0f2f5;
  border-radius: 2px;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.damage-color { background-color: #ff6b6b; } /* 柔和的珊瑚红 */
.healing-color { background-color: #20c997; } /* 柔和的青绿 */
.mitigation-color { background-color: #339af0; } /* 柔和的浅蓝 */

.stat-value {
  width: 40px;
  text-align: right;
  font-family: 'Inter', 'Oxanium', sans-serif;
  font-weight: 700;
  color: #111;
}

.empty-player {
  color: #c0c4cc;
  text-align: center;
  padding: 20px 0;
  font-size: 14px;
}

/* Mobile Responsiveness */
@media (max-width: 768px) {
  .match-modal-overlay {
    padding: 8px;
  }
  
  .match-modal-content {
    max-height: 98vh;
    border-radius: 8px;
  }
  
  .modal-header {
    padding: 10px 12px;
  }
  
  .modal-team-name {
    font-size: 14px;
  }
  
  .modal-team-logo {
    width: 24px;
    height: 24px;
  }
  
  .modal-score {
    font-size: 20px;
    padding: 0 12px;
  }
  
  .modal-tabs {
    padding: 8px 12px;
    gap: 6px;
  }
  
  .modal-tab {
    padding: 4px 12px;
    font-size: 12px;
  }
  
  .map-info-banner {
    margin: 8px 12px 0;
    border-radius: 4px;
  }
  
  .overall-summary-header {
    margin: 8px 12px 0;
    padding: 8px 12px;
  }
  
  .summary-title {
    font-size: 13px;
  }
  
  .summary-meta {
    font-size: 11px;
  }
  
  .banner-content {
    padding: 0 10px;
  }
  
  .modal-stats-area {
    padding: 10px 12px;
  }
  
  .overall-stats-container {
    gap: 12px;
  }
  
  .overall-team-header {
    font-size: 15px;
    padding: 10px 12px;
    gap: 8px;
  }
  
  .overall-team-logo {
    width: 20px;
    height: 20px;
  }

  .overall-table-header {
    font-size: 10px;
    padding: 6px 8px;
  }

  .overall-table-row {
    padding: 8px;
    font-size: 11px;
  }

  .col-role { width: 28px; }
  .col-kda { width: 65px; font-size: 10px; }
  .col-kd { width: 35px; font-size: 10px; }
  .col-dmg, .col-heal, .col-mit { width: 45px; font-size: 10px; }

  .stats-grid {
    gap: 8px;
  }
  
  .team-col-header {
    font-size: 14px;
    padding-bottom: 6px;
  }
  
  .player-card {
    padding: 8px;
    gap: 6px;
    border-radius: 6px;
  }
  
  .player-name {
    font-size: 12px;
  }
  
  .player-kda {
    font-size: 10px;
    padding: 2px 4px;
  }
  
  .stat-label {
    font-size: 10px;
    width: 24px;
  }
  
  .stat-bar-track {
    height: 4px;
  }
  
  .stat-value {
    font-size: 11px;
    width: 32px;
  }
}
</style>
