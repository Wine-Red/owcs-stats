<template>
  <div class="map-pool-container">
    <h3 class="section-title">Map Pool</h3>
    <div class="map-groups">
      <div 
        v-for="group in mapGroups" 
        :key="group.type" 
        class="map-group"
        v-show="group.maps.length > 0"
      >
        <div class="group-header" :class="group.cssClass">
          {{ group.label }}
        </div>
        <div class="map-cards">
          <div 
            v-for="map in group.maps" 
            :key="map.id" 
            class="map-card"
            :style="{ backgroundImage: `url(${getMapImage(map)})` }"
          >
            <div class="map-name">{{ map.name }}</div>
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
  name: 'MapPool',
  props: {
    seasonId: {
      type: [Number, String],
      required: true
    }
  },
  setup() {
    const store = useStore();

    // Since we don't have a season-map relation in DB, 
    // we assume the map pool is all maps, or we could filter by mapGames in the season.
    // For now, let's display all maps in the system.
    const maps = computed(() => store.state.maps || []);

    const mapGroups = computed(() => {
      const groups = [
        { type: '占领要点', label: 'CONTROL', cssClass: 'bg-control', maps: [] },
        { type: '运载目标', label: 'ESCORT', cssClass: 'bg-escort', maps: [] },
        { type: '攻击/护送', label: 'HYBRID', cssClass: 'bg-hybrid', maps: [] },
        { type: '机动推进', label: 'PUSH', cssClass: 'bg-push', maps: [] },
        { type: '闪点作战', label: 'FLASHPOINT', cssClass: 'bg-flashpoint', maps: [] }
      ];

      maps.value.forEach(map => {
        const group = groups.find(g => g.type === map.type);
        if (group) {
          group.maps.push(map);
        }
      });

      return groups;
    });

    const getMapImage = (map) => {
      const baseUrl = import.meta.env.BASE_URL.endsWith('/') 
        ? import.meta.env.BASE_URL 
        : `${import.meta.env.BASE_URL}/`;
      
      const typeFolderMap = {
        '占领要点': 'control',
        '运载目标': 'escort',
        '攻击/护送': 'hybrid',
        '机动推进': 'push',
        '闪点作战': 'flashpoint'
      };
      
      const folder = typeFolderMap[map.type] || 'control';
      
      // Known file mapping to handle inconsistencies in naming and Chinese names
      const fileMap = {
        '南极半岛': 'Antarctic_Peninsula.jpg',
        '釜山': 'Busan.jpg',
        '伊利奥斯': 'Ilios.jpg',
        '漓江塔': 'Lijiang-tower.jpg',
        '尼泊尔': 'Nepal.jpg',
        '绿洲城': 'Oasis.jpg',
        '萨摩亚': 'Samoa.jpg',
        '香巴里寺院': '1067px-Shambali.jpg',
        '多拉多': 'Dorado.jpg',
        '哈瓦那': 'Havana.jpg',
        '渣客镇': 'Junkertown.jpg',
        '皇家赛道': 'Monte_Carlo.jpg', 
        '里阿尔托': 'Rialto.jpg',
        '66号公路': 'Route-66.jpg',
        '监测站：直布罗陀': 'Watchpoint-gibraltar.jpg',
        '暴雪世界': 'Blizzard-world.jpg',
        '艾兴瓦尔德': 'Eichenwalde.jpg',
        '好莱坞': 'Hollywood.jpg',
        '国王大道': 'Kings-row.jpg',
        '中城': 'Midtown.jpg',
        '努巴尼': 'Numbani.jpg',
        '帕拉伊索': 'Paraiso.jpg',
        '斗兽场': 'Colosseo.jpg',
        '埃斯佩兰萨': 'Esperanca.jpg',
        '新皇后街': 'NewQueenStreet.jpg',
        '卢纳萨皮': 'Runasapi.jpg',
        '新渣客城': 'New_Junk_City.jpg',
        '苏拉瓦萨': 'Suravasa.jpg',
        
        // English fallbacks just in case
        'Antarctic Peninsula': 'Antarctic_Peninsula.jpg',
        'Busan': 'Busan.jpg',
        'Ilios': 'Ilios.jpg',
        'Lijiang Tower': 'Lijiang-tower.jpg',
        'Nepal': 'Nepal.jpg',
        'Oasis': 'Oasis.jpg',
        'Samoa': 'Samoa.jpg',
        'Shambali Monastery': '1067px-Shambali.jpg',
        'Dorado': 'Dorado.jpg',
        'Havana': 'Havana.jpg',
        'Junkertown': 'Junkertown.jpg',
        'Circuit royal': 'Monte_Carlo.jpg',
        'Rialto': 'Rialto.jpg',
        'Route 66': 'Route-66.jpg',
        'Watchpoint: Gibraltar': 'Watchpoint-gibraltar.jpg',
        'Blizzard World': 'Blizzard-world.jpg',
        'Eichenwalde': 'Eichenwalde.jpg',
        'Hollywood': 'Hollywood.jpg',
        'King\'s Row': 'Kings-row.jpg',
        'Midtown': 'Midtown.jpg',
        'Numbani': 'Numbani.jpg',
        'Paraíso': 'Paraiso.jpg',
        'Colosseo': 'Colosseo.jpg',
        'Esperança': 'Esperanca.jpg',
        'New Queen Street': 'NewQueenStreet.jpg',
        'Runasapi': 'Runasapi.jpg',
        'New Junk City': 'New_Junk_City.jpg',
        'Suravasa': 'Suravasa.jpg'
      };

      // Fallback: replace spaces with hyphens
      let filename = fileMap[map.name];
      if (!filename) {
        filename = `${map.name.replace(/ /g, '-')}.jpg`;
      }

      return `${baseUrl}maps/${folder}/${filename}`;
    };

    return {
      mapGroups,
      getMapImage
    };
  }
};
</script>

<style scoped>
.map-pool-container {
  margin-bottom: 24px;
}

.section-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 20px;
  color: #1a1a1a;
  margin: 0 0 16px 0;
  font-weight: 700;
}

.map-groups {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.map-group {
  flex: 1;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.group-header {
  text-align: center;
  font-family: 'Orbitron', sans-serif;
  font-weight: 800;
  font-size: 14px;
  padding: 8px 0;
  color: #fff;
  letter-spacing: 1px;
}

.bg-control { background-color: #00e6e6; color: #000; }
.bg-escort { background-color: #ff4d4d; }
.bg-hybrid { background-color: #9933ff; }
.bg-push { background-color: #ff1a8c; }
.bg-flashpoint { background-color: #e6e600; color: #000; }

.map-cards {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
}

.map-card {
  height: 60px;
  border-radius: 4px;
  background-size: cover;
  background-position: center;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
}

.map-card::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60%;
  background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%);
  z-index: 1;
}

.map-name {
  position: relative;
  z-index: 2;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 8px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}
</style>
