<template>
  <div class="tournament-banner vis-col" v-if="season">
    <div class="banner-content">
      <div class="banner-logo">
        <img :src="logoUrl" alt="OWCS Logo" />
      </div>
      <div class="banner-info">
        <div class="badges">
          <span class="badge badge-owcs">OWCS</span>
          <span class="badge badge-tier">A-Tier</span>
          <span class="badge badge-status" :class="season.status">{{ season.status === 'in_progress' ? 'Ongoing' : 'Completed' }}</span>
        </div>
        <h1 class="season-name">{{ season.name }}</h1>
        <div class="meta-data">
          <div class="meta-item">
            <el-icon><User /></el-icon>
            <span>{{ teamCount }} teams</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue';
import { useStore } from 'vuex';
import { User } from '@element-plus/icons-vue';

export default {
  name: 'TournamentBanner',
  components: {
    User
  },
  props: {
    seasonId: {
      type: [Number, String],
      required: true
    }
  },
  setup(props) {
    const store = useStore();

    const season = computed(() => {
      return store.getters.getSeasonById(props.seasonId);
    });

    const teamCount = computed(() => {
      if (!props.seasonId) return 0;
      const teams = store.getters.getTeamsBySeasonId(props.seasonId);
      return teams ? teams.length : 0;
    });

    const logoUrl = computed(() => {
      const baseUrl = import.meta.env.BASE_URL.endsWith('/') 
        ? import.meta.env.BASE_URL 
        : `${import.meta.env.BASE_URL}/`;
      return `${baseUrl}icons/OWCS.png`;
    });

    return {
      season,
      teamCount,
      logoUrl
    };
  }
};
</script>

<style scoped>
.tournament-banner {
  background: #ffffff;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.banner-content {
  display: flex;
  align-items: center;
  gap: 24px;
}

.banner-logo {
  width: 120px;
  height: 120px;
  background: #111;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.banner-logo img {
  width: 80%;
  height: 80%;
  object-fit: contain;
}

.banner-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.badges {
  display: flex;
  gap: 8px;
}

.badge {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.badge-owcs {
  background: #3a75c4;
  color: #fff;
}

.badge-tier {
  background: #e6a822;
  color: #fff;
}

.badge-status.in_progress {
  background: #28a745;
  color: #fff;
}

.badge-status.completed {
  background: #6c757d;
  color: #fff;
}

.season-name {
  margin: 0;
  font-size: 28px;
  font-family: 'Orbitron', sans-serif;
  font-weight: 800;
  color: #1a1a1a;
  text-transform: uppercase;
}

.meta-data {
  display: flex;
  gap: 16px;
  color: #666;
  font-size: 14px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

@media (max-width: 768px) {
  .banner-content {
    flex-direction: column;
    align-items: flex-start;
  }
  .banner-logo {
    width: 80px;
    height: 80px;
  }
  .season-name {
    font-size: 20px;
  }
}
</style>
