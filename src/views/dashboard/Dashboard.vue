<template>
  <div class="dashboard-container">
    <div class="header-container">
      <h2 class="page-title">系统仪表盘</h2>
      <el-button :loading="syncing" @click="handleSync" class="sync-btn" color="#141414">
        <el-icon><Refresh /></el-icon>
        从API手动同步
      </el-button>
    </div>

    <!-- 概览卡片 -->
    <div class="overview-cards">
      <div class="card">
        <div class="card-icon season-icon">
          <el-icon><Calendar /></el-icon>
        </div>
        <div class="card-content">
          <h3 class="card-title">赛季数量</h3>
          <p class="card-value">{{ stats.seasonsCount }}</p>
        </div>
      </div>
      <div class="card">
        <div class="card-icon team-icon">
          <el-icon><Collection /></el-icon>
        </div>
        <div class="card-content">
          <h3 class="card-title">队伍数量</h3>
          <p class="card-value">{{ stats.teamsCount }}</p>
        </div>
      </div>
      <div class="card">
        <div class="card-icon player-icon">
          <el-icon><User /></el-icon>
        </div>
        <div class="card-content">
          <h3 class="card-title">选手数量</h3>
          <p class="card-value">{{ stats.playersCount }}</p>
        </div>
      </div>
      <div class="card">
        <div class="card-icon match-icon">
          <el-icon><Timer /></el-icon>
        </div>
        <div class="card-content">
          <h3 class="card-title">地图局数量</h3>
          <p class="card-value">{{ stats.mapGamesCount }}</p>
        </div>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="charts-container">
      <div class="chart-card">
        <h3 class="chart-title">最近比赛</h3>
        <div class="match-list">
          <div v-for="match in recentMatches" :key="match.id" class="match-item">
            <div class="match-info">
              <span class="match-season">{{ getSeasonName(match.seasonId) }}</span>
              <span class="match-date">{{ formatDate(match.matchDate) }}</span>
            </div>
            <div class="match-scoreboard">
              <div class="score-team" :class="{ winner: match.winnerId === match.team1Id }">
                <span class="team-name">{{ getTeamName(match.team1Id) }}</span>
                <span class="team-score">{{ match.team1Score ?? 0 }}</span>
              </div>
              <div class="match-vs">:</div>
              <div class="score-team" :class="{ winner: match.winnerId === match.team2Id }">
                <span class="team-name">{{ getTeamName(match.team2Id) }}</span>
                <span class="team-score">{{ match.team2Score ?? 0 }}</span>
              </div>
            </div>
            <div class="match-detail">
              <span class="detail-label">地图局</span>
              <span class="detail-value">{{ getMatchMapsText(match) }}</span>
            </div>
            <div class="match-detail">
              <span class="detail-label">回放代码</span>
              <span class="detail-value replay-text">{{ getMatchReplayText(match) }}</span>
            </div>
          </div>
          <div v-if="recentMatches.length === 0" class="empty-state">
            <p>暂无比赛数据</p>
          </div>
        </div>
      </div>

      <div class="chart-card">
        <div class="sync-header">
          <h3 class="chart-title">最近同步更新</h3>
          <span class="sync-time">{{ latestSyncAt ? `最近同步：${formatDateTime(latestSyncAt)}` : '暂无同步记录' }}</span>
        </div>
        <div v-if="updatedMatches.length > 0" class="sync-summary">
          本次展示最近 {{ displayedUpdatedMatches.length }} 场，累计更新 {{ updatedMatches.length }} 场
        </div>
        <div class="sync-list">
          <div v-for="match in displayedUpdatedMatches" :key="`${match.matchId}-${match.syncedAt}`" class="sync-item">
            <div class="sync-top">
              <span class="sync-season">{{ match.seasonName || getSeasonName(match.seasonId) }}</span>
              <span class="sync-date">{{ formatDate(match.matchDate) }}</span>
            </div>
            <div class="sync-matchup">
              <span class="sync-team" :class="{ winner: match.winnerId === match.team1Id }">{{ match.team1Name || getTeamName(match.team1Id) }}</span>
              <span class="sync-score">{{ match.team1Score ?? 0 }} - {{ match.team2Score ?? 0 }}</span>
              <span class="sync-team" :class="{ winner: match.winnerId === match.team2Id }">{{ match.team2Name || getTeamName(match.team2Id) }}</span>
            </div>
            <div class="sync-tags">
              <span v-if="match.updatedMatch" class="sync-tag">比赛信息已更新</span>
              <span class="sync-tag">地图局更新 {{ match.updatedMapGamesCount || 0 }}</span>
              <span class="sync-tag">选手数据更新 {{ match.updatedPlayerStatsCount || 0 }}</span>
            </div>
          </div>
          <div v-if="updatedMatches.length === 0" class="empty-state">
            <p>暂无被同步更新的比赛</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 核心功能模块 -->
    <div class="quick-actions">
      <h3 class="section-title">核心功能模块</h3>
      <div class="artistic-actions">
        <div class="art-card" @click="$router.push('/data-manage/season-stats-upload')">
          <div class="art-content">
            <div class="art-icon"><el-icon><Plus /></el-icon></div>
            <div class="art-text">
              <h4 class="art-title">赛季数据导入</h4>
              <p class="art-desc">快速导入赛季选手总览与阶段数据，适合作为仪表盘后的第一步操作。</p>
            </div>
          </div>
          <div class="art-arrow"><el-icon><ArrowRight /></el-icon></div>
        </div>

        <div class="art-card" @click="$router.push('/visualize')">
          <div class="art-content">
            <div class="art-icon"><el-icon><View /></el-icon></div>
            <div class="art-text">
              <h4 class="art-title">数据可视化</h4>
              <p class="art-desc">进入赛季展示与多维分析页面，从比分、阵容到英雄数据统一查看。</p>
            </div>
          </div>
          <div class="art-arrow"><el-icon><ArrowRight /></el-icon></div>
        </div>

        <div class="art-card" @click="$router.push('/analytics')">
          <div class="art-content">
            <div class="art-icon"><el-icon><DataLine /></el-icon></div>
            <div class="art-text">
              <h4 class="art-title">访问统计</h4>
              <p class="art-desc">查看全站的访问量、用户留存、核心操作转化及前端性能数据。</p>
            </div>
          </div>
          <div class="art-arrow"><el-icon><ArrowRight /></el-icon></div>
        </div>

        <div class="art-card" @click="$router.push('/data-manage/matches')">
          <div class="art-content">
            <div class="art-icon"><el-icon><Management /></el-icon></div>
            <div class="art-text">
              <h4 class="art-title">比赛管理</h4>
              <p class="art-desc">集中维护比赛结果、地图局详情与回放信息，快速修正赛事录入内容。</p>
            </div>
          </div>
          <div class="art-arrow"><el-icon><ArrowRight /></el-icon></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import { ElMessage } from 'element-plus';
