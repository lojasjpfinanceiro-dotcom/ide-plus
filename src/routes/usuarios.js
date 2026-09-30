// Cadastro único de usuários (login e senha). Cada nível cadastra os níveis abaixo dele.
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { autenticar, exigirNivel, pode, BASE_POR_NIVEL, JOIN_DO_CARGO, SQL_DO_CARGO } = require('../auth');
const { limparCpf, cpfValido, mascararCpf } = require('../cpf');

router.use(autenticar, exigirNivel(1, 2, 3));

const podeGerenciar = (u) => u.nivel === 1 || pode(u, 'usuarios.gerenciar');

// Nível 1 vê todos; 2 e 3 veem os da sua cidade em níveis abaixo do seu
function escopo(u, alias = 'u') {
  if (u.nivel === 1) return { sql: `${alias}.denominacao_id = $1`, params: [u.denominacao_id] };
  return {
    sql: `${alias}.denominacao_id = $1 AND ${alias}.cidade_id = $2 AND ${alias}.nivel > $3`,
    params: [u.denominacao_id, u.cidade_id, u.nivel]
  };
}

router.get('/', async (req, res) => {
  const e = escopo(req.usuario);
  const { rows } = await db.query(
    `SELECT u.id, u.nivel, u.nome, u.email, u.telefone, u.foto, u.cidade_id, u.cargo_id, u.ativo,
            u.cpf, u.fora_do_brasil, u.trocar_senha, u.criado_por,
            c.nome AS cidade, cg.nome AS cargo
       FROM usuarios u
       LEFT JOIN cidades c ON c.id = u.cidade_id
       LEFT JOIN cargos cg ON cg.id = u.cargo_id
      WHERE ${e.sql}
      ORDER BY u.nivel, u.nome`, e.params);
  // CPF completo só para o Nível 1 e para quem cadastrou a pessoa
  const eu = req.usuario;
  res.json(rows.map(({ cpf, criado_por, ...u }) => ({
    ...u, tem_cpf: !!cpf, cpf_mascarado: mascararCpf(cpf),
    cpf: eu.nivel === 1 || String(criado_por) === String(eu.id) ? cpf : null
  })));
});

async function validar(req, dados, atual) {
  const u = req.usuario;
  const nivel = Number(dados.nivel);
  if (!(nivel >= 1 && nivel <= 4)) return 'Escolha o nível do usuário.';
  if (u.nivel !== 1 && nivel <= u.nivel) return 'Você só pode cadastrar usuários de níveis abaixo do seu.';
  if (!dados.nome) return 'Informe o nome.';

  // Login: CPF para quem está no Brasil; e-mail para o Nível 1 e para quem mora fora do país
  dados.fora_do_brasil = !!dados.fora_do_brasil;
  dados.cpf = limparCpf(dados.cpf) || (atual ? atual.cpf : null);
  dados.email = String(dados.email || '').trim().toLowerCase() || null;
  if (dados.cpf && !cpfValido(dados.cpf)) return 'CPF inválido. Confira os números.';
  if (nivel >= 2 && !dados.fora_do_brasil && !dados.cpf) return 'Informe o CPF: é com ele que a pessoa entra no sistema.';
  if ((nivel === 1 || dados.fora_do_brasil) && !dados.email) return nivel === 1 ? 'Informe o e-mail do Pastor Presidente.' : 'Quem mora fora do Brasil entra com e-mail. Informe o e-mail.';
  if (dados.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dados.email)) return 'E-mail inválido.';

  if (!atual && String(dados.senha || '').length < 6) return 'A senha provisória precisa ter ao menos 6 caracteres.';
  if (dados.senha && String(dados.senha).length < 6) return 'A senha precisa ter ao menos 6 caracteres.';
  if (u.nivel !== 1) dados.cidade_id = u.cidade_id; // 2 e 3 só cadastram na própria cidade
  if (dados.cidade_id) {
    const ok = (await db.query('SELECT 1 FROM cidades WHERE id = $1 AND denominacao_id = $2', [dados.cidade_id, u.denominacao_id])).rowCount;
    if (!ok) return 'Cidade inválida.';
  } else if (nivel >= 2) return 'Informe a cidade em que o usuário vai atuar.';
  if (dados.cargo_id) {
    const ok = (await db.query('SELECT 1 FROM cargos WHERE id = $1 AND denominacao_id = $2', [dados.cargo_id, u.denominacao_id])).rowCount;
    if (!ok) return 'Cargo inválido.';
  }
  return null;
}

function duplicado(e, res) {
  if (e.code !== '23505') throw e;
  return res.status(409).json({ erro: /cpf/.test(e.constraint || '') ? 'Este CPF já está cadastrado.' : 'Este e-mail já está em uso.' });
}

