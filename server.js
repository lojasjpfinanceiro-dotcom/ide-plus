require('dotenv').config();

const express = require('express');
const path = require('path');
const auth = require('./src/routes/auth');
const congregacoes = require('./src/routes/congregacoes');
const cidades = require('./src/routes/cidades');
const pessoas = require('./src/routes/pessoas');
const configuracoes = require('./src/routes/configuracoes');
const acessos = require('./src/routes/acessos');
const resultados = require('./src/routes/resultados');
const localidades = require('./src/routes/localidades');
const estruturaMinisterial = require('./src/routes/estrutura-ministerial');
const agenda = require('./src/routes/agenda');
const discipulado = require('./src/routes/discipulado');
const initDb = require('./src/initDb');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
// Evita que iPhone/Safari mantenha telas e JavaScript antigos após um deploy.
app.use((req,res,next)=>{if(req.path.endsWith('.html')||req.path.endsWith('.js')||req.path==='/'){res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.set('Pragma','no-cache');res.set('Expires','0');}next();});

const telasComNavegacao = new Set([
  '/home.html','/pessoas.html','/estrutura-ministerial.html','/discipulado.html',
  '/agenda.html','/configuracao.html','/cadastro.html','/usuarios.html',
  '/gestao-local.html','/equipe-local.html','/coordenacao-equipe.html','/pastor-local.html','/estrutura.html'
]);
app.get([...telasComNavegacao], (req, res, next) => {
  const arquivo = path.join(__dirname, 'public', req.path.slice(1));
  require('fs').readFile(arquivo, 'utf8', (err, html) => {
    if (err) return next();
    const tag = '<script src="/js/bottom-nav.js"></script>';
    if (!html.includes('/js/bottom-nav.js')) html = html.replace('</body>', tag + '</body>');
    res.type('html').send(html);
  });
});
app.use(express.static(path.join(__dirname, 'public'),{etag:false,maxAge:0}));
app.use('/api/auth', auth);
app.use('/api/congregacoes', congregacoes);
app.use('/api/cidades', cidades);
app.use('/api/pessoas', pessoas);
app.use('/api/configuracoes', configuracoes);
app.use('/api/acessos', acessos);
app.use('/api/resultados', resultados);
app.use('/api/localidades', localidades);
app.use('/api/estrutura-ministerial', estruturaMinisterial);
app.use('/api/agenda', agenda);
app.use('/api/discipulado', discipulado);

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'IDE+' }));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

app.use((err, req, res, next) => {
  console.error('Erro HTTP:', err);
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ erro: 'A foto ficou muito grande para envio. Tire uma nova foto de identificação e tente novamente.' });
  }
  if (req.path && req.path.startsWith('/api/')) {
    return res.status(err.status || 500).json({ erro: 'Erro ao processar a solicitação.' });
  }
  next(err);
});

async function start() {
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET não configurado.');
    await initDb();
    app.listen(port, () => console.log('IDE+ ativo na porta ' + port));
  } catch (err) {
    console.error('Falha ao iniciar IDE+:', err);
    process.exit(1);
  }
}

start();
