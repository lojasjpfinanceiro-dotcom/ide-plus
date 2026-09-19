const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const q = await db.query(`
      SELECT p.id, p.nome, p.cpf, p.foto, p.telefone, p.email, p.origem,
             p.status, p.criado_em, c.nome AS congregacao
      FROM pessoas p
      LEFT JOIN congregacoes c
        ON c.id = p.congregacao_id AND c.denominacao_id = p.denominacao_id
      WHERE p.denominacao_id = $1 AND p.ativo = TRUE
      ORDER BY p.criado_em DESC
    `, [req.user.denominacao_id]);
    res.json(q.rows);
  } catch (e) {
    console.error('Erro ao listar pessoas:', e);
    res.status(500).json({ erro: 'Erro ao listar pessoas.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      nome, cpf, foto, telefone, email, data_nascimento, cidade, bairro,
      endereco, numero, origem, observacoes, congregacao_id
    } = req.body;

    if (!nome || !cpf || !foto || !telefone || !congregacao_id || !origem || !endereco || !numero) {
      return res.status(400).json({
        erro: 'Preencha os campos obrigatórios: foto, nome, CPF, WhatsApp, congregação, origem, endereço e número.'
      });
    }

    const cpfLimpo = String(cpf).replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
      return res.status(400).json({ erro: 'Informe um CPF válido com 11 dígitos.' });
    }

    const congregacao = await db.query(
      'SELECT id FROM congregacoes WHERE id=$1 AND denominacao_id=$2 AND ativo=TRUE',
      [congregacao_id, req.user.denominacao_id]
    );
    if (!congregacao.rowCount) {
      return res.status(400).json({ erro: 'Congregação inválida.' });
    }

    const q = await db.query(`
      INSERT INTO pessoas (
        denominacao_id, congregacao_id, nome, cpf, foto, telefone, email,
        data_nascimento, cidade, bairro, endereco, numero, origem, observacoes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      req.user.denominacao_id, congregacao_id, nome.trim(), cpfLimpo, foto,
      telefone.trim(), email || null, data_nascimento || null, cidade || null,
      bairro || null, endereco.trim(), String(numero).trim(), origem, observacoes || null
    ]);

    res.status(201).json(q.rows[0]);
  } catch (e) {
    console.error('Erro ao cadastrar pessoa:', e);
    if (e.code === '23505') {
      return res.status(400).json({ erro: 'Este CPF já está cadastrado nesta denominação.' });
    }
    res.status(500).json({ erro: 'Erro ao cadastrar pessoa.' });
  }
});

router.get('/resumo', async (req, res) => {
  try {
    const q = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE ativo) pessoas_alcancadas,
        COUNT(*) FILTER (WHERE ativo AND status='EM_DISCIPULADO') em_discipulado,
        COUNT(*) FILTER (WHERE ativo AND status='PREPARANDO_BATISMO') preparando_batismo,
        COUNT(*) FILTER (
          WHERE ativo AND status='BATIZADO'
          AND EXTRACT(YEAR FROM atualizado_em)=EXTRACT(YEAR FROM CURRENT_DATE)
        ) batizados_ano
      FROM pessoas WHERE denominacao_id=$1
    `, [req.user.denominacao_id]);
    res.json(q.rows[0]);
  } catch (e) {
    console.error('Erro ao carregar resumo:', e);
    res.status(500).json({ erro: 'Erro ao carregar resumo.' });
  }
});

module.exports = router;