import { Calendar, Collection, User, Timer, Refresh, ArrowRight, View, Management, DataLine } from '@element-plus/icons-vue';
import apiService from '@/services/api';

export default {
  name: 'DashboardView',
  components: {
    Calendar,
    Collection,
    User,
    Timer,
    Refresh,
    ArrowRight,
    View,
    Management,
    DataLine
  },
  setup() {
    const store = useStore();
    const mapGamesCount = ref(0);
    const recentMatches = ref([]);
    const updatedMatches = ref([]);
    const latestSyncAt = ref('');
    const syncing = ref(false);
    const displayedUpdatedMatches = computed(() => updatedMatches.value.slice(0, 7));
    
    const stats = computed(() => {
      return {
        seasonsCount: store.state.seasons.length,
        teamsCount: store.state.teams.length,
        playersCount: store.state.players.length,
        mapGamesCount: mapGamesCount.value
      };
    });

    const formatDate = (dateString) => {
      if (!dateString) {
        return '未知时间';
      }
      const date = new Date(dateString);
      return date.toLocaleDateString('zh-CN');
    };

    const formatDateTime = (dateString) => {
      if (!dateString) {
        return '未知时间';
      }
      const date = new Date(dateString);
      return date.toLocaleString('zh-CN', { hour12: false });
    };

    const getSeasonName = (seasonId) => {
      const season = store.getters.getSeasonById(seasonId);
      return season ? season.name : '未知赛季';
    };

    const getTeamName = (teamId) => {
      const team = store.getters.getTeamById(teamId);
      return team ? team.name : '未知队伍';
    };

    const getMapName = (mapId) => {
      const map = store.getters.getMapById(mapId);
      return map ? map.name : '未知地图';
    };

    const getMatchMapsText = (match) => {
      const mapNames = Array.isArray(match.mapGames)
        ? match.mapGames.map(item => getMapName(item.mapId)).filter(Boolean)
        : [];

      if (mapNames.length === 0) {
        return '0 局';
      }

      return `${mapNames.length} 局 · ${mapNames.join(' / ')}`;
    };

    const getMatchReplayText = (match) => {
      const replayIds = Array.isArray(match.replayIds) ? match.replayIds : [];
      return replayIds.length > 0 ? replayIds.join(' · ') : '暂无回放代码';
    };

    const loadMapGamesCount = async () => {
      const pageSize = 500;
      let page = 1;
      let total = 0;
      let hasMore = true;

      while (hasMore) {
        const batch = await apiService.getMapGames({ page, pageSize });
        const list = Array.isArray(batch) ? batch : [];
        total += list.length;
        hasMore = list.length === pageSize;
        page += 1;
      }

      mapGamesCount.value = total;
    };

    const loadRecentMatches = async () => {
      const response = await apiService.getMatches({ page: 1, pageSize: 5 });
      const matchList = Array.isArray(response?.list) ? response.list : [];

      recentMatches.value = await Promise.all(
        matchList.map(async (match) => {
          const mapGames = await apiService.getMatchMapGames(match.id).catch(() => []);
          const replayIds = [...new Set(
            (Array.isArray(mapGames) ? mapGames : [])
              .map(item => String(item.replayId || '').trim())
              .filter(Boolean)
          )];

          return {
            ...match,
            mapGames: Array.isArray(mapGames) ? mapGames : [],
            replayIds
          };
        })
      );
    };

    const loadLatestSyncSummary = async () => {
      try {
        const result = await apiService.getConfig('latest_match_sync_updates');
        updatedMatches.value = Array.isArray(result?.updatedMatches) ? result.updatedMatches : [];
        latestSyncAt.value = result?.lastSyncAt || '';
      } catch (error) {
        updatedMatches.value = [];
        latestSyncAt.value = '';
      }
    };

    const handleSync = async () => {
      try {
        syncing.value = true;
        const response = await apiService.syncExternalMatches();
        const data = response.data || response;
        const summaryText = [
          `新增比赛: ${data.newMatchesCount || 0}`,
          `更新比赛: ${data.updatedMatchesCount || 0}`,
          `新增地图局: ${data.newMapGamesCount || 0}`,
          `更新地图局: ${data.updatedMapGamesCount || 0}`,
          `新增选手数据: ${data.newPlayerStatsCount || 0}`,
          `更新选手数据: ${data.updatedPlayerStatsCount || 0}`
        ].join('，');
        
        let extraText = '';
        if (data.seasonImportSummary && data.seasonImportSummary.length > 0) {
          extraText = ` [赛季聚合预导入: ` + data.seasonImportSummary.join('；') + `]`;
        }

        if (data.errors && data.errors.length > 0) {
          ElMessage.warning(`同步结束。${summaryText}。但有 ${data.errors.length} 场失败（请看控制台日志）。${extraText}`);
          console.warn('同步失败的比赛详情:', data.errors);
        } else {
          ElMessage.success(`同步完成！${summaryText}${extraText}`);
        }
        
        // 重新加载数据
        await Promise.all([
          store.dispatch('loadBaseData'),
          loadMapGamesCount(),
          loadRecentMatches(),
          loadLatestSyncSummary()
        ]);
      } catch (error) {
        ElMessage.error('同步失败: ' + (error.response?.data?.error || error.message));
      } finally {
        syncing.value = false;
      }
    };

    onMounted(async () => {
      await store.dispatch('loadBaseData');
      await Promise.all([
        loadMapGamesCount(),
        loadRecentMatches(),
        loadLatestSyncSummary()
      ]);
    });
    
    return {
      stats,
      recentMatches,
      updatedMatches,
      displayedUpdatedMatches,
      latestSyncAt,
      formatDate,
      formatDateTime,
      getSeasonName,
      getTeamName,
      getMapName,
      getMatchMapsText,
      getMatchReplayText,
      syncing,
      handleSync
    };
  }
}
</script>