router.post('/', async (req, res) => {
  if (!podeGerenciar(req.usuario)) return res.status(403).json({ erro: 'Você não tem permissão para cadastrar usuários.' });
  const b = { ...req.body };
  const erro = await validar(req, b);
  if (erro) return res.status(400).json({ erro });
  try {
    const { rows } = await db.query(
      `INSERT INTO usuarios (denominacao_id, nivel, nome, email, cpf, fora_do_brasil, senha_hash, trocar_senha,
                             telefone, foto, cidade_id, cargo_id, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [req.usuario.denominacao_id, Number(b.nivel), b.nome, b.email, b.cpf, b.fora_do_brasil,
       await bcrypt.hash(String(b.senha), 10), Number(b.nivel) >= 2,
       b.telefone || null, b.foto || null, b.cidade_id || null, b.cargo_id || null, req.usuario.id]);
    res.status(201).json(rows[0]);
  } catch (e) { return duplicado(e, res); }
});

async function buscarNoEscopo(req, id) {
  const e = escopo(req.usuario);
  const { rows } = await db.query(`SELECT * FROM usuarios u WHERE ${e.sql} AND u.id = $${e.params.length + 1}`, [...e.params, id]);
  return rows[0];
}

router.put('/:id', async (req, res) => {
  if (!podeGerenciar(req.usuario)) return res.status(403).json({ erro: 'Você não tem permissão para alterar usuários.' });
  const alvo = await buscarNoEscopo(req, req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  const b = { ...req.body };
  const erro = await validar(req, b, alvo);
  if (erro) return res.status(400).json({ erro });
  if (String(alvo.id) === String(req.usuario.id) && Number(b.nivel) !== alvo.nivel) {
    return res.status(400).json({ erro: 'Você não pode mudar o seu próprio nível.' });
  }
  try {
    await db.query(
      `UPDATE usuarios SET nivel = $1, nome = $2, email = $3, cpf = $4, fora_do_brasil = $5, telefone = $6, foto = $7,
              cidade_id = $8, cargo_id = $9, ativo = $10 WHERE id = $11`,
      [Number(b.nivel), b.nome, b.email, b.cpf, b.fora_do_brasil, b.telefone || null, b.foto || null,
       b.cidade_id || null, b.cargo_id || null, b.ativo !== false, alvo.id]);
    if (b.senha) {
      // Nova senha dada por outra pessoa é provisória: no próximo acesso, troca obrigatória (níveis 2 a 4)
      const provisoria = String(alvo.id) !== String(req.usuario.id) && Number(b.nivel) >= 2;
      await db.query('UPDATE usuarios SET senha_hash = $1, trocar_senha = $2, tentativas_login = 0, bloqueado_ate = NULL WHERE id = $3',
        [await bcrypt.hash(String(b.senha), 10), provisoria, alvo.id]);
    }
    res.json({ ok: true });
  } catch (e) { return duplicado(e, res); }
});

router.delete('/:id', async (req, res) => {
  if (!podeGerenciar(req.usuario)) return res.status(403).json({ erro: 'Você não tem permissão para excluir usuários.' });
  if (String(req.params.id) === String(req.usuario.id)) return res.status(400).json({ erro: 'Você não pode excluir o seu próprio usuário.' });
  const alvo = await buscarNoEscopo(req, req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  await db.query('DELETE FROM usuarios WHERE id = $1', [alvo.id]);
  res.json({ ok: true });
});

// ---- Permissões individuais (marcar quem tem acesso ou não)
router.get('/:id/permissoes', async (req, res) => {
  const alvo = await buscarNoEscopo(req, req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  const { rows } = await db.query(
    `SELECT p.codigo, p.modulo, p.descricao,
            (${SQL_DO_CARGO} OR p.codigo = ANY($3::text[])) AS padrao, up.permitido AS individual,
            COALESCE(up.permitido, ${SQL_DO_CARGO} OR p.codigo = ANY($3::text[])) AS efetivo
       FROM permissoes p ${JOIN_DO_CARGO}
       LEFT JOIN usuario_permissoes up ON up.codigo = p.codigo AND up.usuario_id = $1
      ORDER BY p.ordem`, [alvo.id, alvo.cargo_id, BASE_POR_NIVEL[alvo.nivel] || [], alvo.cidade_id]);
  res.json({ nivel: alvo.nivel, acesso_total: alvo.nivel === 1, permissoes: rows });
});

router.put('/:id/permissoes', async (req, res) => {
  const alvo = await buscarNoEscopo(req, req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  if (alvo.nivel === 1) return res.status(400).json({ erro: 'O Nível 1 tem acesso total.' });
  const lista = Array.isArray(req.body.permissoes) ? req.body.permissoes : [];
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM usuario_permissoes WHERE usuario_id = $1', [alvo.id]);
    for (const p of lista) {
      if (p.individual === true || p.individual === false) {
        await c.query('INSERT INTO usuario_permissoes (usuario_id, codigo, permitido) VALUES ($1,$2,$3)', [alvo.id, p.codigo, p.individual]);
      }
    }
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  res.json({ ok: true });
});

module.exports = router;
