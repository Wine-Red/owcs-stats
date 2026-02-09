<template>
  <el-card class="data-card">
    <template #header>
      <div class="card-header">
        <span>英雄禁用情况统计</span>
      </div>
    </template>
    <div ref="heroBanChart" class="chart-container"></div>
  </el-card>
</template>

<script>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import * as echarts from 'echarts';
import apiService from '@/services/api';

export default {
  name: 'HeroBanChart',
  props: {
    seasonId: {
      type: [String, Number],
      default: ''
    }
  },
  setup(props) {
    const heroBanChart = ref(null);
    let heroBanChartInstance = null;

    // 更新英雄禁用情况图表
    const updateHeroBanChart = async () => {
      // 只有当DOM元素存在且echarts实例已初始化（或需要初始化）时才执行
      if (!heroBanChart.value) return;
      
      if (!heroBanChartInstance) {
          heroBanChartInstance = echarts.init(heroBanChart.value);
      }
      
      try {
        // 显示加载动画
        heroBanChartInstance.showLoading();
        
        // 从API获取英雄禁用数据
        const params = {
          seasonId: props.seasonId || null
        };
        const response = await apiService.getHeroBanStatsData(params);
        
        // 处理数据
        const heroDataRaw = response.data || [];
        const heroDataSorted = [...heroDataRaw].sort((a, b) => (b.banCount || 0) - (a.banCount || 0));
        const heroNames = heroDataSorted.map(item => item.heroName || '未知英雄');
        const banCounts = heroDataSorted.map(item => item.banCount || 0);
        
        // 显示数据
        const option = {
          graphic: [], // 显式设置为空数组以清除图形元素
          tooltip: {
            trigger: 'axis',
            axisPointer: {
              type: 'shadow'
            },
            formatter: function(params) {
              const idx = params[0].dataIndex;
              const d = heroDataSorted[idx];
              return `${d.heroName}<br/>禁用次数: ${d.banCount}<br/>禁用率: ${d.banRate}%`;
            },
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            borderColor: '#ccc',
            textStyle: {
              color: '#fff'
            }
          },
          grid: {
            left: '2%',
            right: '10%',
            bottom: '10%',
            containLabel: true
          },
          xAxis: {
            type: 'value',
            name: '禁用次数',
            nameLocation: 'middle',
            nameGap: 30,
            min: 0,
            minInterval: 1,
            axisLabel: {
              formatter: v => Math.floor(v)
            },
            splitLine: {
              lineStyle: {
                type: 'dashed'
              }
            }
          },
          yAxis: {
            type: 'category',
            inverse: true,
            data: heroNames,
            axisLabel: {
              interval: 0,
              rotate: 0,
              fontSize: 12,
              margin: 10
            },
            axisTick: {
              alignWithLabel: true
            }
          },
          series: [
            {
              name: '禁用次数',
              type: 'bar',
              data: banCounts,
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                  { offset: 0, color: '#ff4d4f' },
                  { offset: 1, color: '#ff7875' }
                ]),
                borderRadius: [0, 4, 4, 0]
              },
              label: {
                show: true,
                position: 'right',
                formatter: function(params) {
                  const heroIndex = params.dataIndex;
                  return heroDataSorted[heroIndex].banCount;
                },
                fontSize: 12,
                fontWeight: 'bold'
              },
              animationDelay: function(idx) {
                return idx * 100;
              }
            }
          ],

          animationEasing: 'elasticOut',
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
                  right: '10%',
                  bottom: 0,
                  top: 0
                }
              }
            }
          ]
        };
        
        heroBanChartInstance.setOption(option, true);
      } catch (error) {
        console.error('获取英雄禁用数据失败:', error);
        
        // 显示默认数据或空数据状态
        const option = {
          tooltip: {
            trigger: 'axis',
            axisPointer: {
              type: 'shadow'
            }
          },
          grid: {
            left: '2%',
            right: '10%',
            bottom: '10%',
            containLabel: true
          },
          xAxis: {
            type: 'value',
            name: '禁用次数',
            nameLocation: 'middle',
            nameGap: 30,
            min: 0,
            minInterval: 1,
            axisLabel: {
              formatter: function(value) {
                return Math.max(1, Math.floor(value));
              }
            }
          },
          yAxis: {
            type: 'category',
            inverse: true,
            data: [],
            axisLabel: {
              interval: 0,
              margin: 10
            },
            axisTick: {
              alignWithLabel: true
            }
          },
          series: [
            {
              name: '禁用次数',
              type: 'bar',
              data: [],
              itemStyle: {
                color: '#ff4d4f'
              }
            }
          ],
          graphic: {
            elements: [
              {
                type: 'text',
                left: 'center',
                top: 'center',
                style: {
                  text: '暂无英雄禁用数据',
                  fontSize: 16,
                  fontWeight: 'bold',
                  fill: '#999'
                }
              }
            ]
          }
        };
        
        heroBanChartInstance.setOption(option, true);
      } finally {
        heroBanChartInstance.hideLoading();
      }
    };

    const handleResize = () => {
      heroBanChartInstance?.resize();
    };

    // 监听 seasonId 变化
    watch(() => props.seasonId, (newVal) => {
      // 只有在组件已挂载且图表初始化后才更新
      updateHeroBanChart();
    });

    onMounted(async () => {
      await nextTick();
      heroBanChartInstance = echarts.init(heroBanChart.value);
      updateHeroBanChart();
      window.addEventListener('resize', handleResize);
    });

    onUnmounted(() => {
      window.removeEventListener('resize', handleResize);
      heroBanChartInstance?.dispose();
    });

    return {
      heroBanChart
    };
  }
};
</script>

<style scoped>
.data-card {
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
}

.chart-container {
  width: 100%;
  height: 400px;
}

@media (max-width: 768px) {
  .chart-container {
    height: 400px;
  }
}
</style>
