// Discipulado — currículos, módulos e lições.
// Nível 1 monta o currículo padrão da denominação. As cidades (Nível 2, ou quem tiver a
// permissão "discipulado.curriculo") desativam o padrão, criam os seus ou copiam o padrão para adaptar.
// Todos os níveis podem consultar os currículos ativos (o professor precisa ver as lições).
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../db');
const { autenticar, pode } = require('../auth');

const SEGREDO = () => process.env.JWT_SECRET || 'dev-inseguro';
const TIPOS_ARQUIVO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_ARQUIVO = 15 * 1024 * 1024;

// Arquivo aberto em nova aba por um link temporário (sem cabeçalho de login)
router.get('/arquivos/:id/ver', async (req, res) => {
  let dados;
  try { dados = jwt.verify(String(req.query.t || ''), SEGREDO()); } catch { return res.status(401).send('Link expirado. Abra de novo pelo app.'); }
  if (String(dados.arq) !== String(req.params.id)) return res.status(401).send('Link inválido.');
  const a = (await db.query('SELECT nome, tipo, dados FROM arquivos WHERE id = $1', [req.params.id])).rows[0];
  if (!a) return res.status(404).send('Arquivo não encontrado.');
  res.set('Content-Type', a.tipo);
  res.set('Content-Disposition', `inline; filename="${encodeURIComponent(a.nome)}"`);
  res.set('Cache-Control', 'private, max-age=600');
  res.send(a.dados);
});

router.use(autenticar);

// ---------------- Regras de escopo ----------------
async function carregarCurriculo(u, id) {
  const c = (await db.query('SELECT * FROM curriculos WHERE id = $1 AND denominacao_id = $2', [id, u.denominacao_id])).rows[0];
  if (!c) return null;
  if (c.cidade_id === null) return c;
  return u.nivel > 1 && String(c.cidade_id) === String(u.cidade_id) ? c : null;
}

function podeEscrever(u, c) {
  if (u.nivel === 1) return c.cidade_id === null;
  return c.cidade_id !== null && String(c.cidade_id) === String(u.cidade_id) && pode(u, 'discipulado.curriculo');
}

const podeCriar = (u) => u.nivel === 1 || (u.nivel > 1 && !!u.cidade_id && pode(u, 'discipulado.curriculo'));

function negar(res, msg = 'Você não pode alterar este currículo.') { return res.status(403).json({ erro: msg }); }

const inteiro = (v, min, max, pad) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : pad;
};

// Perguntas: [{ pergunta, opcoes: [..], correta: índice }]
function limparPerguntas(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.map((p) => ({
    pergunta: String(p.pergunta || '').trim().slice(0, 500),
    opcoes: (Array.isArray(p.opcoes) ? p.opcoes : []).map((o) => String(o).trim().slice(0, 300)).filter(Boolean).slice(0, 6),
    correta: Number.isInteger(p.correta) ? p.correta : 0
  })).filter((p) => p.pergunta && p.opcoes.length >= 2).map((p) => ({ ...p, correta: p.correta < p.opcoes.length ? p.correta : 0 }));
}

// ---------------- Currículos ----------------
router.get('/curriculos', async (req, res) => {
  const u = req.usuario;
  const cidade = u.nivel > 1 ? u.cidade_id : null;
  const { rows } = await db.query(
    `SELECT c.*, (c.cidade_id IS NULL) AS padrao, (dz.curriculo_id IS NOT NULL) AS desativado_na_cidade,
            (SELECT COUNT(*) FROM modulos m WHERE m.curriculo_id = c.id)::int AS modulos,
            (SELECT COUNT(*) FROM licoes l JOIN modulos m ON m.id = l.modulo_id WHERE m.curriculo_id = c.id)::int AS licoes
       FROM curriculos c
       LEFT JOIN curriculo_desativados dz ON dz.curriculo_id = c.id AND dz.cidade_id = $2
      WHERE c.denominacao_id = $1 AND (c.cidade_id IS NULL OR ($3 > 1 AND c.cidade_id = $2))
      ORDER BY (c.cidade_id IS NULL) DESC, c.nome`, [u.denominacao_id, cidade, u.nivel]);
  const gerencia = u.nivel <= 2 || pode(u, 'discipulado.curriculo');
  const lista = rows.map((r) => ({ ...r, editavel: podeEscrever(u, r) }));
  res.json({
    pode_criar: podeCriar(u),
    curriculos: gerencia ? lista : lista.filter((r) => r.ativo && !r.desativado_na_cidade)
  });
});

