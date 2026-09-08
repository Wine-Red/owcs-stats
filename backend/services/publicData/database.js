const mysql = require('mysql2/promise');
const { unavailable } = require('./errors');

// Independent small read pool; no model initialization, migrations or sync jobs.
const createReadDatabase = (options = {}) => {
  let pool;
  const getPool = () => (pool ||= mysql.createPool({
    host: process.env.DATA_API_DB_HOST || process.env.DB_HOST,
    port: Number(process.env.DATA_API_DB_PORT || process.env.DB_PORT || 3306),
    user: process.env.DATA_API_DB_USER || process.env.DB_USER,
    password: process.env.DATA_API_DB_PASSWORD ?? process.env.DB_PASSWORD,
    database: process.env.DATA_API_DB_NAME || process.env.DB_NAME,
    connectionLimit: 3, waitForConnections: true, queueLimit: 24,
    connectTimeout: 5000, dateStrings: true, supportBigNumbers: true,
    bigNumberStrings: true, charset: 'utf8mb4', multipleStatements: false,
    ...options
  }));
  const snapshot = async work => {
    let connection;
    let reusable = false;
    let timer;
    let timedOut = false;
    try {
      connection = await getPool().getConnection();
      timer = setTimeout(() => { timedOut = true; connection.destroy(); }, 15000);
      await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      const select = async (sql, values = []) => {
        if (!/^SELECT\s/i.test(sql)) throw new Error('Public data queries must be SELECT statements.');
        const [rows] = await connection.execute({ sql, values, timeout: 10000 });
        return rows;
      };
      const result = await work(select);
      await connection.rollback();
      reusable = true;
      return result;
    } catch (error) {
      if (connection && !timedOut) {
        try { await connection.rollback(); reusable = true; } catch (_rollbackError) { /* destroy below */ }
      }
      if (error.status) throw error;
      throw unavailable(`Database read failed: ${error.code || error.message}`);
    } finally {
      clearTimeout(timer);
      if (connection && !timedOut) {
        if (reusable) connection.release();
        else connection.destroy();
      }
    }
  };
  return { snapshot, close: async () => { if (pool) await pool.end(); } };
};

module.exports = { createReadDatabase };
