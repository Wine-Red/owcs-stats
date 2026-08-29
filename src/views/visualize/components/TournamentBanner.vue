<template>
  <div class="tournament-banner vis-col" v-if="season">
    <!-- 纯装饰：六边形水印 + 斜切翼形条纹（低透明度，不遮挡信息） -->
    <div class="banner-decor banner-decor--hex" aria-hidden="true"></div>
    <div class="banner-decor banner-decor--stripes" aria-hidden="true"></div>
    <div class="banner-content">
      <div class="banner-logo">
        <img v-if="logoUrl" :src="logoUrl" :alt="`${season.name} 图标`" width="104" height="104" />
        <span v-else aria-hidden="true">OWCS</span>
      </div>
      <div class="banner-info">
        <div class="badges">
          <span v-for="(tag, idx) in displayTags" :key="`${tag}-${idx}`" class="badge" :class="idx === 0 ? 'badge-owcs' : 'badge-tier'">
            {{ tag }}
          </span>
          <span class="badge badge-status" :class="season.status">{{ season.status === 'in_progress' ? 'Ongoing' : 'Completed' }}</span>
        </div>
        <h1 class="season-name">{{ season.name }}</h1>
        <div class="meta-data">
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
    </div>
  </div>
</template>

<script>
import { computed } from 'vue';
import { useStore } from 'vuex';
import { User, Calendar } from '@element-plus/icons-vue';
import { resolveMediaUrl } from '@/utils/media';

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
      return resolveMediaUrl(season.value?.icon);
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
/* M2 · 浅色赛事横幅：全宽四边贴边（无圆角/无斜切切角）、
   极浅暖橙渐变底 + 低透明度深色斜线纹理 + 右下角克制的橙色微光，
   底部 2px 渐变能量线作为与内容区的分界 */
.tournament-banner {
  position: relative;
  overflow: hidden; /* 取代原 clip-path：裁切溢出的装饰元素，同时保持直角贴边 */
  margin-bottom: 0; /* 与下方 tab 栏无缝衔接，间距由父级控制 */
  padding: 30px 32px 28px;
  color: var(--vis-text-primary, #303133);
  background-color: #fff4e6;
  background-image:
    /* 右下角橙色微光（8%，克制） */
    radial-gradient(56% 130% at 88% 112%, rgba(255, 106, 0, 0.08), rgba(255, 106, 0, 0) 62%),
    /* 深色斜线纹理（0.03 ≤ 0.04） */
    repeating-linear-gradient(115deg, rgba(17, 17, 17, 0.03) 0, rgba(17, 17, 17, 0.03) 1px, transparent 1px, transparent 14px),
    /* 极浅暖橙渐变底 */
    linear-gradient(135deg, #ffffff 0%, #fffaf3 55%, #fff4e6 100%);
}

/* 底部 2px 渐变能量线（与内容区分界，配合 tab 栏无缝衔接） */
.tournament-banner::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: var(--vis-primary-gradient, linear-gradient(90deg, #ff6a00 0%, #ff9e0f 100%));
  pointer-events: none;
}

.banner-decor {
  position: absolute;
  pointer-events: none;
  z-index: 0;
}

/* OWCS 六边形徽章水印（浅橙，opacity ≤ 0.06，浅底专用） */
.banner-decor--hex {
  width: 250px;
  height: 272px;
  right: -48px;
  top: -78px;
  background: rgba(255, 106, 0, 0.05);
  clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
}

/* 斜切翼形条纹（浅橙低透明度：0.1 × 0.5 ≈ 0.05 ≤ 0.06） */
.banner-decor--stripes {
  top: -32%;
  bottom: -32%;
  right: 132px;
  width: 148px;
  background: repeating-linear-gradient(90deg, rgba(255, 158, 15, 0.1) 0, rgba(255, 158, 15, 0.1) 5px, transparent 5px, transparent 16px);
  transform: skewX(-14deg);
  opacity: 0.5;
}

.banner-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  gap: 36px;
}

.banner-logo {
  width: 104px;
  height: 104px;
  background: #ffffff;
  border: 1px solid rgba(17, 17, 17, 0.06);
  border-radius: 20px;
  box-shadow: 0 8px 20px rgba(17, 17, 17, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 18px;
  box-sizing: border-box;
}

.banner-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.banner-logo span {
  color: var(--vis-text-secondary, #606266);
  font-family: var(--vis-font-heading);
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.banner-info {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 6px;
  min-width: 0;
}

.season-name {
  margin: 0;
  font-size: 38px;
  font-family: var(--vis-font-heading);
  font-style: italic;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--vis-text-strong, #111111);
  line-height: 1.15;
  text-wrap: balance;
}

.meta-data {
  display: flex;
  flex-wrap: wrap;
  gap: 28px;
  color: var(--vis-text-secondary, #606266);
  font-size: 15px;
  font-weight: 500;
  margin-top: 6px;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.badge-owcs {
  background: var(--vis-primary-gradient, linear-gradient(90deg, #ff6a00 0%, #ff9e0f 100%));
  color: #ffffff;
  font-weight: 800;
}

.badge-tier {
  background: var(--vis-bg-muted, #f4f4f5);
  color: var(--vis-text-secondary, #606266);
}

.badge-status.in_progress {
  background: rgba(40, 167, 69, 0.12);
  color: #1e7e34;
  box-shadow: inset 0 0 0 1px rgba(40, 167, 69, 0.2);
}

.badge-status.completed {
  background: var(--vis-bg-muted, #f4f4f5);
  color: var(--vis-text-tertiary, #909399);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.meta-item .el-icon {
  color: var(--vis-text-tertiary, #909399);
}

@media (max-width: 768px) {
  .tournament-banner {
    padding: 18px 16px 16px;
    margin-bottom: 0;
  }
  .banner-content {
    flex-direction: row;
    align-items: center;
    gap: 16px;
  }
  .banner-logo {
    width: 64px;
    height: 64px;
    padding: 10px;
    border-radius: 14px;
  }
  .banner-info {
    gap: 8px;
    padding-top: 0;
  }
  .season-name {
    font-size: 26px;
  }
  .meta-data {
    gap: 12px;
    margin-top: 0;
    flex-wrap: wrap;
    font-size: 13px;
  }
  .badges {
    flex-wrap: wrap;
  }
  .badge {
    padding: 2px 6px;
    font-size: 10px;
  }
  .banner-decor--hex {
    width: 150px;
    height: 164px;
    right: -34px;
    top: -42px;
  }
  .banner-decor--stripes {
    right: 76px;
    width: 96px;
    opacity: 0.4;
  }
}

@media (max-width: 420px) {
  .tournament-banner {
    padding: 16px 12px 14px;
  }
  .season-name {
    font-size: 24px;
  }
  .badges {
    gap: 6px;
  }
}
</style>
