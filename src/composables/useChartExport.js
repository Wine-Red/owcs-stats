import { ref } from 'vue';
import * as echarts from 'echarts';

export function useChartExport() {
  const showPreview = ref(false);
  const previewImage = ref('');

  const generateChartImage = async (chartInstance, seasonName = '') => {
    if (!chartInstance) return null;

    // 设定目标输出尺寸
    // 1. 图片比例为 4:3 (横屏)，即 1600x1200
    // 2. 图表内容要像在 768px 宽度的设备上显示的一样（大字体、清晰）
    
    const EXPORT_WIDTH = 1600;
    const EXPORT_HEIGHT = 1200; // 4:3 比例
    
    // 模拟的设备宽度
    const TARGET_LOGICAL_WIDTH = 768;
    
    // 基于 EXPORT_WIDTH 计算所有尺寸，确保比例一致
    const footerHeight = Math.round(EXPORT_WIDTH * 0.14); 
    const padding = Math.round(EXPORT_WIDTH * 0.035); 
    const contentHeight = EXPORT_HEIGHT - footerHeight;

    // 1. 创建离屏容器并渲染图表
    // RENDER_SCALE 决定了我们在多大的容器里画图
    // 768 / 1600 = 0.48，意味着我们在一个 768px 宽的容器里画图
    const RENDER_SCALE = TARGET_LOGICAL_WIDTH / EXPORT_WIDTH; 
    
    const renderWidth = EXPORT_WIDTH * RENDER_SCALE; // = 768
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
      // 深拷贝 options 以免影响原图表，且必须断开引用
      // 注意：getOption() 返回的是包含默认值的完整配置，直接 setOption 可能会有冗余，
      // 但通常是安全的。如果有函数（formatter）需要小心 JSON.stringify，但 getOption 返回的是对象。
      // 最好的方式是直接使用 getOption() 返回的对象，ECharts 会处理。
      const options = chartInstance.getOption();
      
      // 关闭动画，确保渲染即完成
      options.animation = false;
      
      // 针对雷达图等可能使用固定像素半径的图表，尝试进行适配（如果是百分比则不需要）
      // 这里主要依靠容器缩小 (RENDER_SCALE) 来让固定像素的元素显得更大
      
      offscreenChart.setOption(options);
      
      // 必须调用 resize 确保图表适应新的容器大小
      offscreenChart.resize();
      
      chartDataUrl = offscreenChart.getDataURL({
        type: 'png',
        pixelRatio: 1 / RENDER_SCALE, // 2.0，补偿容器的缩小，输出 1600px 宽的图
        backgroundColor: '#fff',
        excludeComponents: ['toolbox']
      });
      
      offscreenChart.dispose();
    } catch (err) {
      console.error('Offscreen chart render failed:', err);
      // 降级方案：使用原图表截图（虽然比例可能不对，但总比失败好）
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

    // 2. 加载图标
    const logoImg = new Image();
    // 使用 import.meta.env.BASE_URL 确保在非根路径部署时也能正确加载资源
    // vite.config.js 中配置了 base: '/stats/'，所以必须加上这个前缀
    const baseUrl = import.meta.env.BASE_URL.endsWith('/') 
      ? import.meta.env.BASE_URL 
      : `${import.meta.env.BASE_URL}/`;
    logoImg.src = `${baseUrl}icons/godlike.png`;
    
    // 3. 创建 Canvas 添加水印
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = chartDataUrl;

    await Promise.all([
      new Promise((resolve) => { img.onload = resolve; }),
      new Promise((resolve) => { 
        logoImg.onload = resolve;
        logoImg.onerror = (e) => {
          console.error('Failed to load chart footer logo:', logoImg.src, e);
          resolve(); // 即使加载失败也继续
        };
      })
    ]);
    
    // 设置 Canvas 尺寸
    canvas.width = EXPORT_WIDTH;
    canvas.height = EXPORT_HEIGHT;

    // 绘制白色背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制图表
    // 此时 img 的尺寸严格等于 EXPORT_WIDTH x contentHeight，直接绘制即可
    ctx.drawImage(img, 0, 0, EXPORT_WIDTH, contentHeight);

    // 绘制底部背景（浅灰 -> 更深一点的浅灰，增加对比度）
    // 底部起始 Y 坐标
    const footerY = contentHeight;
    
    const gradient = ctx.createLinearGradient(0, footerY, 0, canvas.height);
    gradient.addColorStop(0, '#f0f2f5'); // Element Plus 背景灰
    gradient.addColorStop(1, '#e6e8eb');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, footerY, canvas.width, footerHeight);

    // 绘制六边形蜂巢纹理
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, footerY, canvas.width, footerHeight);
    ctx.clip(); // 限制绘制区域在底部

    const hexRadius = Math.round(EXPORT_WIDTH * 0.015); // 约 24px
    const hexWidth = Math.sqrt(3) * hexRadius;
    const hexHeight = 2 * hexRadius;
    const xStep = hexWidth;
    const yStep = hexHeight * 0.75;

    ctx.lineWidth = 1.5;

    // 覆盖整个底部区域，并应用水平渐隐
    for (let y = footerY - hexHeight; y < canvas.height + hexHeight; y += yStep) {
      const row = Math.round((y - (footerY - hexHeight)) / yStep);
      const xOffset = (row % 2) * (hexWidth / 2);
      
      for (let x = -hexWidth; x < canvas.width + hexWidth; x += xStep) {
        const cx = x + xOffset;
        
        // 计算渐隐透明度：从右(100%)向左(0%)渐隐
        // 最大透明度 0.06，让右侧纹理可见，左侧文字区域保持干净
        const progress = Math.max(0, Math.min(1, cx / canvas.width));
        // 使用平方函数让左侧消失得更快，保证文字区域清晰
        const alpha = Math.pow(progress, 1.5) * 0.06;
        
        if (alpha < 0.005) continue; // 几乎不可见则跳过

        const cy = y;
        
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i + Math.PI / 6; // 旋转30度，尖头朝上
          const px = cx + hexRadius * Math.cos(angle);
          const py = cy + hexRadius * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        
        ctx.strokeStyle = `rgba(0, 0, 0, ${alpha.toFixed(3)})`;
        ctx.stroke();
      }
    }
    ctx.restore();

    // 绘制顶部装饰线（橙色）
    const lineHeight = Math.round(EXPORT_WIDTH * 0.005); // 约 8px
    ctx.fillStyle = '#ff9c07'; // OWCS 风格橙色
    ctx.fillRect(0, footerY, canvas.width, lineHeight);

    // 绘制左侧主标题: "OWCS STATS"
    const textY = footerY + footerHeight / 2;
    
    // 主标题字体大小
    const mainTitleSize = Math.round(EXPORT_WIDTH * 0.045); // 约 72px
    ctx.font = `900 ${mainTitleSize}px "Orbitron", sans-serif`;
    ctx.fillStyle = '#303133'; // 主要文字色
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom'; // 基线对齐方便排版
    
    const mainTitle = 'OWCS STATS';
    ctx.fillText(mainTitle, padding, textY - (footerHeight * 0.04));

    // 如果有赛季名称，绘制在标题下方
    if (seasonName) {
      const subTitleSize = Math.round(EXPORT_WIDTH * 0.024); // 约 38px
      ctx.font = `800 ${subTitleSize}px "Orbitron", sans-serif`;
      ctx.fillStyle = '#909399'; // 浅灰色
      ctx.textBaseline = 'top';
      ctx.fillText(seasonName, padding, textY + (footerHeight * 0.04));
    }

    // 绘制右侧 Logo (如果有)
    if (logoImg.complete && logoImg.naturalWidth > 0) {
      const logoSize = Math.round(EXPORT_WIDTH * 0.09); // 约 144px
      // 保持正方形或原始比例，这里假设是正方形或者按高度适配
      const renderHeight = logoSize;
      const renderWidth = (logoImg.width / logoImg.height) * renderHeight;
      
      const logoX = canvas.width - padding - renderWidth;
      const logoY = footerY + (footerHeight - renderHeight) / 2;
      
      // 添加 Logo 阴影效果
      ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
      ctx.shadowBlur = Math.round(EXPORT_WIDTH * 0.01);
      ctx.shadowOffsetY = Math.round(EXPORT_WIDTH * 0.003);
      
      ctx.drawImage(logoImg, logoX, logoY, renderWidth, renderHeight);
      
      // 重置阴影
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }

       // 如果 Logo 加载失败，回退到文字
       // 这里可以选择不画或者画文字，暂时不处理

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
