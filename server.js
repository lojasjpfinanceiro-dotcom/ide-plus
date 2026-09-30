require('dotenv').config();

const express = require('express');
const path = require('path');
const migrate = require('./src/migrate');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '3mb' })); // fotos e logotipo reduzidos no navegador

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/fornecedor', require('./src/routes/fornecedor'));
app.use('/api/estrutura', require('./src/routes/estrutura'));
app.use('/api/usuarios', require('./src/routes/usuarios'));
app.use('/api/cargos', require('./src/routes/cargos'));
app.use('/api/pessoas', require('./src/routes/pessoas'));
app.use('/api/config', require('./src/routes/config'));
app.use('/api/painel', require('./src/routes/painel'));
app.use('/api/geo', require('./src/routes/geo'));
// Versão publicada: o app compara e se atualiza sozinho quando há deploy novo
const VERSAO = process.env.RENDER_GIT_COMMIT || String(Date.now());
app.get('/api/versao', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ versao: VERSAO }); });
app.get('/api/health', (req, res) => res.json({ ok: true, app: 'IDE+', versao: 2 }));
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, f) => { if (/\.(html|js|css)$/.test(f)) res.set('Cache-Control', 'no-cache'); }
}));
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Erros (Express 5 repassa erros de funções async)
app.use((err, req, res, next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ erro: err.message });
  console.error('[ERRO]', req.method, req.path, err);
  res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
});

migrate()
  .then(() => app.listen(port, () => console.log(`IDE+ v2 rodando na porta ${port}`)))
  .catch((e) => { console.error('[migrate] falhou:', e); process.exit(1); });
