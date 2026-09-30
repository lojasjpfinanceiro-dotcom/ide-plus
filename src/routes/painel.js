// Números do início: funil convertidos → discipulado → batizados
const router = require('express').Router();
const db = require('../db');
const { autenticar, exigirNivel } = require('../auth');

router.use(autenticar, exigirNivel(1, 2, 3, 4));

router.get('/resumo', async (req, res) => {
  const u = req.usuario;
  const geral = u.nivel === 1; // fechamento geral soma sede + todas as cidades
  const params = [u.denominacao_id, geral ? null : u.cidade_id];
  const filtro = 'p.denominacao_id = $1 AND ($2::bigint IS NULL OR p.cidade_id = $2)';

  // "Discipulados" e "batizados" contam quem já passou pela etapa
  const funil = (await db.query(
    `SELECT COUNT(*)::int AS convertidos,
            COUNT(*) FILTER (WHERE status IN ('DISCIPULADO','BATIZADO'))::int AS discipulados,
            COUNT(*) FILTER (WHERE status = 'BATIZADO')::int AS batizados,
            COUNT(*) FILTER (WHERE data_conversao >= date_trunc('month', CURRENT_DATE))::int AS convertidos_mes,
            COUNT(*) FILTER (WHERE data_batismo >= date_trunc('month', CURRENT_DATE))::int AS batizados_mes
       FROM pessoas p WHERE ${filtro}`, params)).rows[0];

  const porCidade = geral ? (await db.query(
    `SELECT c.id, c.nome, c.estado, c.is_sede,
            (SELECT COUNT(*) FROM congregacoes g WHERE g.cidade_id = c.id)::int AS congregacoes,
            COUNT(p.id)::int AS convertidos,
            COUNT(p.id) FILTER (WHERE p.status IN ('DISCIPULADO','BATIZADO'))::int AS discipulados,
            COUNT(p.id) FILTER (WHERE p.status = 'BATIZADO')::int AS batizados
       FROM cidades c LEFT JOIN pessoas p ON p.cidade_id = c.id
      WHERE c.denominacao_id = $1
      GROUP BY c.id ORDER BY c.is_sede DESC, convertidos DESC, c.nome`, [u.denominacao_id])).rows : [];

  const mensal = (await db.query(
    `SELECT to_char(m, 'YYYY-MM') AS mes,
            (SELECT COUNT(*) FROM pessoas p WHERE ${filtro} AND date_trunc('month', p.data_conversao) = m)::int AS convertidos,
            (SELECT COUNT(*) FROM pessoas p WHERE ${filtro} AND date_trunc('month', p.data_batismo) = m)::int AS batizados
       FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '11 months', date_trunc('month', CURRENT_DATE), INTERVAL '1 month') m
      ORDER BY m`, params)).rows;

  const estrutura = (await db.query(
    `SELECT (SELECT COUNT(*) FROM cidades WHERE denominacao_id = $1 AND ($2::bigint IS NULL OR id = $2))::int AS cidades,
            (SELECT COUNT(*) FROM congregacoes WHERE denominacao_id = $1 AND ($2::bigint IS NULL OR cidade_id = $2))::int AS congregacoes,
            (SELECT COUNT(*) FROM congregacoes g JOIN cidades c ON c.id = g.cidade_id
              WHERE g.denominacao_id = $1 AND ($2::bigint IS NULL OR g.cidade_id = $2)
                AND g.responsavel_id IS NULL AND NOT (c.responsavel_todas AND c.responsavel_id IS NOT NULL)
                AND NOT (c.is_sede AND g.is_sede))::int AS aguardando_responsavel,
            (SELECT COUNT(*) FROM usuarios WHERE denominacao_id = $1 AND ($2::bigint IS NULL OR cidade_id = $2))::int AS usuarios`,
    params)).rows[0];

  res.json({ escopo: geral ? 'geral' : 'cidade', funil, porCidade, mensal, estrutura });
});

module.exports = router;
