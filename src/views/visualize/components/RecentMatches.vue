<template>
  <div class="recent-matches-container">
    <div v-for="group in displayedMatches" :key="group.date" class="vis-grid overview-section" style="margin-bottom: 24px;">
      <div class="vis-col span-12">
        <div class="liquipedia-matches-container">
          <div class="match-date-header">{{ group.formattedDate }}</div>
          
          <div class="matches-list">
            <div v-for="match in group.matches" :key="match.id" class="match-row">
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
  </div>
</template>

<script>
import { computed, ref } from 'vue';
import { useStore } from 'vuex';
import { ArrowUp, ArrowDown } from '@element-plus/icons-vue';

export default {
  name: 'RecentMatches',
  components: {
    ArrowUp,
    ArrowDown
  },
  props: {
    matches: {
      type: Array,
      default: () => []
    }
  },
  setup(props) {
    const store = useStore();
    const showAllMatches = ref(false);

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

    return {
      displayedMatches,
      showAllMatches,
      hasMoreMatches,
      toggleShowAll,
      getTeamName,
      getTeamLogo
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
  display: flex;
  flex-direction: column;
  background: #f8f9fa;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  border: 1px solid #e4e7ed;
  transition: box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}

.match-row:hover {
  background: #f0f2f5;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #dcdfe6;
}

.match-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
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
  .team-logo-container {
    width: 24px;
    height: 24px;
  }
}
</style>