router.get('/curriculos/:id', async (req, res) => {
  const u = req.usuario;
  const c = await carregarCurriculo(u, req.params.id);
  if (!c) return res.status(404).json({ erro: 'Currículo não encontrado.' });
  const modulos = (await db.query('SELECT * FROM modulos WHERE curriculo_id = $1 ORDER BY ordem, id', [c.id])).rows;
  const licoes = (await db.query(
    `SELECT l.id, l.modulo_id, l.ordem, l.titulo, l.objetivo, l.versiculos, l.resumo, l.video_url, l.slides_url,
            l.slides_arquivo_id, a.nome AS slides_nome, l.perguntas
       FROM licoes l JOIN modulos m ON m.id = l.modulo_id
       LEFT JOIN arquivos a ON a.id = l.slides_arquivo_id
      WHERE m.curriculo_id = $1 ORDER BY l.ordem, l.id`, [c.id])).rows;
  modulos.forEach((m) => (m.licoes = licoes.filter((l) => String(l.modulo_id) === String(m.id))));
  res.json({ ...c, padrao: c.cidade_id === null, editavel: podeEscrever(u, c), modulos });
});

function dadosCurriculo(b, atual = {}) {
  return {
    nome: String(b.nome ?? atual.nome ?? '').trim(),
    descricao: b.descricao ?? atual.descricao ?? null,
    frequencia_minima: inteiro(b.frequencia_minima, 0, 100, atual.frequencia_minima ?? 75),
    nota_minima: inteiro(b.nota_minima, 0, 100, atual.nota_minima ?? 70),
    tentativas_prova: inteiro(b.tentativas_prova, 1, 10, atual.tentativas_prova ?? 2),
    ativo: typeof b.ativo === 'boolean' ? b.ativo : (atual.ativo ?? true)
  };
}

router.post('/curriculos', async (req, res) => {
  const u = req.usuario;
  if (!podeCriar(u)) return negar(res, 'Você não tem permissão para montar currículos.');
  const d = dadosCurriculo(req.body);
  if (!d.nome) return res.status(400).json({ erro: 'Informe o nome do currículo.' });
  const { rows } = await db.query(
    `INSERT INTO curriculos (denominacao_id, cidade_id, nome, descricao, frequencia_minima, nota_minima, tentativas_prova, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [u.denominacao_id, u.nivel === 1 ? null : u.cidade_id, d.nome, d.descricao, d.frequencia_minima, d.nota_minima, d.tentativas_prova, u.id]);
  res.status(201).json(rows[0]);
});

router.put('/curriculos/:id', async (req, res) => {
  const u = req.usuario;
  const c = await carregarCurriculo(u, req.params.id);
  if (!c) return res.status(404).json({ erro: 'Currículo não encontrado.' });
  if (!podeEscrever(u, c)) return negar(res, 'Currículo padrão: você pode desativá-lo na sua cidade ou copiá-lo para adaptar.');
  const d = dadosCurriculo(req.body, c);
  if (!d.nome) return res.status(400).json({ erro: 'Informe o nome do currículo.' });
  await db.query(
    `UPDATE curriculos SET nome=$1, descricao=$2, frequencia_minima=$3, nota_minima=$4, tentativas_prova=$5, ativo=$6 WHERE id=$7`,
    [d.nome, d.descricao, d.frequencia_minima, d.nota_minima, d.tentativas_prova, d.ativo, c.id]);
  res.json({ ok: true });
});

router.delete('/curriculos/:id', async (req, res) => {
  const u = req.usuario;
  const c = await carregarCurriculo(u, req.params.id);
  if (!c) return res.status(404).json({ erro: 'Currículo não encontrado.' });
  if (!podeEscrever(u, c)) return negar(res, 'Você só exclui currículos que você mesmo criou.');
  await db.query('DELETE FROM curriculos WHERE id = $1', [c.id]);
  res.json({ ok: true });
});

// Cidade liga/desliga o currículo padrão
router.post('/curriculos/:id/cidade', async (req, res) => {
  const u = req.usuario;
  const c = await carregarCurriculo(u, req.params.id);
  if (!c || c.cidade_id !== null || u.nivel < 2) return res.status(404).json({ erro: 'Currículo padrão não encontrado.' });
  if (!pode(u, 'discipulado.curriculo')) return negar(res, 'Você não tem permissão para montar currículos.');
  if (req.body.ativo === false) {
    await db.query('INSERT INTO curriculo_desativados VALUES ($1,$2) ON CONFLICT DO NOTHING', [c.id, u.cidade_id]);
  } else {
    await db.query('DELETE FROM curriculo_desativados WHERE curriculo_id = $1 AND cidade_id = $2', [c.id, u.cidade_id]);
  }
  res.json({ ok: true });
});

// Copia um currículo (com módulos e lições) para a cidade, para adaptar
router.post('/curriculos/:id/copiar', async (req, res) => {
  const u = req.usuario;
  const c = await carregarCurriculo(u, req.params.id);
  if (!c) return res.status(404).json({ erro: 'Currículo não encontrado.' });
  if (!podeCriar(u)) return negar(res, 'Você não tem permissão para montar currículos.');
  const cx = await db.connect();
  try {
    await cx.query('BEGIN');
    const novo = (await cx.query(
      `INSERT INTO curriculos (denominacao_id, cidade_id, nome, descricao, frequencia_minima, nota_minima, tentativas_prova, copiado_de, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [u.denominacao_id, u.nivel === 1 ? null : u.cidade_id, `${c.nome} (cópia)`, c.descricao,
       c.frequencia_minima, c.nota_minima, c.tentativas_prova, c.id, u.id])).rows[0];
    const mods = (await cx.query('SELECT * FROM modulos WHERE curriculo_id = $1 ORDER BY ordem, id', [c.id])).rows;
    for (const m of mods) {
      const nm = (await cx.query('INSERT INTO modulos (curriculo_id, ordem, nome, descricao) VALUES ($1,$2,$3,$4) RETURNING id',
        [novo.id, m.ordem, m.nome, m.descricao])).rows[0];
      await cx.query(
        `INSERT INTO licoes (denominacao_id, cidade_id, modulo_id, ordem, titulo, objetivo, versiculos, resumo, video_url,
                             slides_url, slides_arquivo_id, perguntas, criado_por)
         SELECT denominacao_id, $2, $3, ordem, titulo, objetivo, versiculos, resumo, video_url,
                slides_url, slides_arquivo_id, perguntas, $4 FROM licoes WHERE modulo_id = $1`,
        [m.id, novo.cidade_id, nm.id, u.id]);
    }
    await cx.query('COMMIT');
    res.status(201).json(novo);
  } catch (e) { await cx.query('ROLLBACK'); throw e; } finally { cx.release(); }
});

