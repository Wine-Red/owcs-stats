<template>
  <div class="dashboard-container">
    <h2 class="page-title">系统仪表盘</h2>

    <!-- 概览卡片 -->
    <div class="overview-cards">
      <div class="card">
        <div class="card-icon">
          <el-icon><Calendar /></el-icon>
        </div>
        <div class="card-content">
          <h3 class="card-title">赛季数量</h3>
          <p class="card-value">{{ stats.seasonsCount }}</p>
        </div>
      </div>
      <div class="card">
        <div class="card-icon">
          <el-icon><Collection /></el-icon>
        </div>
        <div class="card-content">
          <h3 class="card-title">队伍数量</h3>
          <p class="card-value">{{ stats.teamsCount }}</p>
        </div>
      </div>
      <div class="card">
        <div class="card-icon">
          <el-icon><User /></el-icon>
        </div>
        <div class="card-content">
          <h3 class="card-title">选手数量</h3>
          <p class="card-value">{{ stats.playersCount }}</p>
        </div>
      </div>
      <div class="card">
        <div class="card-icon">
          <el-icon><Timer /></el-icon>
        </div>
        <div class="card-content">
          <h3 class="card-title">比赛数量</h3>
          <p class="card-value">{{ stats.matchesCount }}</p>
        </div>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="charts-container">
      <!-- 最近比赛结果 -->
      <div class="chart-card">
        <h3 class="chart-title">最近比赛结果</h3>
        <div class="match-list">
          <div v-for="match in recentMatches" :key="match.id" class="match-item">
            <div class="match-info">
              <span class="match-date">{{ formatDate(match.matchDate) }}</span>
              <span class="match-season">{{ getSeasonName(match.seasonId) }}</span>
            </div>
            <div class="match-teams">
              <div class="team-info" :class="{ winner: match.winnerId === match.team1Id }">
                <span class="team-name">{{ getTeamName(match.team1Id) }}</span>
              </div>
              <div class="match-vs">VS</div>
              <div class="team-info" :class="{ winner: match.winnerId === match.team2Id }">
                <span class="team-name">{{ getTeamName(match.team2Id) }}</span>
              </div>
            </div>
          </div>
          <div v-if="recentMatches.length === 0" class="empty-state">
            <p>暂无比赛数据</p>
          </div>
        </div>
      </div>

      <!-- 数据趋势 -->
      <div class="chart-card">
        <h3 class="chart-title">数据趋势</h3>
        <div class="chart-placeholder">
          <el-icon class="placeholder-icon"><DataLine /></el-icon>
          <p>比赛数据趋势图表</p>
        </div>
      </div>
    </div>

    <!-- 快速操作 -->
    <div class="quick-actions">
      <h3 class="section-title">快速操作</h3>
      <div class="action-buttons">
        <el-button type="primary" size="large" @click="$router.push('/data-entry')">
          <el-icon><Plus /></el-icon>
          录入比赛数据
        </el-button>
        <el-button type="success" size="large" @click="$router.push('/visualize')">
          <el-icon><View /></el-icon>
          查看数据可视化
        </el-button>
        <el-button type="info" size="large" @click="$router.push('/data-manage')">
          <el-icon><Management /></el-icon>
          管理数据
        </el-button>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, onMounted } from 'vue';
import { useStore } from 'vuex';

export default {
  name: 'DashboardView',
  setup() {
    const store = useStore();
    
    // 计算统计数据
    const stats = computed(() => {
      return {
        seasonsCount: store.state.seasons.length,
        teamsCount: store.state.teams.length,
        playersCount: store.state.players.length,
        matchesCount: store.state.matches.length
      };
    });
    
    // 最近比赛
    const recentMatches = computed(() => {
      return store.state.matches.slice(0, 5);
    });
    
    // 格式化日期
    const formatDate = (dateString) => {
      const date = new Date(dateString);
      return date.toLocaleDateString('zh-CN');
    };
    
    // 获取赛季名称
    const getSeasonName = (seasonId) => {
      const season = store.getters.getSeasonById(seasonId);
      return season ? season.name : '未知赛季';
    };
    
    // 获取队伍名称
    const getTeamName = (teamId) => {
      const team = store.getters.getTeamById(teamId);
      return team ? team.name : '未知队伍';
    };
    
    // 组件挂载时加载数据
    onMounted(async () => {
      await store.dispatch('loadBaseData');
      await store.dispatch('loadMatches');
    });
    
    return {
      stats,
      recentMatches,
      formatDate,
      getSeasonName,
      getTeamName
    };
  }
};
</script>

<style scoped>
.dashboard-container {
  padding: 20px 0;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 30px;
  color: #333;
}

/* 概览卡片 */
.overview-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  display: flex;
  align-items: center;
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.card-icon {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #42b983, #35495e);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20px;
  color: white;
  font-size: 24px;
}

.card-content {
  flex: 1;
}

.card-title {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
  font-weight: 500;
}

.card-value {
  font-size: 28px;
  font-weight: 600;
  color: #333;
  margin: 0;
}

/* 图表容器 */
.charts-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 30px;
}

.chart-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.chart-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 20px;
  color: #333;
}

/* 比赛列表 */
.match-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.match-item {
  padding: 16px;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.match-item:hover {
  border-color: #42b983;
  box-shadow: 0 2px 8px rgba(66, 185, 131, 0.1);
}

.match-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 12px;
  color: #666;
}

.match-teams {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.team-info {
  flex: 1;
  text-align: center;
  padding: 8px 16px;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.team-info.winner {
  background-color: #f0f9eb;
  color: #67c23a;
  font-weight: 500;
}

.team-name {
  font-size: 14px;
}

.match-vs {
  margin: 0 16px;
  font-size: 12px;
  color: #999;
}

.empty-state {
  text-align: center;
  padding: 40px 0;
  color: #999;
}

/* 图表占位符 */
.chart-placeholder {
  height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: #f9f9f9;
  border-radius: 8px;
  color: #999;
}

.placeholder-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

/* 快速操作 */
.quick-actions {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 20px;
  color: #333;
}

.action-buttons {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .charts-container {
    grid-template-columns: 1fr;
  }
  
  .overview-cards {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .action-buttons {
    flex-direction: column;
  }
  
  .action-buttons .el-button {
    width: 100%;
  }
}
</style>