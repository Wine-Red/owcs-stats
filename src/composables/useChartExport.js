import { ref } from 'vue';
import * as echarts from 'echarts';

function drawVerticalArtisticTitle(ctx, title, rightAreaX, rightAreaY) {
    let mainText = title;
    let subText = '';
    
    // 自动拆分副标题
    if (title.endsWith('排行榜')) {
        mainText = title.replace('排行榜', '');
        subText = '排行榜';
    } else if (title.endsWith('表现分布')) {
        mainText = title.replace('表现分布', '');
        subText = '表现分布';
    } else if (title.length > 4) {
        // 如果实在没有匹配后缀且很长，粗略拆分后半部分为副标题
        mainText = title.substring(0, title.length - 4);
        subText = title.substring(title.length - 4);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    // 辅助函数：绘制竖排文字
    const drawVerticalText = (text, x, y, charSpacing = 50) => {
        for (let i = 0; i < text.length; i++) {
            ctx.fillText(text[i], x, y + i * charSpacing);
        }
    };

    // 针对短词动态拉大间距匹配高度
    let mainCharSpacing = 52;
    if (mainText.length === 2 && subText.length >= 3) {
        mainCharSpacing = 80; 
    } else if (mainText.length === 2 && subText.length === 4) {
        mainCharSpacing = 90; // "表现分布" 有四个字，需要拉得更长
    }

    // 绘制第二列：主文本，竖向
    const mainTextX = rightAreaX - 20;
    ctx.font = '900 48px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#FF9E0F'; 
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    drawVerticalText(mainText, mainTextX, rightAreaY, mainCharSpacing);
    
    // 绘制第一列：竖线高度根据主文本的最终实际排版高度来算
    const lineX = rightAreaX - 60;
    ctx.fillStyle = '#FF9E0F';
    const lineHeight = (mainText.length - 1) * mainCharSpacing + 48;
    ctx.fillRect(lineX, rightAreaY, 6, lineHeight);
    
    // 绘制第三列：副文本，竖向
    const subTextX = rightAreaX + 40;
    const subTextY = rightAreaY + 10;
    ctx.font = 'bold 32px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#606266'; 
    ctx.shadowColor = 'transparent';
    drawVerticalText(subText, subTextX, subTextY, 36);
}

function drawExportBackground(ctx, EXPORT_WIDTH, EXPORT_HEIGHT, padding, logoImg, godlikeImg, subTitleText, tableY = null, contentHeight = null) {
    // 1. 底色：浅灰色渐变
    const bgGradient = ctx.createLinearGradient(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
    bgGradient.addColorStop(0, '#eef0f4'); 
    bgGradient.addColorStop(1, '#dce0e6'); 
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

    // 2. 几何图形叠加 -> 柔和光晕叠加
    ctx.save();
    ctx.scale(1.6, 0.5);
    const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, EXPORT_WIDTH * 0.9);
    glowGradient.addColorStop(0, 'rgba(255, 162, 0, 0.72)');
    glowGradient.addColorStop(0.5, 'rgba(255, 200, 100, 0.05)');
    glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = glowGradient;
    ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT / 0.4);
    ctx.restore();

    // 3. 斜向浅灰装饰条
    const drawStripe = (x, y, length, thickness, opacity) => {
        ctx.save();
        ctx.translate(x, y);
        const angle = -15 * Math.PI / 180;
        ctx.rotate(angle); 
        ctx.fillStyle = `rgba(144, 147, 153, ${opacity})`;
        
        const skewOffset = thickness * Math.tan(angle);

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(length, 0);
        ctx.lineTo(length + skewOffset, thickness);
        ctx.lineTo(skewOffset, thickness);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    };

    drawStripe(EXPORT_WIDTH * 0.5, EXPORT_HEIGHT * 1, EXPORT_WIDTH * 1.5, 150, 0.2); 
    drawStripe(EXPORT_WIDTH * -0.12, EXPORT_HEIGHT * 0.88, EXPORT_WIDTH * 1.5, 40, 0.1); 
    drawStripe(EXPORT_WIDTH * 0.15, EXPORT_HEIGHT * 0.92, EXPORT_WIDTH * 1.5, 12, 0.15); 

    drawStripe(EXPORT_WIDTH * -0.1, EXPORT_HEIGHT * 0.2, EXPORT_WIDTH * 0.2, 200, 0.03); 
    drawStripe(EXPORT_WIDTH * 0.0, EXPORT_HEIGHT * 0.55, EXPORT_WIDTH * 2, 250, 0.02); 
    drawStripe(EXPORT_WIDTH * -0.05, EXPORT_HEIGHT * 0.51, EXPORT_WIDTH * 0.7, 20, 0.15); 
    drawStripe(EXPORT_WIDTH * 0.08, EXPORT_HEIGHT * 0.62, EXPORT_WIDTH * 2, 30, 0.08); 

    drawStripe(EXPORT_WIDTH * -0.1, EXPORT_HEIGHT * 0.75, EXPORT_WIDTH*0.5, 110, 0.18); 
    drawStripe(EXPORT_WIDTH * 0.35, EXPORT_HEIGHT * 1, EXPORT_WIDTH, 40, 0.1); 
    drawStripe(EXPORT_WIDTH * 0.6, EXPORT_HEIGHT * 0.92, EXPORT_WIDTH, 60, 0.06); 
    drawStripe(EXPORT_WIDTH * 0.45, EXPORT_HEIGHT * 1, EXPORT_WIDTH, 20, 0.4); 

    // 4. 柔和高光
    const overlayGradient = ctx.createRadialGradient(
        EXPORT_WIDTH * 0.5, EXPORT_HEIGHT * 0.5, 0,
        EXPORT_WIDTH * 0.5, EXPORT_HEIGHT * 0.5, EXPORT_WIDTH * 0.8
    );
    overlayGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    overlayGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = overlayGradient;
    ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

    // --- 绘制 Header ---
    const titleX = padding - 30;
    const titleY = padding - 35;
    
    ctx.font = `900 100px "Orbitron", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // 绘制 OWCS (深色)
    ctx.fillStyle = '#2B2E34'; 
    ctx.fillText('OWCS ', titleX, titleY);
    
    // 测量 OWCS 宽度以便接续绘制 STATS
    const owcsWidth = ctx.measureText('OWCS ').width;
    
    // 绘制 STATS (橙色)
    ctx.fillStyle = '#FF9E0F';
    ctx.fillText('Stats', titleX + owcsWidth, titleY);
    
    const subY = titleY + 110;
    ctx.font = `bold 48px "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = '#3A3D42';
    ctx.fillText(subTitleText || '2025 全球总决赛', titleX, subY);

    // --- 绘制右上角 Logo ---
    if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
      const logoHeight = 150;
      const logoWidth = (logoImg.width / logoImg.height) * logoHeight;
      const logoX = EXPORT_WIDTH - padding - logoWidth;
      const logoY = padding - 35;
      
      ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
      ctx.shadowBlur = 20;
      ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
      ctx.shadowBlur = 0;
    }

    // --- 绘制右下角 Godlike Logo ---
    if (godlikeImg && godlikeImg.complete && godlikeImg.naturalWidth > 0) {
      const glSize = 160;
      
      let glX, glY;
      if (tableY !== null && contentHeight !== null) {
          // 排版逻辑：如果有表格信息，放在右侧留白区域的最下方（与表格底部对齐）
          glX = EXPORT_WIDTH - padding - glSize;
          glY = tableY + contentHeight - glSize;
      } else {
          // 如果是图表导出，放在右下角
          glX = EXPORT_WIDTH - padding - glSize;
          glY = EXPORT_HEIGHT - padding - glSize;
      }
      
      ctx.shadowColor = "rgba(0, 0, 0, 0.1)";
      ctx.shadowBlur = 10;
      
      const glAspect = godlikeImg.width / godlikeImg.height;
      let drawW = glSize;
      let drawH = glSize;
      
      if (glAspect > 1) {
          drawH = glSize / glAspect;
      } else {
          drawW = glSize * glAspect;
      }
      
      const drawX = glX + (glSize - drawW) / 2;
      const drawY = glY + (glSize - drawH) / 2;

      ctx.drawImage(godlikeImg, drawX, drawY, drawW, drawH);
      ctx.shadowBlur = 0;
    }
}

