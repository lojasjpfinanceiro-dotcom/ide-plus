// Números do início: funil convertidos → discipulado → batizados
const router = require('express').Router();
const db = require('../db');
const { autenticar, exigirNivel } = require('../auth');
const { escopoPessoa } = require('../acompanhamento');

router.use(autenticar, exigirNivel(1, 2, 3, 4));

router.get('/resumo', async (req, res) => {
  const u = req.usuario;
  const geral = u.nivel === 1; // fechamento geral soma sede + todas as cidades
  const e = escopoPessoa(u);
  const params = e.valores;
  const filtro = e.sql;

  // Etapa alcançada: para o afastado, vale a etapa em que ele estava quando se afastou
  const ALC = `CASE WHEN p.status = 'AFASTADO' THEN COALESCE(p.etapa_antes_afastar, 'CONVERTIDO') ELSE p.status END`;
  const funil = (await db.query(
    `SELECT COUNT(*)::int AS convertidos,
            COUNT(*) FILTER (WHERE ${ALC} IN ('DISCIPULADO','BATIZADO'))::int AS discipulados,
            COUNT(*) FILTER (WHERE ${ALC} = 'BATIZADO')::int AS batizados,
            COUNT(*) FILTER (WHERE p.status = 'AFASTADO')::int AS afastados,
            COUNT(*) FILTER (WHERE p.status = 'AFASTADO' AND ${ALC} = 'CONVERTIDO')::int AS afastados_convertidos,
            COUNT(*) FILTER (WHERE p.status = 'AFASTADO' AND ${ALC} = 'DISCIPULADO')::int AS afastados_discipulado,
            COUNT(*) FILTER (WHERE p.status = 'AFASTADO' AND ${ALC} = 'BATIZADO')::int AS afastados_batizados,
            COUNT(*) FILTER (WHERE p.data_conversao >= date_trunc('month', CURRENT_DATE))::int AS convertidos_mes,
            COUNT(*) FILTER (WHERE p.data_batismo >= date_trunc('month', CURRENT_DATE))::int AS batizados_mes,
            COUNT(*) FILTER (WHERE p.data_afastamento >= date_trunc('month', CURRENT_DATE))::int AS afastados_mes
       FROM pessoas p WHERE ${filtro}`, params)).rows[0];

  const porCidade = geral ? (await db.query(
    `SELECT c.id, c.nome, c.estado, c.is_sede,
            (SELECT COUNT(*) FROM congregacoes g WHERE g.cidade_id = c.id)::int AS congregacoes,
            COUNT(p.id)::int AS convertidos,
            COUNT(p.id) FILTER (WHERE ${ALC} IN ('DISCIPULADO','BATIZADO'))::int AS discipulados,
            COUNT(p.id) FILTER (WHERE ${ALC} = 'BATIZADO')::int AS batizados,
            COUNT(p.id) FILTER (WHERE p.status = 'AFASTADO')::int AS afastados
       FROM cidades c LEFT JOIN pessoas p ON p.cidade_id = c.id
      WHERE c.denominacao_id = $1
      GROUP BY c.id ORDER BY c.is_sede DESC, convertidos DESC, c.nome`, [u.denominacao_id])).rows : [];

  const mensal = (await db.query(
    `SELECT to_char(m, 'YYYY-MM') AS mes,
            (SELECT COUNT(*) FROM pessoas p WHERE ${filtro} AND date_trunc('month', p.data_conversao) = m)::int AS convertidos,
            (SELECT COUNT(*) FROM pessoas p WHERE ${filtro} AND date_trunc('month', p.data_batismo) = m)::int AS batizados,
            (SELECT COUNT(*) FROM pessoas p WHERE ${filtro} AND date_trunc('month', p.data_afastamento) = m)::int AS afastados
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
    params.slice(0,2))).rows[0];

  res.json({ escopo: geral ? 'geral' : 'cidade', funil, porCidade, mensal, estrutura });
});

// Primeiros passos: a ordem certa de configuração, conforme o que já foi feito
router.get('/passos', async (req, res) => {
  const u = req.usuario;
  const q = async (sql, params) => (await db.query(sql, params)).rows[0].n;
  const D = u.denominacao_id, C = u.cidade_id;
  let passos = [];

  if (u.nivel === 1) {
    const den = (await db.query('SELECT logo FROM denominacoes WHERE id = $1', [D])).rows[0];
    const sede = await q('SELECT COUNT(*)::int n FROM cidades WHERE denominacao_id = $1 AND is_sede', [D]);
    const congs = await q('SELECT COUNT(*)::int n FROM congregacoes WHERE denominacao_id = $1', [D]);
    const chegou = await q(`SELECT COUNT(*)::int n FROM config_itens WHERE denominacao_id = $1 AND cidade_id IS NULL AND tipo = 'COMO_CHEGOU' AND ativo`, [D]);
    const cargos = await q('SELECT COUNT(*)::int n FROM cargos WHERE denominacao_id = $1', [D]);
    const cidadesOutras = await q('SELECT COUNT(*)::int n FROM cidades WHERE denominacao_id = $1 AND NOT is_sede', [D]);
    const pastores = await q('SELECT COUNT(*)::int n FROM usuarios WHERE denominacao_id = $1 AND nivel = 2', [D]);
    const semPastor = await q('SELECT COUNT(*)::int n FROM cidades WHERE denominacao_id = $1 AND NOT is_sede AND responsavel_id IS NULL', [D]);
    const pessoas = await q('SELECT COUNT(*)::int n FROM pessoas WHERE denominacao_id = $1', [D]);
    passos = [
      { id: 'denominacao', titulo: 'Personalize a denominação', texto: 'Confira o nome e envie o logotipo. Ele aparece no topo do app para todos.', rota: 'estrutura', feito: !!den?.logo, opcional: true },
      { id: 'sede', titulo: 'Cadastre a cidade da igreja sede', texto: 'É a sua cidade. Sem ela não dá para cadastrar pessoas nem congregações.', rota: 'estrutura', feito: sede > 0 },
      { id: 'congregacoes', titulo: 'Cadastre as congregações', texto: 'Comece pela sede e depois as demais, cada uma na sua cidade. Cada convertido é ligado a uma congregação.', rota: 'estrutura', feito: congs > 0, depende: 'sede' },
      { id: 'como_chegou', titulo: 'Defina as opções de “Como chegou”', texto: 'Ex.: culto evangelístico, convite de amigo, campanha. Aparecem no cadastro de cada convertido.', rota: 'configuracoes', feito: chegou > 0 },
      { id: 'cargos', titulo: 'Crie os cargos', texto: 'Com os nomes que a sua igreja usa (ex.: Superintendente, Professor). Os cargos definem o que cada pessoa pode fazer.', rota: 'cargos', feito: cargos > 0 },
      { id: 'pastores', titulo: 'Cadastre os pastores locais (Nível 2)', texto: 'Em Usuários, com login e senha. Só depois é possível vinculá-los às cidades.', rota: 'usuarios', feito: pastores > 0, opcional: cidadesOutras === 0, depende: 'sede' },
      { id: 'vincular', titulo: 'Vincule cada cidade ao seu pastor local', texto: 'Em Estrutura → Alterar cidade. Congregações sem responsável aparecem em laranja.', rota: 'estrutura', feito: cidadesOutras > 0 && semPastor === 0, opcional: cidadesOutras === 0, depende: 'pastores' },
      { id: 'pessoas', titulo: 'Cadastre o primeiro convertido', texto: 'Pronto: a partir daqui o funil do Início começa a mostrar os números.', rota: 'pessoas', feito: pessoas > 0, depende: 'congregacoes' }
    ];
  } else if (u.nivel === 2) {
    const congs = await q('SELECT COUNT(*)::int n FROM congregacoes WHERE cidade_id = $1', [C]);
    const semDir = await q('SELECT COUNT(*)::int n FROM congregacoes WHERE cidade_id = $1 AND dirigente_id IS NULL', [C]);
    const cfg = await q('SELECT COUNT(*)::int n FROM config_itens WHERE cidade_id = $1', [C]);
    const cargos = await q('SELECT COUNT(*)::int n FROM cargos WHERE cidade_id = $1', [C]);
    const equipe = await q('SELECT COUNT(*)::int n FROM usuarios WHERE cidade_id = $1 AND nivel > 2', [C]);
    const pessoas = await q('SELECT COUNT(*)::int n FROM pessoas WHERE cidade_id = $1', [C]);
    passos = [
      { id: 'configuracoes', titulo: 'Revise as configurações da cidade', texto: 'Você recebe o padrão da denominação. Desative o que não usa e acrescente as suas opções.', rota: 'configuracoes', feito: cfg > 0, opcional: true },
      { id: 'cargos', titulo: 'Crie os cargos da sua equipe', texto: 'Se os cargos padrão não bastarem, crie os seus para os níveis 3 e 4.', rota: 'cargos', feito: cargos > 0, opcional: true },
      { id: 'equipe', titulo: 'Cadastre os coordenadores e a equipe', texto: 'Em Usuários. Eles precisam estar cadastrados antes de virarem dirigentes.', rota: 'usuarios', feito: equipe > 0 },
      { id: 'dirigentes', titulo: 'Defina os dirigentes das congregações', texto: congs ? 'Em Congregações → Dirigente.' : 'O Nível 1 ainda não cadastrou congregações na sua cidade.', rota: 'estrutura', feito: congs > 0 && semDir === 0, depende: 'equipe' },
      { id: 'pessoas', titulo: 'Cadastre os convertidos', texto: 'Cada convertido fica ligado a uma congregação da sua cidade.', rota: 'pessoas', feito: pessoas > 0 }
    ];
  } else if (u.nivel === 3) {
    const equipe = await q('SELECT COUNT(*)::int n FROM usuarios WHERE cidade_id = $1 AND nivel = 4', [C]);
    const pessoas = await q('SELECT COUNT(*)::int n FROM pessoas WHERE cidade_id = $1 AND criado_por = $2', [C, u.id]);
    passos = [
      { id: 'equipe', titulo: 'Cadastre a sua equipe (Nível 4)', texto: 'Em Minha equipe. Use “Acessos” para marcar o que cada um pode fazer.', rota: 'usuarios', feito: equipe > 0 },
      { id: 'pessoas', titulo: 'Cadastre os convertidos', texto: 'Cada convertido fica ligado a uma congregação da sua cidade.', rota: 'pessoas', feito: pessoas > 0 }
    ];
  }

  const feitos = passos.filter(p => p.feito).length;
  const proximo = passos.find(p => !p.feito && !p.opcional) || passos.find(p => !p.feito);
  res.json({ passos, feitos, total: passos.length, proximo: proximo?.id || null,
    concluido: passos.every(p => p.feito || p.opcional) });
});

module.exports = router;