<style scoped>
/* 全局页面样式 */
.dashboard-container {
  padding: 20px 0;
  color: #e0e0e0;
}

.header-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
  color: #ffffff;
  font-family: 'Oxanium', sans-serif;
  letter-spacing: 1px;
}

.sync-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background-color: #141414 !important;
  border-color: #2a2a2a !important;
  color: #a3a3a3 !important;
  font-family: 'Oxanium', sans-serif;
  letter-spacing: 1px;
  transition: all 0.3s ease;
}

.sync-btn:hover, .sync-btn:focus {
  background-color: #2a2a2a !important;
  border-color: #404040 !important;
  color: #ffffff !important;
}

/* 概览卡片 (参考顶部统计区) */
.overview-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.card {
  background: #141414;
  border-radius: 2px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  position: relative;
  border: 1px solid #2a2a2a;
  transition: border-color 0.3s ease;
}

.card:hover {
  border-color: #404040;
}

/* 顶部高亮线，有些卡片有黄色高亮 */
.card-icon {
  display: none; /* 隐藏原有的图标，符合数据中心扁平风格 */
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-title {
  font-size: 12px;
  color: #a3a3a3;
  margin: 0;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.card-value {
  font-size: 32px;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
  line-height: 1;
  font-family: 'Orbitron', sans-serif;
}

/* 图表容器 / 列表区 */
.charts-container {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  margin-bottom: 32px;
}

.chart-card {
  background: #141414;
  border-radius: 2px;
  padding: 24px;
  border: 1px solid #2a2a2a;
}

.chart-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 24px;
  color: #ffffff;
  font-family: 'Oxanium', sans-serif;
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.chart-title::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 16px;
  background-color: #facc15;
}

.sync-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 24px;
}

