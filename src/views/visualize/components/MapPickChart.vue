<template>
  <div class="vis-card">
    <SlantedTitle title="地图选取情况">
    </SlantedTitle>
    <div class="chart-wrapper map-chart-wrapper" style="position: relative; height: 400px; padding: 0;">
      <div ref="mapPickChart" class="fog-chart" style="width: 100%; height: 100%"></div>
      <div class="map-type-icons-overlay">
        <!-- 使用 Flexbox 自动均匀分布 -->
        <div class="map-type-icon-list">
          <div 
            v-for="type in mapPickTypes" 
            :key="type"
            class="map-type-icon-item"
          >
            <div class="icon-wrapper">
              <img :src="getMapTypeIconUrl(type)" class="map-type-icon" :alt="type" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import * as echarts from 'echarts';
import apiService from '@/services/api';
import SlantedTitle from './SlantedTitle.vue';
import { escapeHtml } from '@/utils/security';

// 地图名称到文件名的映射
const mapNameToFileName = {
  // 控制地图
  '南极半岛': 'Antarctic_Peninsula',
  '釜山': 'Busan',
  '伊利奥斯': 'Ilios',
  '漓江塔': 'Lijiang-tower',
  '尼泊尔': 'Nepal',
  '绿洲城': 'Oasis',
  '萨摩亚': 'Samoa',
  // 护送地图
  '香巴里寺院': '1067px-Shambali',
  '多拉多': 'Dorado',
  '哈瓦那': 'Havana',
  '渣客镇': 'Junkertown',
  '皇家赛道': 'Monte_Carlo',
  '里阿尔托': 'Rialto',
  '66号公路': 'Route-66',
  '监测站：直布罗陀': 'Watchpoint-gibraltar',
  // 闪点地图
  '阿特利斯': 'Aatlis',
  '新渣客城': 'New_Junk_City',
  '苏拉瓦萨': 'Suravasa',
  // 混合地图
  '暴雪世界': 'Blizzard-world',
  '艾兴瓦尔德': 'Eichenwalde',
  '好莱坞': 'Hollywood',
  '国王大道': 'Kings-row',
  '中城': 'Midtown',
  '努巴尼': 'Numbani',
  '帕拉伊苏': 'Paraiso',
  // 推进地图
  '斗兽场': 'Colosseo',
  '埃斯佩兰萨': 'Esperanca',
  '新皇后街': 'NewQueenStreet',
  '鲁纳塞彼': 'Runasapi'
};

