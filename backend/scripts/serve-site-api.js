// Local read-only verification: no schema initialization, sync jobs or vote writes.
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
process.env.NODE_ENV = 'production';
const { setupAssociations } = require('../database');
setupAssociations();
const app = require('../app');
// The production gateway rewrites this public prefix to /api/site/v1.
const express = require('express');
const server = express();
server.use('/public-api/site/v1', require('../routes/site-v1').createSiteRouter());
server.use(app);
server.listen(Number(process.env.OWCS_SITE_PORT || 4180), '127.0.0.1', () => console.log('Read-only site API preview ready on port', process.env.OWCS_SITE_PORT || 4180));
