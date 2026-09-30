require('dotenv').config();

const express = require('express');
const path = require('path');
const migrate = require('./src/migrate');

const app = express();

// Versão publicada: o app compara e se atualiza sozinho quando há deploy novo
const VERSAO = process.env.RENDER_GIT_COMMIT || String(Date.now());
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '3mb' }));
const avisados = new Set();
app.use('/api', (req, res, next) => {
  res.set('X-IDE-Versao', VERSAO);
  // Registra (uma vez por versão de cliente) quem ainda está com a tela antiga aberta
  const cli = req.get('X-IDE-Cliente') || 'antiga (sem controle de versão)';
  if (cli !== VERSAO && !avisados.has(cli)) { avisados.add(cli); console.log(`[versao] cliente em versão desatualizada: ${cli.slice(0, 12)} → atual ${VERSAO.slice(0, 12)}`); }
  next();
}); // fotos e logotipo reduzidos no navegador

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/fornecedor', require('./src/routes/fornecedor'));
app.use('/api/estrutura', require('./src/routes/estrutura'));
app.use('/api/usuarios', require('./src/routes/usuarios'));
app.use('/api/cargos', require('./src/routes/cargos'));
app.use('/api/pessoas', require('./src/routes/pessoas'));
app.use('/api/config', require('./src/routes/config'));
app.use('/api/painel', require('./src/routes/painel'));
app.use('/api/discipulado', require('./src/routes/discipulado'));
app.use('/api/geo', require('./src/routes/geo'));
app.get('/api/versao', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ versao: VERSAO }); });
app.get('/api/health', (req, res) => res.json({ ok: true, app: 'IDE+', versao: 2 }));
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// Página principal sem cache e com ?v=versão nos arquivos: o celular sempre pega a versão nova
const fs = require('fs');
const paginaInicial = () => fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')
  .replace('/css/app.css', `/css/app.css?v=${VERSAO}`)
  .replace('/js/app.js', `/js/app.js?v=${VERSAO}`);
const enviarInicial = (req, res) => {
  res.set('Cache-Control', 'no-store, must-revalidate');
  res.type('html').send(paginaInicial());
};
app.get(['/', '/index.html'], enviarInicial);
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  setHeaders: (res, f) => { if (/\.(html|js|css)$/.test(f)) res.set('Cache-Control', 'no-cache'); }
}));
app.use(enviarInicial);

// Erros (Express 5 repassa erros de funções async)
app.use((err, req, res, next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ erro: err.message });
  console.error('[ERRO]', req.method, req.path, err);
  res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
});

migrate()
  .then(() => app.listen(port, () => console.log(`IDE+ v2 rodando na porta ${port}`)))
  .catch((e) => { console.error('[migrate] falhou:', e); process.exit(1); });