export default {
  name: 'MapPickChart',
  components: {
    SlantedTitle
  },
  props: {
    seasonId: {
      type: [String, Number],
      default: ''
    }
  },
  setup(props) {
    const mapPickChart = ref(null);
    const mapPickTypes = ref([]);
    let mapPickChartInstance = null;

    // 辅助函数：获取地图类型图标URL
    const getMapTypeIconUrl = (mapType) => {
      let logoFileName = 'control.png';
      switch(mapType) {
        case '闪点作战': logoFileName = 'flashpoint.png'; break;
        case '机动推进': logoFileName = 'push.png'; break;
        case '攻击/护送': logoFileName = 'hybrid.png'; break;
        case '运载目标': logoFileName = 'escort.png'; break;
        case '占领要点': logoFileName = 'control.png'; break;
      }
      return `${import.meta.env.BASE_URL}maps/logo/${logoFileName}`;
    };

    // 更新地图选取情况图表
    const updateMapPickChart = async () => {
      if (!mapPickChart.value) return;

      if (!props.seasonId) return;

      if (!mapPickChartInstance) {
        mapPickChartInstance = echarts.init(mapPickChart.value);
      }
      
      try {
        // 显示加载动画
        mapPickChartInstance.showLoading({
          color: '#FF9E0F',
          textColor: '#FF9E0F',
          maskColor: 'rgba(255, 255, 255, 0.8)'
        });
        
        // 从API获取地图选取数据
        const params = {
          seasonId: props.seasonId || null
        };
        const response = await apiService.getMapPickStatsData(params);
        
        // 处理数据
        const mapData = response.data || [];
        
        // 检查是否有数据
        if (mapData.length === 0) {
           const option = {
             graphic: {
                elements: [
                  {
                    type: 'text',
                    left: 'center',
                    top: 'center',
                    style: {
                      text: '暂无地图选取数据',
                      fontSize: 16,
                      fontWeight: 'bold',
                      fill: '#909399'
                    }
                  }
                ]
             }
           };
           mapPickChartInstance.setOption(option, true);
           return;
        }

        // 准备图表数据
        const mapTypes = mapData.map(item => item.mapType);
        mapPickTypes.value = mapTypes; // Update reactive ref
        const series = [];
        const legendData = [];
        
        // 辅助函数：获取地图图片URL
        const getMapImageUrl = (mapName, mapType) => {
          let mapTypeFolder = '';
          
          // 根据地图类型确定文件夹
          switch(mapType) {
            case '占领要点':
              mapTypeFolder = 'control';
              break;
            case '运载目标':
              mapTypeFolder = 'escort';
              break;
            case '攻击/护送':
              mapTypeFolder = 'hybrid';
              break;
            case '机动推进':
              mapTypeFolder = 'push';
              break;
            case '闪点作战':
              mapTypeFolder = 'flashpoint';
              break;
            default:
              mapTypeFolder = 'control';
          }
          
          // 根据地图名称构建图片文件名
          let imgName = mapName;
          
          if (mapNameToFileName[imgName]) {
            imgName = mapNameToFileName[imgName];
          } else {
            // 对于未映射的地图，使用默认处理
            imgName = imgName.replace(/\s+/g, '_');
          }
          
          return `${import.meta.env.BASE_URL}maps/${mapTypeFolder}/${imgName}.jpg`;
        };
        
        // 为每个地图类型创建一个堆叠组
        mapData.forEach((typeData, index) => {
          typeData.maps.forEach(map => {
            // 检查地图是否已经在图例中
            if (!legendData.includes(map.mapName)) {
              legendData.push(map.mapName);
            }
            
            // 创建或更新该地图的系列数据
            let mapSeries = series.find(s => s.name === map.mapName);
            if (!mapSeries) {
              // 在创建series时就计算好图片URL
              const imgUrl = getMapImageUrl(map.mapName, typeData.mapType);
              
              mapSeries = {
                name: map.mapName,
                type: 'bar',
                stack: 'total',
                emphasis: {
                  focus: 'series'
                },
                data: new Array(mapData.length).fill(0),
                itemStyle: {
                  // 直接使用URL字符串作为pattern
                  color: {
                    type: 'pattern',
                    image: imgUrl,
                    repeat: 'repeat-x',
                    imageHeight: '100%'
                  },
                  opacity: 0.9
                }
              };
              series.push(mapSeries);
            }
            
            // 设置该地图在对应类型中的选取率
            // 修改：归一化数据以填满条形图，同时在 extra 中存储真实数据
            // 计算该类型下所有地图的 pickRate 总和
            const totalPickRate = typeData.maps.reduce((sum, m) => sum + parseFloat(m.pickRate), 0);
            
            mapSeries.data[index] = {
              value: totalPickRate > 0 ? (parseFloat(map.pickRate) / totalPickRate) * 100 : 0,
              realValue: parseFloat(map.pickRate),
              mapName: map.mapName
            };
          });
        });

        // 预处理：为每张地图图片添加CSS滤镜效果
        const processMapImage = (imgUrl) => {
          return new Promise((resolve) => {
            const img = new Image();
            // 设置超时，防止无限等待
            const timeout = setTimeout(() => {
                resolve(imgUrl); // 超时后直接返回原URL
            }, 3000);

            img.crossOrigin = 'Anonymous';
            img.onload = () => {
              clearTimeout(timeout);
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              canvas.width = img.width;
              canvas.height = img.height;
              
              // 应用滤镜: 模糊2px, 亮度1.1, 饱和度0.6, 对比度0.8
              ctx.filter = 'blur(1px) brightness(0.9) saturate(1.1) contrast(0.95)';
              ctx.drawImage(img, 0, 0);
              
              resolve(canvas.toDataURL());
            };
            img.onerror = () => {
              clearTimeout(timeout);
              // 如果加载失败，回退到原始URL
              resolve(imgUrl);
            };
            img.src = imgUrl;
          });
        };

        // 异步加载并处理所有图片
        const processedSeries = await Promise.all(series.map(async (s) => {
          const originalImgUrl = s.itemStyle.color.image;
          const processedUrl = await processMapImage(originalImgUrl);
          
          return {
            ...s,
            itemStyle: {
              ...s.itemStyle,
              color: {
                ...s.itemStyle.color,
                image: processedUrl
              }
            }
          };
        }));
        
        // 显示数据
        const option = {
          tooltip: {
            trigger: 'axis',
            axisPointer: {
              type: 'shadow'
            },
            formatter: function(params) {
              let result = `<div style="font-weight: 800; margin-bottom: 8px; border-bottom: 1px solid #EBEEF5; padding-bottom: 4px; color: #1A1A1A;">${escapeHtml(params[0].axisValue)}</div>`;
              
              params.forEach(param => {
                // 检查 data 对象中是否有 realValue
                const val = param.data && param.data.realValue !== undefined ? param.data.realValue : param.value;
                if (val > 0) {
                  result += `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 12px;">
                      <span style="display: flex; align-items: center; color: #606266;">
                        <span style="display:inline-block;margin-right:6px;border-radius:2px;width:12px;height:12px;background-color:#FF9E0F;"></span>
                        ${escapeHtml(param.seriesName)}
                      </span>
                      <span style="font-weight: bold; color: #1A1A1A;">${val}%</span>
                    </div>`;
                }
              });
              
              return result;
            },
            backgroundColor: '#FFFFFF',
            borderColor: '#EBEEF5',
            borderWidth: 1,
            textStyle: {
              color: '#303133'
            },
            padding: [12, 16],
            extraCssText: 'box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12); border-radius: 8px;'
          },
          grid: {
            left: 0,
            right: 0,
            bottom: 0,
            top: 0,
            containLabel: false
          },
          xAxis: {
            type: 'value',
            max: 100,
            show: false,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
            splitLine: { show: false }
          },
          yAxis: {
            type: 'category',
            data: mapTypes,
            show: false,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
            splitLine: { show: false }
          },
          // 添加地图类型logo图片
          graphic: [
            {
              type: 'rect',
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              style: {
                fill: 'rgba(0, 0, 0, 0.1)'
              },
              z: 1, // 将 z 值降低，避免遮挡图表（series 默认为 2）
              silent: true
            }
          ],
          series: processedSeries.map(item => ({
            ...item,
            barWidth: '100%', // 使条形图占满整个y轴刻度
            barCategoryGap: '0%', // 消除类目间隙
            barGap: '0%', // 消除系列间隙
            itemStyle: {
              ...item.itemStyle,
              borderRadius: 0,
              borderColor: '#FFFFFF',
              borderWidth: 0 // 移除边框以消除间隙
            }
          })),
          animationEasing: 'cubicOut',
          animationDuration: 1000,
          animationDelayUpdate: function(idx) {
            return idx * 5;
          },
          // 响应式配置
          media: [
            {
              query: { maxWidth: 768 },
              option: {
                grid: {
                  left: 0,
                  right: 0,
                  bottom: 0,
                  top: 0
                }
              }
            }
          ]
        };
        
        mapPickChartInstance.setOption(option, true);
      } catch (error) {
        console.error('获取地图选取数据失败:', error);
        
        // 显示默认数据
        const option = {
          graphic: {
            elements: [
              {
                type: 'text',
                left: 'center',
                top: 'center',
                style: {
                  text: '暂无地图选取数据',
                  fontSize: 16,
                  fontWeight: 'bold',
                  fill: '#909399'
                }
              }
            ]
          }
        };
        
        mapPickChartInstance.setOption(option, true);
      } finally {
        mapPickChartInstance.hideLoading();
      }
    };

    const handleResize = () => {
      mapPickChartInstance?.resize();
    };

    watch(() => props.seasonId, () => {
      updateMapPickChart();
    });

    onMounted(async () => {
      await nextTick();
      mapPickChartInstance = echarts.init(mapPickChart.value);
      updateMapPickChart();
      window.addEventListener('resize', handleResize);
    });

    onUnmounted(() => {
      window.removeEventListener('resize', handleResize);
      mapPickChartInstance?.dispose();
    });

    return {
      mapPickChart,
      mapPickTypes,
      getMapTypeIconUrl
    };
  }
};
</script>