// ---------------- Módulos ----------------
async function carregarModulo(u, id) {
  const m = (await db.query('SELECT * FROM modulos WHERE id = $1', [id])).rows[0];
  if (!m) return null;
  const c = await carregarCurriculo(u, m.curriculo_id);
  return c ? { m, c } : null;
}

router.post('/curriculos/:id/modulos', async (req, res) => {
  const u = req.usuario;
  const c = await carregarCurriculo(u, req.params.id);
  if (!c) return res.status(404).json({ erro: 'Currículo não encontrado.' });
  if (!podeEscrever(u, c)) return negar(res);
  const nome = String(req.body.nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'Informe o nome do módulo.' });
  const ordem = req.body.ordem ? inteiro(req.body.ordem, 1, 999, 1)
    : (await db.query('SELECT COALESCE(MAX(ordem),0)+1 AS n FROM modulos WHERE curriculo_id = $1', [c.id])).rows[0].n;
  const { rows } = await db.query('INSERT INTO modulos (curriculo_id, ordem, nome, descricao) VALUES ($1,$2,$3,$4) RETURNING *',
    [c.id, ordem, nome, req.body.descricao || null]);
  res.status(201).json(rows[0]);
});

router.put('/modulos/:id', async (req, res) => {
  const r = await carregarModulo(req.usuario, req.params.id);
  if (!r) return res.status(404).json({ erro: 'Módulo não encontrado.' });
  if (!podeEscrever(req.usuario, r.c)) return negar(res);
  const nome = String(req.body.nome || r.m.nome).trim();
  await db.query('UPDATE modulos SET nome=$1, descricao=$2, ordem=$3 WHERE id=$4',
    [nome, req.body.descricao ?? r.m.descricao, inteiro(req.body.ordem, 1, 999, r.m.ordem), r.m.id]);
  res.json({ ok: true });
});

router.delete('/modulos/:id', async (req, res) => {
  const r = await carregarModulo(req.usuario, req.params.id);
  if (!r) return res.status(404).json({ erro: 'Módulo não encontrado.' });
  if (!podeEscrever(req.usuario, r.c)) return negar(res);
  await db.query('DELETE FROM modulos WHERE id = $1', [r.m.id]);
  res.json({ ok: true });
});

// ---------------- Lições ----------------
async function dadosLicao(u, b, atual = {}) {
  let slides = b.slides_arquivo_id === undefined ? atual.slides_arquivo_id ?? null : (b.slides_arquivo_id || null);
  if (slides) {
    const ok = (await db.query('SELECT 1 FROM arquivos WHERE id = $1 AND denominacao_id = $2', [slides, u.denominacao_id])).rowCount;
    if (!ok) slides = null;
  }
  const txt = (k) => (b[k] === undefined ? atual[k] ?? null : (String(b[k] || '').trim() || null));
  return {
    titulo: String(b.titulo ?? atual.titulo ?? '').trim(),
    ordem: inteiro(b.ordem, 1, 999, atual.ordem ?? null),
    objetivo: txt('objetivo'), versiculos: txt('versiculos'), resumo: txt('resumo'),
    video_url: txt('video_url'), slides_url: txt('slides_url'), slides_arquivo_id: slides,
    perguntas: JSON.stringify(b.perguntas === undefined ? atual.perguntas || [] : limparPerguntas(b.perguntas))
  };
}

