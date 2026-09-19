require('dotenv').config();

const express = require('express');
const path = require('path');
const auth = require('./src/routes/auth');
const congregacoes = require('./src/routes/congregacoes');
const pessoas = require('./src/routes/pessoas');
const initDb = require('./src/initDb');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', auth);
app.use('/api/congregacoes', congregacoes);
app.use('/api/pessoas', pessoas);

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'IDE+' }));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

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
