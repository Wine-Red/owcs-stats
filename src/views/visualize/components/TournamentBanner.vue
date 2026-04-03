<template>
  <div class="tournament-banner vis-col" v-if="season">
    <div class="banner-content">
      <div class="banner-info">
        <h1 class="season-name">{{ season.name }}</h1>
        <div class="meta-data">
          <div class="badges">
            <span v-for="(tag, idx) in displayTags" :key="`${tag}-${idx}`" class="badge" :class="idx === 0 ? 'badge-owcs' : 'badge-tier'">
              {{ tag }}
            </span>
            <span class="badge badge-status" :class="season.status">{{ season.status === 'in_progress' ? 'Ongoing' : 'Completed' }}</span>
          </div>
          <div class="meta-item">
            <el-icon aria-hidden="true"><User /></el-icon>
            <span>{{ teamCount }} teams</span>
          </div>
          <div class="meta-item" v-if="dateRange">
            <el-icon aria-hidden="true"><Calendar /></el-icon>
            <span>{{ dateRange }}</span>
          </div>
        </div>
      </div>
      <div class="banner-logo">
        <img :src="logoUrl" alt="OWCS Logo" width="80" height="80" />
      </div>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue';
import { useStore } from 'vuex';
import { User, Calendar } from '@element-plus/icons-vue';

export default {
  name: 'TournamentBanner',
  components: {
    User,
    Calendar
  },
  props: {
    seasonId: {
      type: [Number, String],
      required: true
    },
    tags: {
      type: Array,
      default: () => []
    },
    dateRange: {
      type: String,
      default: ''
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

    const displayTags = computed(() => {
      const tags = Array.isArray(props.tags) ? props.tags.map(v => String(v).trim()).filter(Boolean) : [];
      return tags.length > 0 ? tags : ['OWCS', 'A-Tier'];
    });

    const logoUrl = computed(() => {
      const baseUrl = import.meta.env.BASE_URL.endsWith('/') 
        ? import.meta.env.BASE_URL 
        : `${import.meta.env.BASE_URL}/`;
      
      const tagsUpper = displayTags.value.map(t => t.toUpperCase());
      
      if (tagsUpper.includes('KR')) {
        return `${baseUrl}icons/areas/KR.png`;
      } else if (tagsUpper.includes('NA')) {
        return `${baseUrl}icons/areas/NA.png`;
      } else if (tagsUpper.includes('CN')) {
        return `${baseUrl}icons/areas/CN.png`;
      } else if (tagsUpper.includes('EMEA')) {
        return `${baseUrl}icons/areas/EMEA.png`;
      }
      
      return `${baseUrl}icons/OWCS_Dark.png`;
    });

    return {
      season,
      teamCount,
      logoUrl,
      displayTags
    };
  }
};
</script>

<style scoped>
.tournament-banner {
  padding: 0 0 32px 0;
  margin-bottom: 0;
  background: transparent;
}

.banner-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
}

.banner-logo {
  width: 100px;
  height: 100px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
}

.banner-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.banner-info {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.season-name {
  margin: 0;
  font-size: 42px;
  font-family: 'Inter', -apple-system, sans-serif;
  font-weight: 800;
  letter-spacing: -1px;
  color: #111;
  line-height: 1.1;
  text-wrap: balance;
}

.meta-data {
  display: flex;
  align-items: center;
  gap: 24px;
  color: #666;
  font-size: 14px;
  font-weight: 500;
  margin-top: 0;
}

.badges {
  display: flex;
  gap: 8px;
}

.badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.badge-owcs {
  background: #111;
  color: #fff;
}

.badge-tier {
  background: #f0f0f0;
  color: #333;
}

.badge-status.in_progress {
  background: #e8f5e9;
  color: #28a745;
}

.badge-status.completed {
  background: #f8f9fa;
  color: #6c757d;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

@media (max-width: 768px) {
  .banner-content {
    flex-direction: column-reverse;
    align-items: flex-start;
    gap: 24px;
  }
  .banner-logo {
    width: 64px;
    height: 64px;
  }
  .season-name {
    font-size: 28px;
  }
  .meta-data {
    flex-wrap: wrap;
    gap: 12px;
  }
}
</style>
