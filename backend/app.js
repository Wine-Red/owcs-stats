const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const MatchController = require('./controllers/MatchController');
const { getMediaRoot } = require('./services/MediaStorageService');

// 加载环境变量
dotenv.config();

const getMediaFallbackOrigin = () => {
  const source = String(process.env.MEDIA_FALLBACK_ORIGIN || '').trim();
  if (!source) return '';
  const url = new URL(source);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('MEDIA_FALLBACK_ORIGIN must use HTTP or HTTPS');
  }
  return url.origin;
};

// 初始化Express应用
const app = express();

// 中间件配置
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/media', express.static(getMediaRoot(), {
  dotfiles: 'deny',
  etag: true,
  immutable: true,
  index: false,
  maxAge: '30d'
}));

const mediaFallbackOrigin = getMediaFallbackOrigin();
if (mediaFallbackOrigin) {
  app.use('/media', (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    const target = new URL(req.originalUrl, `${mediaFallbackOrigin}/`);
    return res.redirect(307, target.href);
  });
}

// 数据库初始化
const { initDatabase } = require('./database');

// 路由配置
const apiRoutes = require('./routes/api');
const agentApiRoutes = require('./routes/agent-v1');
app.use('/api', apiRoutes);
app.use('/agent/v1', agentApiRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// 错误处理中间件
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err?.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image exceeds the 8 MB limit' : err.message;
    return res.status(400).json({ error: message });
  }
  if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message });
  console.error(err.stack);
  return res.status(500).json({ error: 'Internal Server Error' });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
const MATCH_SYNC_INTERVAL_MS = 5 * 60 * 1000;

const startMatchSyncPolling = () => {
  const runSync = async () => {
    try {
      const result = await MatchController.runExternalMatchSync({ source: 'scheduler' });
      if (!result?.data?.skipped) {
        console.log(`[match-sync] ${result.message}`);
      }
    } catch (error) {
      console.error('[match-sync] 自动同步失败:', error.message);
    }
  };

  runSync();
  setInterval(runSync, MATCH_SYNC_INTERVAL_MS);
};

const startServer = async () => {
  try {
    // 初始化数据库
    await initDatabase();
    
    // 启动服务器
    app.listen(PORT, () => {
      console.log(`服务器运行在 http://localhost:${PORT}`);
      startMatchSyncPolling();
    });
  } catch (error) {
    console.error('服务器启动失败:', error);
    process.exit(1);
  }
};

// 启动服务器；测试或其他模块引用 app 时不自动监听端口。
if (require.main === module) startServer();

module.exports = app;