.sync-header .chart-title {
  margin-bottom: 0;
}

.sync-time {
  font-size: 12px;
  color: #888;
  font-family: 'Oxanium', sans-serif;
}

.sync-summary {
  margin-bottom: 16px;
  font-size: 12px;
  color: #9ca3af;
  font-family: 'Oxanium', sans-serif;
}

/* 比赛列表 */
.match-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.match-item {
  padding: 16px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 2px;
  transition: all 0.3s ease;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.match-item:hover {
  background: #222;
  border-color: #555;
}

.match-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 12px;
  color: #888;
  font-family: 'Oxanium', sans-serif;
}

.match-season {
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #a3a3a3;
}

.match-date {
  color: #facc15;
}

.match-scoreboard {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  gap: 14px;
}

.score-team {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 2px;
  font-weight: 600;
  color: #e0e0e0;
  font-family: 'Inter', sans-serif;
  background: #111111;
  border: 1px solid #2a2a2a;
}

.score-team.winner {
  border-color: rgba(250, 204, 21, 0.45);
  background: rgba(250, 204, 21, 0.08);
  color: #facc15;
}

.team-name {
  font-size: 15px;
  letter-spacing: 0.5px;
}

.team-score {
  font-size: 24px;
  line-height: 1;
  font-family: 'Orbitron', sans-serif;
}

