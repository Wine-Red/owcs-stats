import { ref } from 'vue';
import * as echarts from 'echarts';

export function useChartExport() {
  const showPreview = ref(false);
  const previewImage = ref('');

  const generateChartImage = async (chartInstance, seasonName = '') => {
    if (!chartInstance) return null;

    // 设定目标输出尺寸 1600x1200 (4:3)
    const EXPORT_WIDTH = 1600;
    const EXPORT_HEIGHT = 1200;
    
    // 模拟的设备宽度
    const TARGET_LOGICAL_WIDTH = 768;
    
    // 布局参数
    const padding = Math.round(EXPORT_WIDTH * 0.05); 
    const headerHeight = Math.round(EXPORT_HEIGHT * 0.2);
    const contentHeight = EXPORT_HEIGHT - headerHeight; // 图表区域高度
    
    // 1. 创建离屏容器并渲染图表
    const RENDER_SCALE = TARGET_LOGICAL_WIDTH / EXPORT_WIDTH; 
    
    const renderWidth = EXPORT_WIDTH * RENDER_SCALE; 
    const renderHeight = contentHeight * RENDER_SCALE; 

    const offscreenDiv = document.createElement('div');
    offscreenDiv.style.width = `${renderWidth}px`;
    offscreenDiv.style.height = `${renderHeight}px`;
    offscreenDiv.style.position = 'absolute';
    offscreenDiv.style.left = '-9999px';
    offscreenDiv.style.top = '-9999px';
    document.body.appendChild(offscreenDiv);

    let chartDataUrl = '';
    try {
      const offscreenChart = echarts.init(offscreenDiv);
      const options = chartInstance.getOption();
      
      // === 样式重写开始 ===
      options.animation = false;
      options.backgroundColor = 'transparent'; // 透明背景，由 Canvas 绘制背景

      // 针对雷达图的特定样式优化
      if (options.radar) {
        // 雷达图坐标系样式
        const radarOps = Array.isArray(options.radar) ? options.radar[0] : options.radar;
        if (radarOps) {
          radarOps.splitArea = {
            show: false // 去掉背景色块
          };
          radarOps.axisName = {
            color: '#303133',
            fontSize: 20,
            fontWeight: 'bold',
            fontFamily: '"Microsoft YaHei", sans-serif'
          };
        }
      }

      // 处理其他图表类型的坐标轴颜色 (如柱状图、折线图的 XY 轴)
      // 提取到雷达图判断之外，确保对所有直角坐标系图表生效
      // 用户需求：网格线还是变成浅紫色吧
      const updateAxisStyle = (axis) => {
        if (!axis) return;
        const axes = Array.isArray(axis) ? axis : [axis];
        axes.forEach(ax => {
          if (!ax.splitLine) ax.splitLine = {};
          if (!ax.splitLine.lineStyle) ax.splitLine.lineStyle = {};
          
          // 仅修改网格线颜色为浅紫色
          ax.splitLine.lineStyle.color = 'rgba(64, 15, 73, 0.2)';
        });
      };
      
      updateAxisStyle(options.xAxis);
      updateAxisStyle(options.yAxis);
      
      // 数据系列样式 - 保持原图表颜色，不做覆盖
      // if (options.series) {
      //   options.series.forEach(series => {
      //     if (series.type === 'radar') {
      //        ...
      //     }
      //   });
      // }

      // 针对直角坐标系图表 (散点图、折线图、柱状图) 的 Grid 调整
      // 避免右下角的 Godlike Logo 遮挡图表内容
      if (!options.radar && (options.xAxis || options.yAxis)) {
          if (!options.grid) options.grid = {};
          const grids = Array.isArray(options.grid) ? options.grid : [options.grid];
          grids.forEach(g => {
             // 右侧加大，给二维码/Logo 留位 (Logo 宽 160 + Padding 80 = 240px，约占 15%)
             g.right = '20%'; 
             // 底部加大，避免 X 轴标签被遮挡
             g.containLabel = true;
          });
      }

      // === 样式重写结束 ===

      offscreenChart.setOption(options);
      offscreenChart.resize();
      
      chartDataUrl = offscreenChart.getDataURL({
        type: 'png',
        pixelRatio: 1 / RENDER_SCALE, 
        backgroundColor: 'transparent',
        excludeComponents: ['toolbox']
      });
      
      offscreenChart.dispose();
    } catch (err) {
      console.error('Offscreen chart render failed:', err);
      // 降级方案
      const currentWidth = chartInstance.getWidth();
      const pixelRatio = EXPORT_WIDTH / currentWidth;
      chartDataUrl = chartInstance.getDataURL({
        type: 'png',
        pixelRatio: pixelRatio,
        backgroundColor: '#fff',
        excludeComponents: ['toolbox']
      });
    } finally {
      document.body.removeChild(offscreenDiv);
    }

    // 2. 加载资源 (Logo)
    const logoImg = new Image();
    const godlikeImg = new Image();
    const baseUrl = import.meta.env.BASE_URL.endsWith('/') 
      ? import.meta.env.BASE_URL 
      : `${import.meta.env.BASE_URL}/`;
    
    // 尝试加载 OWCS logo，如果不存在则使用 godlike (或不显示)
    logoImg.src = `${baseUrl}icons/OWCS_Dark.png`;
    godlikeImg.src = `${baseUrl}icons/godlike.png`;
    
    // 3. 创建 Canvas 绘制海报
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = chartDataUrl;

    await Promise.all([
      new Promise((resolve) => { img.onload = resolve; }),
      new Promise((resolve) => { 
        logoImg.onload = resolve;
        logoImg.onerror = (e) => {
          console.warn('Failed to load logo, trying fallback:', logoImg.src);
          // 尝试回退
          logoImg.src = `${baseUrl}icons/godlike.png`;
          logoImg.onload = resolve;
          logoImg.onerror = resolve; // 再次失败则忽略
        };
      }),
      new Promise((resolve) => {
        godlikeImg.onload = resolve;
        godlikeImg.onerror = (e) => {
          console.warn('Failed to load godlike icon:', godlikeImg.src);
          resolve();
        };
      })
    ]);
    
    canvas.width = EXPORT_WIDTH;
    canvas.height = EXPORT_HEIGHT;

    // --- 背景绘制 ---
    
    // 1. 底色：浅灰色渐变，比原来的更灰一点
    const bgGradient = ctx.createLinearGradient(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
    bgGradient.addColorStop(0, '#eef0f4'); // 左上角：浅灰
    bgGradient.addColorStop(1, '#dce0e6'); // 右下角：稍深的灰
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

    // 2. 几何图形叠加 (Geometric Overlay) -> 改为柔和光晕叠加，消除硬边
    // 原来的三角形裁切会导致明显的斜向分割线，现在改为全屏柔和渐变
    ctx.save();
    
    // 调整坐标系比例，实现椭圆渐变 (水平长，垂直短)
    ctx.scale(1.6, 0.5);

    // 使用径向渐变来模拟柔和的光晕
    // 由于垂直方向被压缩了0.4，所以这里的半径主要决定水平覆盖范围
    const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, EXPORT_WIDTH * 0.9);
    glowGradient.addColorStop(0, 'rgba(255, 162, 0, 0.72)'); // OWCS Orange，降低透明度
    glowGradient.addColorStop(0.5, 'rgba(255, 200, 100, 0.05)'); // 柔和过渡
    glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)'); // 完全透明
    
    ctx.fillStyle = glowGradient;
    // 填充区域反向拉伸，确保覆盖原定区域
    ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT / 0.4);
    ctx.restore();

    // 3. 斜向浅灰装饰条 (Tech Style Stripes)
    // 定义一个绘制旋转矩形的函数
    const drawStripe = (x, y, length, thickness, opacity) => {
        ctx.save();
        ctx.translate(x, y);
        // 统一旋转角度，例如 -35度 (/)
        const angle = -15 * Math.PI / 180;
        ctx.rotate(angle); 
        ctx.fillStyle = `rgba(144, 147, 153, ${opacity})`;
        
        // 计算偏移量以使尾端垂直
        // 在旋转坐标系中，如果要让切割线在全局坐标系下垂直，需要计算底边的x偏移
        const skewOffset = thickness * Math.tan(angle);

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(length, 0);
        // 尾端垂直切口
        ctx.lineTo(length + skewOffset, thickness);
        // 首端垂直切口 (使两端都垂直)
        ctx.lineTo(skewOffset, thickness);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    };

    // 绘制多条装饰纹理 - 加粗，加密
    // 注意：坐标是旋转前的原点，需要根据旋转角度调整位置以确保线条出现在画面中
    
    // 顶部的一组细线 -> 移动到左下
    drawStripe(EXPORT_WIDTH * 0.5, EXPORT_HEIGHT * 1, EXPORT_WIDTH * 1.5, 150, 0.2); // 加粗
    drawStripe(EXPORT_WIDTH * -0.12, EXPORT_HEIGHT * 0.88, EXPORT_WIDTH * 1.5, 40, 0.1); // 加粗
    drawStripe(EXPORT_WIDTH * 0.15, EXPORT_HEIGHT * 0.92, EXPORT_WIDTH * 1.5, 12, 0.15); // 新增细线

    // 中间穿过图表区域的装饰线 (中段)
    drawStripe(EXPORT_WIDTH * -0.1, EXPORT_HEIGHT * 0.2, EXPORT_WIDTH * 0.2, 200, 0.03); // 更加宽大的淡色带
    drawStripe(EXPORT_WIDTH * 0.0, EXPORT_HEIGHT * 0.55, EXPORT_WIDTH * 2, 250, 0.02); // 新增宽色带
    drawStripe(EXPORT_WIDTH * -0.05, EXPORT_HEIGHT * 0.51, EXPORT_WIDTH * 0.7, 20, 0.15); // 加粗细线
    drawStripe(EXPORT_WIDTH * 0.08, EXPORT_HEIGHT * 0.62, EXPORT_WIDTH * 2, 30, 0.08); // 新增

    // 底部区域 (右下)
    drawStripe(EXPORT_WIDTH * -0.1, EXPORT_HEIGHT * 0.75, EXPORT_WIDTH*0.5, 110, 0.18); // 加粗
    drawStripe(EXPORT_WIDTH * 0.35, EXPORT_HEIGHT * 1, EXPORT_WIDTH, 40, 0.1); // 加粗
    drawStripe(EXPORT_WIDTH * 0.6, EXPORT_HEIGHT * 0.92, EXPORT_WIDTH, 60, 0.06); // 加粗
    drawStripe(EXPORT_WIDTH * 0.45, EXPORT_HEIGHT * 1, EXPORT_WIDTH, 20, 0.4); // 新增

    // 4. 柔和高光 (Soft Highlight)
    // 叠加一个大的径向渐变，让整体更柔和
    const overlayGradient = ctx.createRadialGradient(
        EXPORT_WIDTH * 0.5, EXPORT_HEIGHT * 0.5, 0,
        EXPORT_WIDTH * 0.5, EXPORT_HEIGHT * 0.5, EXPORT_WIDTH * 0.8
    );
    overlayGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    overlayGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = overlayGradient;
    ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);



    // --- 绘制图表 ---
    // 居中绘制图表
    const chartY = (canvas.height - contentHeight) / 2 + headerHeight * 0.5;
    ctx.drawImage(img, 0, chartY, EXPORT_WIDTH, contentHeight);

    // --- 绘制 Header ---
    // 左上角标题 OWCS STATS
    const titleX = padding - 30;
    const titleY = padding - 35;
    
    // OWCS STATS 主标题
    ctx.font = `900 100px "Orbitron", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // 文字描边效果 (实现类似图片中的效果：白字带黄色光晕/描边，或者黄字白边)
    // 图片看起来是：白字，厚重的黄色/橙色 阴影或描边
    // 用户需求：黑色字，不需要描边，只需要阴影
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0; // 移除描边宽度
    
    // 设置阴影
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 5;
    
    ctx.fillStyle = '#2B2E34'; // 使用深灰色，比纯黑更柔和且更有质感
    ctx.fillText('OWCS STATS', titleX, titleY);
    
    // 清除阴影设置以免影响后续绘制
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // 副标题 2025 全球总决赛
    const subTitleText = '2025 全球总决赛';
    const subTitleY = titleY + 110;
    ctx.font = `bold 48px "Microsoft YaHei", sans-serif`;
    
    // 副标题同样处理：深灰色 + 阴影
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    
    ctx.fillStyle = '#3A3D42';
    ctx.fillText(subTitleText, titleX, subTitleY);

    // 清除阴影设置
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // --- 绘制右上角 Logo ---
    if (logoImg.complete && logoImg.naturalWidth > 0) {
      const logoHeight = 150;
      const logoWidth = (logoImg.width / logoImg.height) * logoHeight;
      const logoX = canvas.width - padding - logoWidth;
      const logoY = padding - 35;
      
      // 添加白色辉光/阴影让Logo在背景上更清晰
      ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
      ctx.shadowBlur = 20;
      ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
      ctx.shadowBlur = 0;
    }

    // --- 绘制右下角 Godlike Logo ---
    if (godlikeImg.complete && godlikeImg.naturalWidth > 0) {
      const glSize = 160;
      const glX = canvas.width - padding - glSize;
      const glY = canvas.height - padding - glSize;
      
      // 添加柔和阴影
      ctx.shadowColor = "rgba(0, 0, 0, 0.1)";
      ctx.shadowBlur = 10;
      
      // 保持比例绘制
      const glAspect = godlikeImg.width / godlikeImg.height;
      let drawW = glSize;
      let drawH = glSize;
      
      if (glAspect > 1) {
          drawH = glSize / glAspect;
      } else {
          drawW = glSize * glAspect;
      }
      
      // 居中于目标区域
      const drawX = glX + (glSize - drawW) / 2;
      const drawY = glY + (glSize - drawH) / 2;

      ctx.drawImage(godlikeImg, drawX, drawY, drawW, drawH);
      ctx.shadowBlur = 0;
    }

    return canvas.toDataURL('image/png');
  };

  const handleExportChart = async (chartInstance, seasonName = '') => {
    try {
      if (!chartInstance) {
        console.warn('Chart instance not found');
        return;
      }
      const url = await generateChartImage(chartInstance, seasonName);
      if (url) {
        previewImage.value = url;
        showPreview.value = true;
      }
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  return {
    showPreview,
    previewImage,
    handleExportChart
  };
}
