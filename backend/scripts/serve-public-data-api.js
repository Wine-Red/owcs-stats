// Standalone local read-only entrypoint. Never calls initDatabase/startServer.
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const express = require('express');
const helmet = require('helmet');
const { createPublicDataService } = require('../services/publicData/service');
const { createDataRouter } = require('../routes/data-v1');

const service = createPublicDataService();
const app = express();
app.use(helmet());
app.use('/data/v1', createDataRouter({ service }));
const port = Number(process.env.DATA_API_PORT || 3100);
const server = app.listen(port, '127.0.0.1', () => console.log(`Read-only data API: http://127.0.0.1:${port}/data/v1/competitions`));
const close = () => server.close(async () => { await service.database.close(); });
process.once('SIGTERM', close);
process.once('SIGINT', close);