.match-vs {
  flex-shrink: 0;
  font-size: 22px;
  font-weight: 700;
  color: #555;
  font-family: 'Orbitron', sans-serif;
}

.match-detail {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 10px;
  align-items: start;
}

.detail-label {
  font-size: 12px;
  color: #7a7a7a;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-family: 'Oxanium', sans-serif;
}

.detail-value {
  font-size: 13px;
  line-height: 1.6;
  color: #d4d4d4;
}

.replay-text {
  color: #facc15;
  word-break: break-all;
}

.empty-state {
  text-align: center;
  padding: 40px 0;
  color: #666;
  font-family: 'Oxanium', sans-serif;
}

.sync-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sync-item {
  padding: 16px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 2px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sync-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: #8f8f8f;
  font-family: 'Oxanium', sans-serif;
}

.sync-season {
  color: #a3a3a3;
}

.sync-date {
  color: #facc15;
}

.sync-matchup {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
}

.sync-team {
  font-size: 14px;
  font-weight: 600;
  color: #d4d4d4;
}

.sync-team:first-child {
  text-align: right;
}

.sync-team.winner {
  color: #facc15;
}

.sync-score {
  font-size: 20px;
  color: #ffffff;
  font-family: 'Orbitron', sans-serif;
}

.sync-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sync-tag {
  padding: 4px 8px;
  font-size: 12px;
  color: #d4d4d4;
  border: 1px solid #3a3a3a;
  background: #111111;
  border-radius: 2px;
}

/* 核心功能模块 */
.quick-actions {
  background: transparent;
  padding: 10px 0 30px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 24px;
  color: #ffffff;
  font-family: 'Oxanium', sans-serif;
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 16px;
  background-color: #facc15;
}

.artistic-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.art-card {
  position: relative;
  background: #141414;
  border: 1px solid #2a2a2a;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  padding: 24px;
  z-index: 1;
  min-height: 190px;
}

.art-card:hover {
  border-color: #facc15;
  background: #1a1a1a;
}

.art-bg {
  display: none; /* 移除花哨的渐变背景 */
}

.art-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
  flex: 1;
  padding-right: 18px;
}

.art-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: #facc15; /* 统一使用主题金 */
  transition: transform 0.3s ease;
}

.art-card:hover .art-icon {
  transform: scale(1.1);
}

.art-text {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.art-title {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  margin: 0 0 8px 0;
  font-family: 'Oxanium', sans-serif;
  letter-spacing: 1px;
}

.art-desc {
  font-size: 12px;
  color: #888;
  line-height: 1.5;
  margin: 0;
}

.art-arrow {
  position: absolute;
  top: 24px;
  right: 24px;
  font-size: 16px;
  color: #555;
  transition: all 0.3s ease;
}

.art-card:hover .art-arrow {
  color: #facc15;
  transform: translateX(4px);
}

/* 响应式设计 */
@media (max-width: 992px) {
  .artistic-actions {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .header-container {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 20px;
  }

  .overview-cards {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .card {
    padding: 16px 12px;
  }

  .card-title {
    font-size: 11px;
  }

  .card-value {
    font-size: 24px;
  }

  .charts-container {
    grid-template-columns: 1fr;
  }

  .match-scoreboard {
    flex-direction: column;
  }

  .match-vs {
    font-size: 18px;
  }

  .match-detail {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .sync-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .sync-top {
    flex-direction: column;
    align-items: flex-start;
  }

  .sync-matchup {
    grid-template-columns: 1fr;
  }

  .sync-team:first-child {
    text-align: left;
  }
  
  .artistic-actions {
    grid-template-columns: 1fr;
  }
}
</style>
