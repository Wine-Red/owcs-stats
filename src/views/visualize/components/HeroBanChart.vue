<template>
  <div class="vis-card">
    <SlantedTitle title="英雄禁用统计">
      <template #title-suffix>
        <el-tooltip content="统计当前赛季各英雄被禁用的次数和频率（默认显示禁用次数Top10）" placement="top">
          <el-icon class="info-icon"><InfoFilled /></el-icon>
        </el-tooltip>
      </template>
    </SlantedTitle>
    <div class="card-content">
      <div ref="heroBanChart" class="chart-container"></div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import * as echarts from 'echarts';
import apiService from '@/services/api';
import { InfoFilled } from '@element-plus/icons-vue';
import SlantedTitle from './SlantedTitle.vue';
import { escapeHtml } from '@/utils/security';

export default {
  name: 'HeroBanChart',
  components: {
    InfoFilled,
    SlantedTitle
  },
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

      if (!props.seasonId) return;
      
      if (!heroBanChartInstance) {
          heroBanChartInstance = echarts.init(heroBanChart.value);
      }
      
      try {
        // 显示加载动画
        heroBanChartInstance.showLoading({
          color: '#FF9E0F',
          textColor: '#FF9E0F',
          maskColor: 'rgba(255, 255, 255, 0.8)'
        });
        
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
              return `
                <div style="font-weight: 800; margin-bottom: 8px; color: #1A1A1A; font-size: 14px;">${escapeHtml(d.heroName)}</div>
                <div style="display: flex; justify-content: space-between; gap: 20px; margin-bottom: 4px;">
                  <span style="color: #606266;">禁用次数:</span>
                  <span style="font-weight: bold; color: #FF9E0F;">${d.banCount}</span>
                </div>
                <div style="display: flex; justify-content: space-between; gap: 20px;">
                  <span style="color: #606266;">禁用率:</span>
                  <span style="font-weight: bold; color: #1A1A1A;">${d.banRate}%</span>
                </div>
              `;
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
            left: '2%',
            right: '8%',
            bottom: '5%',
            top: '5%',
            containLabel: true
          },
          xAxis: {
            type: 'value',
            min: 0,
            minInterval: 1,
            axisLabel: {
              color: '#909399',
              formatter: v => Math.floor(v),
              fontFamily: 'Inter, sans-serif'
            },
            splitLine: {
              lineStyle: {
                type: 'dashed',
                color: '#EBEEF5'
              }
            },
            axisLine: { show: false },
            axisTick: { show: false }
          },
          yAxis: {
            type: 'category',
            inverse: true,
            data: heroNames,
            axisLabel: {
              interval: 0,
              rotate: 0,
              fontSize: 13,
              fontWeight: 600,
              color: '#303133',
              margin: 12,
              fontFamily: 'Inter, sans-serif'
            },
            axisTick: { show: false },
            axisLine: { show: false },
            splitLine: { show: false }
          },
          series: [
            {
              name: '禁用次数',
              type: 'bar',
              data: banCounts,
              barWidth: '50%',
              showBackground: true,
              backgroundStyle: {
                color: '#F5F7FA',
                borderRadius: [0, 4, 4, 0]
              },
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                  { offset: 0, color: '#A8ABB2' },
                  { offset: 1, color: '#606266' }
                ]),
                borderRadius: [0, 4, 4, 0],
                shadowColor: 'rgba(0, 0, 0, 0.1)',
                shadowBlur: 8,
                shadowOffsetX: 4
              },
              label: {
                show: true,
                position: 'right',
                formatter: function(params) {
                  const heroIndex = params.dataIndex;
                  return heroDataSorted[heroIndex].banCount;
                },
                fontSize: 12,
                fontWeight: 'bold',
                color: '#606266',
                offset: [8, 0],
                fontFamily: 'Inter, sans-serif'
              },
              animationDelay: function(idx) {
                return idx * 50;
              }
            }
          ],

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
                  fill: '#909399'
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
    watch(() => props.seasonId, () => {
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
.card-content {
  padding: 24px;
}

.info-icon {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition: color 0.3s;
}

.info-icon:hover {
  color: #FFFFFF;
}

.chart-container {
  width: 100%;
  height: 400px;
}

@media (max-width: 768px) {
  .chart-container {
    height: 350px;
  }
  .card-content {
    padding: 16px;
  }
}
</style>
