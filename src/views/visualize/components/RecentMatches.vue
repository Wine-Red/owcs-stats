<template>
  <div class="recent-matches-container" v-if="processedMatches.length > 0">
    <h3 class="section-title">Upcoming / Recent Matches</h3>
    <div class="recent-matches vis-col">
      <div class="matches-scroll-container">
      <div 
        class="match-card" 
        v-for="match in processedMatches" 
        :key="match.id"
      >
        <div class="match-date">{{ match.formattedDate }}</div>
        <div class="match-teams">
          <div class="team-row" :class="{ 'is-winner': match.score1 > match.score2 }">
            <div class="team-info">
              <img v-if="match.team1.logo" :src="match.team1.logo" class="team-logo" />
              <div v-else class="team-logo-placeholder">{{ match.team1.name.charAt(0) }}</div>
              <span class="team-name">{{ match.team1.name }}</span>
            </div>
            <span class="team-score">{{ match.score1 }}</span>
          </div>
          <div class="team-row" :class="{ 'is-winner': match.score2 > match.score1 }">
            <div class="team-info">
              <img v-if="match.team2.logo" :src="match.team2.logo" class="team-logo" />
              <div v-else class="team-logo-placeholder">{{ match.team2.name.charAt(0) }}</div>
              <span class="team-name">{{ match.team2.name }}</span>
            </div>
            <span class="team-score">{{ match.score2 }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  </div>
</template>

<script>
import { computed } from 'vue';
import { useStore } from 'vuex';

export default {
  name: 'RecentMatches',
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

    const processedMatches = computed(() => {
      // Sort by date descending
      const sorted = [...props.matches].sort((a, b) => new Date(b.matchDate) - new Date(a.matchDate)).slice(0, 5);
      
      return sorted.map(match => {
        const t1 = store.getters.getTeamById(match.team1Id) || { name: 'Unknown' };
        const t2 = store.getters.getTeamById(match.team2Id) || { name: 'Unknown' };
        
        // Calculate score from mapGames
        const matchMaps = props.mapGames.filter(mg => mg.matchId === match.id);
        let score1 = 0;
        let score2 = 0;
        matchMaps.forEach(mg => {
          if (mg.winnerId === match.team1Id) score1++;
          else if (mg.winnerId === match.team2Id) score2++;
        });

        // Format date natively
        const d = new Date(match.matchDate);
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const formattedDate = `${monthNames[d.getMonth()]} ${d.getDate()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

        return {
          ...match,
          team1: t1,
          team2: t2,
          score1,
          score2,
          formattedDate
        };
      });
    });

    return {
      processedMatches
    };
  }
};
</script>

<style scoped>
.recent-matches-container {
  margin-bottom: 24px;
}

.section-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 20px;
  color: #1a1a1a;
  margin: 0 0 16px 0;
  font-weight: 700;
}

.recent-matches {
  /* removed background/padding here if it was a global card, but currently it's just a container */
}

.matches-scroll-container {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
  scrollbar-width: thin;
}

.matches-scroll-container::-webkit-scrollbar {
  height: 6px;
}

.matches-scroll-container::-webkit-scrollbar-thumb {
  background-color: #ccc;
  border-radius: 3px;
}

.match-card {
  background: #ffffff;
  border-radius: 8px;
  padding: 16px;
  min-width: 220px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

.match-date {
  font-size: 12px;
  color: #888;
  font-weight: 600;
}

.match-teams {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.team-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.team-row.is-winner {
  opacity: 1;
  font-weight: 700;
}

.team-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.team-logo {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.team-logo-placeholder {
  width: 24px;
  height: 24px;
  background: #f0f2f5;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  color: #666;
}

.team-name {
  font-size: 14px;
  color: #333;
}

.team-score {
  font-size: 16px;
  color: #1a1a1a;
}
</style>
