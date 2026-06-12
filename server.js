'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app    = express();
const DB_FILE = path.join(__dirname, 'db.json');

app.use(express.json());
app.use(express.static(__dirname));

/* ════════════════════════════════════════════════════════════
   BASE DE DADOS  (ficheiro JSON)
════════════════════════════════════════════════════════════ */
const DEFAULT_TRADERS = [
  { id:1,  name:'trader1A',  weeklyProfit:15.4, drawdown: 8.2, score:87 },
  { id:2,  name:'trader2F',  weeklyProfit:22.1, drawdown:12.5, score:92 },
  { id:3,  name:'trader3C',  weeklyProfit: 7.8, drawdown: 5.1, score:65 },
  { id:4,  name:'trader4B',  weeklyProfit:18.9, drawdown:25.3, score:45 },
  { id:5,  name:'trader5E',  weeklyProfit:11.2, drawdown: 9.8, score:78 },
  { id:6,  name:'trader6D',  weeklyProfit: 5.3, drawdown: 7.2, score:58 },
  { id:7,  name:'trader7G',  weeklyProfit:19.7, drawdown:11.0, score:89 },
  { id:8,  name:'trader8H',  weeklyProfit:31.5, drawdown:28.7, score:38 },
  { id:9,  name:'trader9K',  weeklyProfit:13.1, drawdown: 6.4, score:81 },
  { id:10, name:'trader10M', weeklyProfit: 4.2, drawdown: 9.1, score:52 },
  { id:11, name:'trader11R', weeklyProfit:26.8, drawdown:14.3, score:94 },
  { id:12, name:'trader12T', weeklyProfit: 8.5, drawdown: 4.7, score:63 },
  { id:13, name:'trader13N', weeklyProfit:17.3, drawdown:22.1, score:41 },
  { id:14, name:'trader14P', weeklyProfit:12.9, drawdown: 8.8, score:76 },
  { id:15, name:'trader15W', weeklyProfit: 3.1, drawdown:11.5, score:47 },
  { id:16, name:'trader16Z', weeklyProfit:20.4, drawdown: 7.9, score:91 },
  { id:17, name:'trader17Q', weeklyProfit:14.7, drawdown:16.2, score:69 },
  { id:18, name:'trader18J', weeklyProfit: 6.9, drawdown: 5.5, score:60 },
  { id:19, name:'trader19X', weeklyProfit:24.3, drawdown:10.1, score:88 },
  { id:20, name:'trader20V', weeklyProfit: 2.4, drawdown:18.9, score:34 },
  { id:21, name:'trader21L', weeklyProfit:11.8, drawdown: 7.3, score:74 },
  { id:22, name:'trader22S', weeklyProfit:29.1, drawdown:31.4, score:29 },
  { id:23, name:'trader23Y', weeklyProfit:16.6, drawdown: 9.4, score:83 },
  { id:24, name:'trader24U', weeklyProfit: 9.2, drawdown: 6.8, score:61 },
  { id:25, name:'trader25O', weeklyProfit:21.5, drawdown:13.7, score:86 },
  { id:26, name:'trader26I', weeklyProfit: 1.8, drawdown: 8.3, score:44 },
  { id:27, name:'trader27E', weeklyProfit:18.2, drawdown:24.6, score:42 },
  { id:28, name:'trader28A', weeklyProfit:10.5, drawdown: 5.9, score:72 },
  { id:29, name:'trader29B', weeklyProfit:33.7, drawdown:27.8, score:36 },
  { id:30, name:'trader30C', weeklyProfit:13.9, drawdown: 8.1, score:80 },
];

const DEFAULT_DB = {
  account: {
    balance:         847.52,
    balancePrev:     847.52,
    dailyProfit:     0,
    dailyProfitPct:  0,
    lastDate:        '',
  },
  traders:      DEFAULT_TRADERS,
  operations: [
    { id:1,  trader:'trader2F', type:'Buy',  pair:'BONK/SOL',   profit: 4.2500, time:'14:23:01' },
    { id:2,  trader:'trader1A', type:'Sell', pair:'WIF/SOL',    profit:-1.8200, time:'14:18:35' },
    { id:3,  trader:'trader7G', type:'Buy',  pair:'SOL/POPCAT', profit: 3.1000, time:'14:15:12' },
    { id:4,  trader:'trader5E', type:'Sell', pair:'BOME/SOL',   profit: 1.4400, time:'14:09:44' },
    { id:5,  trader:'trader2F', type:'Buy',  pair:'SOL/MEW',    profit:-0.9300, time:'14:05:22' },
    { id:6,  trader:'trader1A', type:'Buy',  pair:'SLERF/SOL',  profit: 7.8100, time:'13:58:11' },
    { id:7,  trader:'trader5E', type:'Sell', pair:'SOL/PONKE',  profit: 0.6700, time:'13:45:07' },
    { id:8,  trader:'trader7G', type:'Buy',  pair:'MYRO/SOL',   profit:-2.1400, time:'13:38:29' },
    { id:9,  trader:'trader2F', type:'Sell', pair:'SOL/GIGA',   profit: 1.9800, time:'13:30:15' },
    { id:10, trader:'trader1A', type:'Buy',  pair:'SAMO/SOL',   profit: 3.6200, time:'13:22:41' },
  ],
  transactions: [],
  nextOpId: 11,
};

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/* Cria db.json se não existir */
if (!fs.existsSync(DB_FILE)) {
  saveDB(JSON.parse(JSON.stringify(DEFAULT_DB)));
  console.log('Base de dados criada → db.json');
}

