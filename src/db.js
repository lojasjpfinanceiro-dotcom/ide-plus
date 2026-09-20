const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PG_POOL_MAX || 5),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  allowExitOnIdle: false
});

pool.on('error', (err) => {
  console.error('[DB] erro em conexão ociosa:', err && (err.stack || err.message || err));
});

const queryOriginal = pool.query.bind(pool);
pool.query = async (...args) => {
  const inicio = Date.now();
  try {
    return await queryOriginal(...args);
  } catch (err) {
    console.error('[DB] query falhou após '+(Date.now()-inicio)+'ms:', err && (err.stack || err.message || err));
    throw err;
  }
};

module.exports = pool;
