// Países, estados e cidades para os campos de seleção
const router = require('express').Router();
const db = require('../db');
const { autenticar } = require('../auth');

router.use(autenticar, (req, res, next) => { res.set('Cache-Control', 'private, max-age=86400'); next(); });

router.get('/paises', async (req, res) => {
  const { rows } = await db.query(
    `SELECT codigo, nome FROM geo_paises ORDER BY (codigo = 'BR') DESC, nome`);
  res.json(rows);
});

router.get('/estados', async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, codigo, nome FROM geo_estados WHERE pais = $1 ORDER BY nome', [String(req.query.pais || 'BR').toUpperCase()]);
  res.json(rows);
});

router.get('/cidades', async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, nome FROM geo_cidades WHERE estado_id = $1 ORDER BY nome', [Number(req.query.estado_id) || 0]);
  res.json(rows);
});

module.exports = router;