/* ════════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════════ */
function calcStatus(t) {
  if (t.drawdown > 20)      return 'Removido';
  if (t.weeklyProfit < 10)  return 'Suspenso';
  return 'Ativo';
}

function r4(n) { return Math.round(n * 10000) / 10000; }
function r2(n) { return Math.round(n * 100)   / 100;   }

function checkDayReset(db) {
  const today = new Date().toLocaleDateString('pt-PT');
  if (db.account.lastDate !== today) {
    db.account.dailyProfit    = 0;
    db.account.dailyProfitPct = 0;
    db.account.lastDate       = today;
  }
}

function buildStats(db) {
  return {
    totalBalance:     db.account.balance,
    totalBalancePrev: db.account.balancePrev,
    dailyProfit:      db.account.dailyProfit,
    dailyProfitPct:   db.account.dailyProfitPct,
    activeTraders:    db.traders.filter(t => calcStatus(t) === 'Ativo').length,
    totalTraders:     db.traders.length,
  };
}

function nowTime() {
  return new Date().toLocaleTimeString('pt-PT', { hour12: false });
}

function nowDateTime() {
  return new Date().toLocaleString('pt-PT');
}

/* ════════════════════════════════════════════════════════════
   ROTAS
════════════════════════════════════════════════════════════ */

/* GET /api/dashboard */
app.get('/api/dashboard', (req, res) => {
  const db = loadDB();
  checkDayReset(db);
  saveDB(db);
  res.json({
    stats:      buildStats(db),
    traders:    db.traders,
    operations: db.operations.slice(0, 20),
  });
});

/* GET /api/transactions */
app.get('/api/transactions', (req, res) => {
  const db = loadDB();
  res.json(db.transactions.slice(0, 200));
});

/* POST /api/deposit  { amount } */
app.post('/api/deposit', (req, res) => {
  const amount = parseFloat(req.body.amount);
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Valor inválido.' });

  const db = loadDB();
  checkDayReset(db);
  db.account.balancePrev = db.account.balance;
  db.account.balance     = r4(db.account.balance + amount);
  db.transactions.unshift({ type: 'Depósito', amount, time: nowDateTime() });
  saveDB(db);

  res.json({ balance: db.account.balance });
});

/* POST /api/withdraw  { amount } */
app.post('/api/withdraw', (req, res) => {
  const amount = parseFloat(req.body.amount);
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Valor inválido.' });

  const db = loadDB();
  checkDayReset(db);
  if (amount > db.account.balance) return res.status(400).json({ error: 'Saldo insuficiente.' });

  db.account.balancePrev = db.account.balance;
  db.account.balance     = r4(db.account.balance - amount);
  db.transactions.unshift({ type: 'Levantamento', amount, time: nowDateTime() });
  saveDB(db);

  res.json({ balance: db.account.balance });
});

/* POST /api/operation  { trader, type, pair, profit } */
app.post('/api/operation', (req, res) => {
  const { trader, type, pair, profit } = req.body;
  if (!trader || !type || !pair || profit == null)
    return res.status(400).json({ error: 'Dados incompletos.' });

  const p  = r4(parseFloat(profit));
  const db = loadDB();
  checkDayReset(db);

  /* Atualiza saldo e lucro diário */
  db.account.balancePrev    = db.account.balance;
  db.account.balance        = r4(db.account.balance + p);
  db.account.dailyProfit    = r4(db.account.dailyProfit + p);
  db.account.dailyProfitPct = db.account.balance > 0
    ? r2(db.account.dailyProfit / db.account.balance * 100)
    : 0;

  /* Nova operação */
  const op = { id: db.nextOpId++, trader, type, pair, profit: p, time: nowTime() };
  db.operations.unshift(op);
  if (db.operations.length > 200) db.operations.pop();

  /* Drift leve no trader */
  const t = db.traders.find(x => x.name === trader);
  if (t) {
    t.weeklyProfit = parseFloat((t.weeklyProfit + (p >= 0 ? 0.04 : -0.02)).toFixed(1));
  }

  saveDB(db);

  res.json({
    stats:      buildStats(db),
    traders:    db.traders,
    operations: db.operations.slice(0, 20),
  });
});

/* POST /api/reset */
app.post('/api/reset', (req, res) => {
  saveDB(JSON.parse(JSON.stringify(DEFAULT_DB)));
  res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════════
   START
════════════════════════════════════════════════════════════ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SOL Copy Trading Dashboard → http://localhost:${PORT}`);
});
