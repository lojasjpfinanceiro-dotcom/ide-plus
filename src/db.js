const { Pool, types } = require('pg');

types.setTypeParser(1082, (v) => v); // DATE como 'AAAA-MM-DD', sem fuso

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PG_POOL_MAX || 5),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true
});

pool.on('error', (err) => console.error('[DB] erro em conexão ociosa:', err.message));

module.exports = pool;