router.post('/modulos/:id/licoes', async (req, res) => {
  const u = req.usuario;
  const r = await carregarModulo(u, req.params.id);
  if (!r) return res.status(404).json({ erro: 'Módulo não encontrado.' });
  if (!podeEscrever(u, r.c)) return negar(res);
  const d = await dadosLicao(u, req.body);
  if (!d.titulo) return res.status(400).json({ erro: 'Informe o tema da lição.' });
  if (!d.ordem) d.ordem = (await db.query('SELECT COALESCE(MAX(ordem),0)+1 AS n FROM licoes WHERE modulo_id = $1', [r.m.id])).rows[0].n;
  const { rows } = await db.query(
    `INSERT INTO licoes (denominacao_id, cidade_id, modulo_id, ordem, titulo, objetivo, versiculos, resumo, video_url,
                         slides_url, slides_arquivo_id, perguntas, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [u.denominacao_id, r.c.cidade_id, r.m.id, d.ordem, d.titulo, d.objetivo, d.versiculos, d.resumo, d.video_url,
     d.slides_url, d.slides_arquivo_id, d.perguntas, u.id]);
  res.status(201).json(rows[0]);
});

async function carregarLicao(u, id) {
  const l = (await db.query('SELECT * FROM licoes WHERE id = $1 AND denominacao_id = $2', [id, u.denominacao_id])).rows[0];
  if (!l || !l.modulo_id) return null;
  const r = await carregarModulo(u, l.modulo_id);
  return r ? { l, ...r } : null;
}

router.put('/licoes/:id', async (req, res) => {
  const u = req.usuario;
  const r = await carregarLicao(u, req.params.id);
  if (!r) return res.status(404).json({ erro: 'Lição não encontrada.' });
  if (!podeEscrever(u, r.c)) return negar(res);
  const d = await dadosLicao(u, req.body, r.l);
  if (!d.titulo) return res.status(400).json({ erro: 'Informe o tema da lição.' });
  await db.query(
    `UPDATE licoes SET ordem=$1, titulo=$2, objetivo=$3, versiculos=$4, resumo=$5, video_url=$6, slides_url=$7,
                       slides_arquivo_id=$8, perguntas=$9 WHERE id=$10`,
    [d.ordem || r.l.ordem, d.titulo, d.objetivo, d.versiculos, d.resumo, d.video_url, d.slides_url, d.slides_arquivo_id, d.perguntas, r.l.id]);
  res.json({ ok: true });
});

router.delete('/licoes/:id', async (req, res) => {
  const u = req.usuario;
  const r = await carregarLicao(u, req.params.id);
  if (!r) return res.status(404).json({ erro: 'Lição não encontrada.' });
  if (!podeEscrever(u, r.c)) return negar(res);
  await db.query('DELETE FROM licoes WHERE id = $1', [r.l.id]);
  res.json({ ok: true });
});

// ---------------- Arquivos (slides) ----------------
router.post('/arquivos', express.raw({ type: () => true, limit: MAX_ARQUIVO }), async (req, res) => {
  const u = req.usuario;
  if (!podeCriar(u)) return negar(res, 'Você não tem permissão para enviar slides.');
  const tipo = String(req.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (!TIPOS_ARQUIVO.includes(tipo)) {
    return res.status(400).json({ erro: 'Envie os slides em PDF (no PowerPoint ou Google Slides: Arquivo → Baixar → PDF) ou como imagem.' });
  }
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ erro: 'Arquivo vazio.' });
  const nome = String(req.query.nome || 'slides').slice(0, 200);
  const { rows } = await db.query(
    'INSERT INTO arquivos (denominacao_id, nome, tipo, tamanho, dados, criado_por) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, nome, tamanho',
    [u.denominacao_id, nome, tipo, req.body.length, req.body, u.id]);
  res.status(201).json(rows[0]);
});

// Gera um link temporário (10 min) para abrir o arquivo em nova aba ou no telão
router.get('/arquivos/:id/link', async (req, res) => {
  const u = req.usuario;
  const a = (await db.query('SELECT id FROM arquivos WHERE id = $1 AND denominacao_id = $2', [req.params.id, u.denominacao_id])).rows[0];
  if (!a) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
  const t = jwt.sign({ arq: String(a.id) }, SEGREDO(), { expiresIn: '10m' });
  res.json({ url: `/api/discipulado/arquivos/${a.id}/ver?t=${encodeURIComponent(t)}` });
});

module.exports = router;
