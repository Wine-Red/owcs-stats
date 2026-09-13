import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSettings } from './settings.js';
import { createDataClient } from './data.js';
import { createWiki } from './wiki.js';
import { createApp } from './app.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const settings = createSettings(path.join(root, '.local/assistant'));
const client = createDataClient({ baseUrl: process.env.ASSISTANT_DATA_URL || 'https://stats.owmini.xyz/data/v1',
  displayBaseUrl: process.env.ASSISTANT_DISPLAY_URL });
const port = Number(process.env.ASSISTANT_PORT || 4330);
const app = createApp({ settings, client, wiki: createWiki(),
  ...(process.env.ASSISTANT_ORIGINS ? { allowedOrigins: process.env.ASSISTANT_ORIGINS.split(',') } : {}) });
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Assistant: http://127.0.0.1:${port}/assistant/v1/admin`);
});
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