export function useChartExport() {
  const showPreview = ref(false);
  const previewImage = ref('');

    const generateChartImage = async (chartInstance, seasonName = '', chartTitle = '') => {
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
        const radarOps = Array.isArray(options.radar) ? options.radar[0] : options.radar;
        if (radarOps) {
          radarOps.splitArea = { show: false };
          radarOps.axisName = {
            color: '#303133',
            fontSize: 20,
            fontWeight: 'bold',
            fontFamily: '"Microsoft YaHei", sans-serif'
          };
        }
      }

      const updateAxisStyle = (axis) => {
        if (!axis) return;
        const axes = Array.isArray(axis) ? axis : [axis];
        axes.forEach(ax => {
          if (!ax.splitLine) ax.splitLine = {};
          if (!ax.splitLine.lineStyle) ax.splitLine.lineStyle = {};
          ax.splitLine.lineStyle.color = 'rgba(64, 15, 73, 0.2)';
        });
      };
      
      updateAxisStyle(options.xAxis);
      updateAxisStyle(options.yAxis);
      
      if (!options.radar && (options.xAxis || options.yAxis)) {
          if (!options.grid) options.grid = {};
          const grids = Array.isArray(options.grid) ? options.grid : [options.grid];
          grids.forEach(g => {
             g.right = '20%'; 
             g.containLabel = true;
          });
      }
      // === 样式重写结束 ===

      try {
          // 尝试使用 fetch -> blob 预先将跨域的 image:// 转换为 base64
          if (options.series) {
              const fetchPromises = [];
              options.series.forEach(s => {
                  if (s.data) {
                      s.data.forEach(d => {
                          if (d.symbol && d.symbol.startsWith('image://')) {
                              const imgUrl = d.symbol.replace('image://', '');
                              // 只有以 http 开头的才可能是跨域 URL 需要处理
                              if (imgUrl.startsWith('http')) {
                                  const p = fetch(imgUrl, { mode: 'cors' })
                                      .then(res => res.blob())
                                      .then(blob => {
                                          return new Promise(resolve => {
                                              const reader = new FileReader();
                                              reader.onloadend = () => {
                                                  d.symbol = 'image://' + reader.result;
                                                  resolve();
                                              };
                                              reader.readAsDataURL(blob);
                                          });
                                      })
                                      .catch(() => {
                                          // 失败则降级为 circle
                                          d.symbol = 'circle';
                                          d.symbolSize = 10;
                                      });
                                  fetchPromises.push(p);
                              }
                          }
                      });
                  }
              });
              
              if (fetchPromises.length > 0) {
                  await Promise.all(fetchPromises);
              }
          }

          offscreenChart.setOption(options);
          offscreenChart.resize();

          chartDataUrl = offscreenChart.getDataURL({
            type: 'png',
            pixelRatio: 1 / RENDER_SCALE, 
            backgroundColor: 'transparent',
            excludeComponents: ['toolbox']
          });
      } catch (e) {
          console.warn('First export attempt failed (likely CORS), trying fallback without images...', e);
          
          // 如果依然失败，则终极降级：移除所有图片
          if (options.series) {
              options.series.forEach(s => {
                  if (s.data) {
                      s.data.forEach(d => {
                          if (d.symbol && d.symbol.startsWith('image://')) {
                              d.symbol = 'circle';
                              d.symbolSize = 10;
                          }
                      });
                  }
                  if (s.symbol && s.symbol.startsWith('image://')) {
                      s.symbol = 'circle';
                  }
              });
          }
          
          offscreenChart.setOption(options, true); 
          
          chartDataUrl = offscreenChart.getDataURL({
            type: 'png',
            pixelRatio: 1 / RENDER_SCALE, 
            backgroundColor: 'transparent',
            excludeComponents: ['toolbox']
          });
      }
      
      offscreenChart.dispose();
    } catch (err) {
      console.error('Offscreen chart render failed:', err);
      // 最后的降级方案：直接截图原图表（如果原图表也被污染，这一步也会挂，但至少我们尽力了）
      try {
          const currentWidth = chartInstance.getWidth();
          const pixelRatio = EXPORT_WIDTH / currentWidth;
          chartDataUrl = chartInstance.getDataURL({
            type: 'png',
            pixelRatio: pixelRatio,
            backgroundColor: '#fff',
            excludeComponents: ['toolbox']
          });
      } catch (finalErr) {
          console.error('Final fallback export failed:', finalErr);
          // 如果实在不行，就不显示图表了，至少把背景和标题导出来
          chartDataUrl = ''; 
      }
    } finally {
      document.body.removeChild(offscreenDiv);
    }

    // 2. 加载资源 (Logo)
    const logoImg = new Image();
    const godlikeImg = new Image();
    const baseUrl = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    
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
        logoImg.onerror = () => {
          logoImg.src = `${baseUrl}icons/godlike.png`;
          logoImg.onload = resolve;
          logoImg.onerror = resolve;
        };
      }),
      new Promise((resolve) => {
        godlikeImg.onload = resolve;
        godlikeImg.onerror = resolve;
      })
    ]);
    
    canvas.width = EXPORT_WIDTH;
    canvas.height = EXPORT_HEIGHT;

    // --- 背景绘制 ---
    drawExportBackground(ctx, EXPORT_WIDTH, EXPORT_HEIGHT, padding, logoImg, godlikeImg, seasonName);

    // --- 绘制右侧标题 (如果有) ---
    if (chartTitle) {
        // ECharts 已经在右侧留出了大约 15%~20% 的空白（对应实际宽度大概是 1600*0.2 = 320px）
        // 我们直接把标题画在这个预留的空白区域里，靠右侧 padding 内部即可
        const rightAreaX = EXPORT_WIDTH - padding - 120; // 稍微靠右一点，居中在这个空白区
        // 让标题在图表右侧垂直居中偏上一点
        const rightAreaY = headerHeight + 60;
        
        drawVerticalArtisticTitle(ctx, chartTitle, rightAreaX, rightAreaY);
    }

    // --- 绘制图表 ---
    const chartY = (canvas.height - contentHeight) / 2 + headerHeight * 0.5;
    // 图表不需要缩小，直接铺满，因为它本身内置了 grid.right: '20%' 的留白
    ctx.drawImage(img, 0, chartY, EXPORT_WIDTH, contentHeight);

    return canvas.toDataURL('image/png');
  };

  const generateTableImage = async (tableTitle, columns, data, seasonName = '') => {
    const EXPORT_WIDTH = 1600;
    const padding = Math.round(EXPORT_WIDTH * 0.05); 
    
    const rowHeight = 75;
    const tableHeaderHeight = 90;
    const headerHeight = 320; 
    
    const contentHeight = tableHeaderHeight + data.length * rowHeight;
    // 表格只占用左边，给右侧留白 240px 给 logo 等
    const rightMarginForLogo = 240;
    const tableWidth = EXPORT_WIDTH - padding * 2 - rightMarginForLogo;
    
    // 动态计算实际高度，去掉底部的强制留白
    const EXPORT_HEIGHT = headerHeight + contentHeight + padding;

    // 加载全局Logo
    const logoImg = new Image();
    const godlikeImg = new Image();
    const baseUrl = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    logoImg.src = `${baseUrl}icons/OWCS_Dark.png`;
    godlikeImg.src = `${baseUrl}icons/godlike.png`;

    // 预加载所有行内的队伍logo
    const logoPromises = [];
    const loadedLogos = {};
    
    // 初始化一个占位对象，防止同一 URL 被重复加载
    data.forEach(item => {
        if (item.logo && loadedLogos[item.logo] === undefined) {
            loadedLogos[item.logo] = null; 
        }
    });

    Object.keys(loadedLogos).forEach(logoUrl => {
       logoPromises.push(new Promise((resolve) => {
           if (!logoUrl || logoUrl === 'null' || logoUrl === 'undefined') {
               resolve();
               return;
           }
           
           // Fetch approach guarantees that if it succeeds, the blob URL won't taint the canvas
           fetch(logoUrl)
             .then(res => {
                 if (!res.ok) throw new Error('Network response was not ok');
                 return res.blob();
             })
             .then(blob => {
                 const blobUrl = URL.createObjectURL(blob);
                 const img = new Image();
                 img.onload = () => {
                     loadedLogos[logoUrl] = img;
                     resolve();
                 };
                 img.onerror = () => {
                     console.warn(`Failed to decode blob for logo: ${logoUrl}`);
                     resolve();
                 };
                 img.src = blobUrl;
             })
             .catch(err => {
                 console.warn(`Fetch failed for logo, skipping to prevent canvas taint: ${logoUrl}`, err);
                 // 明确将该 logo 标记为无法安全加载，避免后续绘制时污染 canvas
                 loadedLogos[logoUrl] = null;
                 resolve();
             });
       }));
    });

    await Promise.all([
      new Promise(r => { logoImg.onload = r; logoImg.onerror = () => {
          logoImg.src = `${baseUrl}icons/godlike.png`;
          logoImg.onload = r;
          logoImg.onerror = r;
      };}),
      new Promise(r => { godlikeImg.onload = r; godlikeImg.onerror = r; }),
      ...logoPromises
    ]);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = EXPORT_WIDTH;
    canvas.height = EXPORT_HEIGHT;

    // --- 绘制背景 ---
    const tableY = headerHeight;
    // 传 tableY 和 contentHeight，让背景绘制方法把 godlike 放在表格右侧区域下方
    drawExportBackground(ctx, EXPORT_WIDTH, EXPORT_HEIGHT, padding, logoImg, godlikeImg, seasonName, tableY, contentHeight);

    // --- 绘制表格 ---
    const tableX = padding;
    
    // 表格容器背景 - 设为全透明或极低透明度，让海报背景透出来
    ctx.fillStyle = 'rgba(255, 255, 255, 0)'; 
    ctx.shadowColor = 'rgba(0, 0, 0, 0)'; // 去掉阴影，让其完全融入背景
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.beginPath();
    ctx.roundRect(tableX, tableY, tableWidth, contentHeight, 16);
    ctx.fill();

    // 绘制表格右侧的艺术字标题 (竖向排版)
    // 根据表格宽度调整 rightAreaX 的位置
    const rightAreaX = tableX + tableWidth + (rightMarginForLogo / 2) - 30; // 稍微向左偏移一点，避免重叠
    // 让标题在右侧空间的垂直起始位置
    const rightAreaY = tableY + 40;
    
    drawVerticalArtisticTitle(ctx, tableTitle, rightAreaX, rightAreaY);

    // 列宽计算
    const totalWeight = columns.reduce((sum, col) => sum + (col.weight || 1), 0);
    let currentX = tableX;
    
    const columnSpecs = columns.map(col => {
       const w = (col.weight || 1) / totalWeight * tableWidth;
       const spec = { ...col, x: currentX, width: w };
       currentX += w;
       return spec;
    });

    // 绘制表头 - 调整透明度以适应背景
    ctx.fillStyle = '#909399';
    ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
    
    // 表头使用半透明白色，增加毛玻璃感
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.roundRect(tableX, tableY, tableWidth, tableHeaderHeight, [16, 16, 0, 0]);
    ctx.fill();

    ctx.fillStyle = '#606266';
    columnSpecs.forEach(col => {
        ctx.textAlign = col.align || 'center';
        const textX = col.align === 'left' ? col.x + 40 : col.x + col.width / 2;
        ctx.fillText(col.label, textX, tableY + tableHeaderHeight / 2);
    });

    // 分割线 - 使用更通透的颜色
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tableX, tableY + tableHeaderHeight);
    ctx.lineTo(tableX + tableWidth, tableY + tableHeaderHeight);
    ctx.stroke();

    // 绘制数据行
    data.forEach((row, index) => {
        const rowY = tableY + tableHeaderHeight + index * rowHeight;
        
        // 斑马纹 - 改用非常透明的白色或黑色，以配合透明主题
        if (index % 2 === 1) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; // 偶数行轻微提亮
            if (index === data.length - 1) {
                ctx.beginPath();
                ctx.roundRect(tableX, rowY, tableWidth, rowHeight, [0, 0, 16, 16]);
                ctx.fill();
            } else {
                ctx.fillRect(tableX, rowY, tableWidth, rowHeight);
            }
        }

        columnSpecs.forEach(col => {
            ctx.textAlign = col.align || 'center';
            const textX = col.align === 'left' ? col.x + 40 : col.x + col.width / 2;
            const textY = rowY + rowHeight / 2;
            
            if (col.prop === 'rank') {
                const rank = index + 1;
                if (rank === 1) ctx.fillStyle = '#FF9E0F';
                else if (rank === 2) ctx.fillStyle = '#909399';
                else if (rank === 3) ctx.fillStyle = '#E6A23C';
                else ctx.fillStyle = '#606266';
                
                ctx.font = 'bold 30px "Orbitron", "Microsoft YaHei", sans-serif';
                ctx.fillText(rank, textX, textY + 2);
            } else if (col.isTeam || col.prop === 'team' || col.prop === 'teamName' || col.prop === 'playerName') {
                ctx.fillStyle = '#303133';
                ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
                
                // 固定文字起始位置，不再依赖图标宽度动态计算
                // 给图标预留 50px 的固定宽度，确保所有文字左对齐
                const fixedIconWidth = 50; 
                let textStartX = textX;
                let textContent = row[col.prop] || ''; // 提前定义 textContent
                
                if (col.align === 'left') {
                    // 左对齐模式：文字从 fixedIconWidth 处开始
                    textStartX = textX + fixedIconWidth;
                } else {
                    // 居中模式：先算好文字总宽度，再推算起始点，但要保证图标和文字整体视觉居中
                    const textWidth = ctx.measureText(textContent).width;
                    // 如果是居中对齐，我们让 (图标 + 固定间距 + 文字) 整体居中
                    const totalContentWidth = 36 + 15 + textWidth; // 假设图标宽36
                    // 重置 textStartX 为整体内容的左边缘 + 图标位移
                    // textX 是单元格中心
                    textStartX = textX - totalContentWidth / 2 + 36 + 15;
                }

                if (row.logo && loadedLogos[row.logo] && loadedLogos[row.logo].complete && loadedLogos[row.logo].naturalWidth > 0) {
                    const img = loadedLogos[row.logo];
                    const logoSize = 36;
                    const scale = Math.min(logoSize / img.naturalWidth, logoSize / img.naturalHeight);
                    const drawW = img.naturalWidth * scale;
                    const drawH = img.naturalHeight * scale;
                    
                    // 图标绘制位置：
                    // 左对齐：在 textX (单元格左侧padding后)
                    // 居中对齐：在 textStartX 左侧 15px 再减去图标宽度
                    let iconX = col.align === 'left' ? textX : (textStartX - 15 - drawW);
                    
                    // 为了让图标之间对齐，如果是左对齐模式，我们让图标在 0~50px 的区间内居中或者靠左
                    // 建议图标水平居中于它的 50px 占位区
                    if (col.align === 'left') {
                        iconX = textX + (fixedIconWidth - 15 - drawW) / 2; // 15是文字间距
                    }

                    // 图标垂直下移一点，微调视觉中心
                    const iconY = textY - drawH / 2 + 14;

                    ctx.drawImage(img, iconX, iconY, drawW, drawH);
                }

                ctx.textAlign = 'left'; // 统一用左对齐绘制文字，因为我们已经算好了 startX
                
                if (col.prop === 'playerName' && row.teamName) {
                    ctx.fillText(textContent, textStartX, textY - 8);
                    ctx.fillStyle = '#909399';
                    ctx.font = '18px "Inter", "Microsoft YaHei", sans-serif';
                    ctx.fillText(row.teamName, textStartX, textY + 16);
                } else {
                    ctx.fillText(textContent, textStartX, textY);
                }
            } else {
                ctx.fillStyle = '#303133';
                ctx.font = '24px "Inter", "Microsoft YaHei", sans-serif';
                
                if (col.highlight) {
                    ctx.fillStyle = '#FF9E0F';
                    ctx.font = 'bold 26px "Inter", "Microsoft YaHei", sans-serif';
                }
                
                ctx.fillText(row[col.prop] !== undefined ? row[col.prop] : '', textX, textY);
            }
        });

        if (index < data.length - 1) {
            ctx.strokeStyle = '#EBEEF5';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tableX, rowY + rowHeight);
            ctx.lineTo(tableX + tableWidth, rowY + rowHeight);
            ctx.stroke();
        }
    });

    return canvas.toDataURL('image/png');
  };

  const handleExportChart = async (chartInstance, seasonName = '', chartTitle = '') => {
    try {
      if (!chartInstance) {
        console.warn('Chart instance not found');
        return;
      }
      const url = await generateChartImage(chartInstance, seasonName, chartTitle);
      if (url) {
        previewImage.value = url;
        showPreview.value = true;
      }
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  const handleExportTable = async (tableTitle, columns, data, seasonName = '') => {
    try {
      if (!data || data.length === 0) {
        console.warn('No table data to export');
        return;
      }
      const url = await generateTableImage(tableTitle, columns, data, seasonName);
      if (url) {
        previewImage.value = url;
        showPreview.value = true;
      }
    } catch (e) {
      console.error('Table export failed:', e);
    }
  };

  return {
    showPreview,
    previewImage,
    handleExportChart,
    handleExportTable
  };
}