<style scoped>
.map-type-icons-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* 让鼠标事件穿透到下层图表 */
  z-index: 10;
  /* 确保 overlay 覆盖在 chart 内容区域上 */
  padding: 0;
  box-sizing: border-box;
}

.map-type-icon-list {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column-reverse; /* ECharts 默认从下到上，所以我们反转 flex 顺序 */
  justify-content: space-around; /* 均匀分布，两端留空 (boundaryGap: true) */
  align-items: center;
}

.map-type-icon-item {
  display: flex;
  justify-content: center;
  align-items: center;
}

.icon-wrapper {
  background: rgba(255, 255, 255, 0.4);
  border-radius: 50%;
  padding: 8px;
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  justify-content: center;
  align-items: center;
  transition: transform 0.3s ease;
}

.map-type-icon {
  width: 40px;
  height: 40px;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
}

/* 移动端适配 */
@media (max-width: 768px) {
  .chart-wrapper {
    height: 350px;
  }
  
  .map-type-icon {
    width: 30px;
    height: 30px;
  }
  
  .icon-wrapper {
    padding: 6px;
  }
}

/* 移除 :deep，直接作用于根元素 */
.vis-card {
  padding: 0 !important;
  border-bottom-left-radius: 16px;
  border-bottom-right-radius: 16px;
  overflow: hidden;
}
</style>