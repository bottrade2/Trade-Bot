'use strict';

const express = require('express');
const session = require('express-session');
const bcrypt  = require('bcryptjs');
const fs      = require('fs');
const path    = require('path');

const app     = express();
const DB_FILE = path.join(__dirname, 'db.json');

/* ════════════════════════════════════════════════════════════
   BASE DE DADOS (JSON)
════════════════════════════════════════════════════════════ */
const DEFAULT_TRADERS = [
  { name:'trader1A',  weeklyProfit:15.4, drawdown: 8.2, score:87 },
  { name:'trader2F',  weeklyProfit:22.1, drawdown:12.5, score:92 },
  { name:'trader3C',  weeklyProfit: 7.8, drawdown: 5.1, score:65 },
  { name:'trader4B',  weeklyProfit:18.9, drawdown:25.3, score:45 },
  { name:'trader5E',  weeklyProfit:11.2, drawdown: 9.8, score:78 },
  { name:'trader6D',  weeklyProfit: 5.3, drawdown: 7.2, score:58 },
  { name:'trader7G',  weeklyProfit:19.7, drawdown:11.0, score:89 },
  { name:'trader8H',  weeklyProfit:31.5, drawdown:28.7, score:38 },
  { name:'trader9K',  weeklyProfit:13.1, drawdown: 6.4, score:81 },
  { name:'trader10M', weeklyProfit: 4.2, drawdown: 9.1, score:52 },
  { name:'trader11R', weeklyProfit:26.8, drawdown:14.3, score:94 },
  { name:'trader12T', weeklyProfit: 8.5, drawdown: 4.7, score:63 },
  { name:'trader13N', weeklyProfit:17.3, drawdown:22.1, score:41 },
  { name:'trader14P', weeklyProfit:12.9, drawdown: 8.8, score:76 },
  { name:'trader15W', weeklyProfit: 3.1, drawdown:11.5, score:47 },
  { name:'trader16Z', weeklyProfit:20.4, drawdown: 7.9, score:91 },
  { name:'trader17Q', weeklyProfit:14.7, drawdown:16.2, score:69 },
  { name:'trader18J', weeklyProfit: 6.9, drawdown: 5.5, score:60 },
  { name:'trader19X', weeklyProfit:24.3, drawdown:10.1, score:88 },
  { name:'trader20V', weeklyProfit: 2.4, drawdown:18.9, score:34 },
  { name:'trader21L', weeklyProfit:11.8, drawdown: 7.3, score:74 },
  { name:'trader22S', weeklyProfit:29.1, drawdown:31.4, score:29 },
  { name:'trader23Y', weeklyProfit:16.6, drawdown: 9.4, score:83 },
  { name:'trader24U', weeklyProfit: 9.2, drawdown: 6.8, score:61 },
  { name:'trader25O', weeklyProfit:21.5, drawdown:13.7, score:86 },
  { name:'trader26I', weeklyProfit: 1.8, drawdown: 8.3, score:44 },
  { name:'trader27E', weeklyProfit:18.2, drawdown:24.6, score:42 },
  { name:'trader28A', weeklyProfit:10.5, drawdown: 5.9, score:72 },
  { name:'trader29B', weeklyProfit:33.7, drawdown:27.8, score:36 },
  { name:'trader30C', weeklyProfit:13.9, drawdown: 8.1, score:80 },
];

const DEFAULT_DB = {
  users:            [],
  accounts:         {},
  traders:          DEFAULT_TRADERS,
  operations:       {},
  transactions:     {},
  positions:        {},
  pending_deposits: [],
  used_signatures:  [],
  login_attempts:   [],
  nextUserId:  1,
  nextOpId:    1,
  nextTxId:    1,
  nextPosId:   1,
  nextDepId:   1,
};

function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return JSON.parse(JSON.stringify(DEFAULT_DB)); }
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

if (!fs.existsSync(DB_FILE)) {
  saveDB(JSON.parse(JSON.stringify(DEFAULT_DB)));
  console.log('Base de dados criada → db.json');
}

/* ════════════════════════════════════════════════════════════
   MIDDLEWARE
════════════════════════════════════════════════════════════ */
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'sol-trading-2024-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));
app.use(express.static(__dirname));

/* ════════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════════ */
const r4 = n => Math.round(n * 10000) / 10000;
const r2 = n => Math.round(n * 100)   / 100;

function nowTime()     { return new Date().toLocaleTimeString('pt-PT', { hour12: false }); }
function nowDateTime() { return new Date().toLocaleString('pt-PT'); }
function todayStr()    { return new Date().toLocaleDateString('pt-PT'); }

function ensureAccount(db, userId) {
  const key = String(userId);
  if (!db.accounts[key]) {
    db.accounts[key] = { balance:0, balancePrev:0, botFunds:0, dailyProfit:0, dailyPct:0, lastDate:'', botActive:0 };
  }
}

function checkDayReset(db, userId) {
  const acc = db.accounts[String(userId)];
  if (acc && acc.lastDate !== todayStr()) {
    acc.dailyProfit = 0;
    acc.dailyPct    = 0;
    acc.lastDate    = todayStr();
  }
}

function requireAuth(req, res) {
  if (!req.session?.userId) { res.status(401).json({ error: 'Não autenticado.', auth: false }); return null; }
  return req.session.userId;
}

function requireAdmin(req, res) {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  if (!req.session.isAdmin) { res.status(403).json({ error: 'Acesso negado.' }); return null; }
  return userId;
}

function calcStatus(t) {
  if (t.drawdown      > 20) return 'Removido';
  if (t.weeklyProfit  < 10) return 'Suspenso';
  return 'Ativo';
}

function getStats(db, userId) {
  const acc    = db.accounts[String(userId)] || {};
  const active = db.traders.filter(t => t.drawdown <= 20 && t.weeklyProfit >= 10).length;
  const openV  = (db.positions[String(userId)] || []).reduce((s, p) => s + p.amount, 0);
  return {
    totalBalance:       acc.balance      || 0,
    totalBalancePrev:   acc.balancePrev  || 0,
    botFunds:           acc.botFunds     || 0,
    openPositionsValue: openV,
    dailyProfit:        acc.dailyProfit  || 0,
    dailyProfitPct:     acc.dailyPct     || 0,
    activeTraders:      active,
    totalTraders:       db.traders.length,
    botActive:          acc.botActive    || 0,
  };
}

function getTraders(db) {
  return db.traders.map((t, i) => ({ id: i + 1, name: t.name, weeklyProfit: t.weeklyProfit, drawdown: t.drawdown, score: t.score, status: calcStatus(t) }));
}

function getOperations(db, userId, limit = 20) {
  return (db.operations[String(userId)] || []).slice(0, limit);
}

function getPositions(db, userId) {
  return db.positions[String(userId)] || [];
}

/* ════════════════════════════════════════════════════════════
   AUTH
════════════════════════════════════════════════════════════ */

app.post('/api/auth/login.php', async (req, res) => {
  const loginVal = ((req.body.login || req.body.username) ?? '').trim();
  const { password } = req.body;
  if (!loginVal || !password) return res.status(400).json({ error: 'Preenche todos os campos.' });

  const ip     = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const WINDOW = 15 * 60;
  const MAX    = 5;
  const now    = Math.floor(Date.now() / 1000);
  const cutoff = now - WINDOW;

  const db = loadDB();
  db.login_attempts = db.login_attempts.filter(a => a.attempted_at >= cutoff);
  const attempts = db.login_attempts.filter(a => a.ip === ip).length;
  if (attempts >= MAX) { saveDB(db); return res.status(429).json({ error: 'Demasiadas tentativas. Tenta novamente em 15 min.' }); }

  const user = db.users.find(u => u.username === loginVal || u.email === loginVal);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    db.login_attempts.push({ ip, attempted_at: now });
    saveDB(db);
    const rem = MAX - attempts - 1;
    return res.status(401).json({ error: `Utilizador ou palavra-passe incorretos.${rem > 0 ? ` (${rem} tentativas restantes)` : ''}` });
  }

  db.login_attempts = db.login_attempts.filter(a => a.ip !== ip);
  ensureAccount(db, user.id);
  saveDB(db);

  req.session.userId   = user.id;
  req.session.username = user.username;
  req.session.isAdmin  = user.is_admin;
  res.json({ id: user.id, username: user.username, is_admin: user.is_admin });
});

app.post('/api/auth/register.php', async (req, res) => {
  const { username = '', email = '', password = '' } = req.body;
  if (username.length < 3)                        return res.status(400).json({ error: 'Nome de utilizador deve ter pelo menos 3 caracteres.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email inválido.' });
  if (password.length < 6)                        return res.status(400).json({ error: 'Palavra-passe deve ter pelo menos 6 caracteres.' });
  if (!/^[a-zA-Z0-9_]+$/.test(username))          return res.status(400).json({ error: 'Nome de utilizador só pode conter letras, números e _.' });

  const db = loadDB();
  if (db.users.find(u => u.username === username || u.email === email))
    return res.status(409).json({ error: 'Nome de utilizador ou email já em uso.' });

  const hash    = await bcrypt.hash(password, 10);
  const isAdmin = (username === 'KX3T' || email === 'manellopes1973@gmail.com') ? 1 : 0;
  const userId  = db.nextUserId++;
  db.users.push({ id: userId, username, email, password_hash: hash, is_admin: isAdmin, created_at: nowDateTime() });
  ensureAccount(db, userId);
  saveDB(db);

  req.session.userId   = userId;
  req.session.username = username;
  req.session.isAdmin  = isAdmin;
  res.json({ id: userId, username, is_admin: isAdmin });
});

app.get('/api/auth/me.php', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ auth: false });
  res.json({ id: req.session.userId, username: req.session.username, is_admin: req.session.isAdmin || 0, auth: true });
});

app.post('/api/auth/logout.php', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════════════════════════ */

app.get('/api/dashboard.php', (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const db = loadDB();
  ensureAccount(db, userId);
  checkDayReset(db, userId);
  saveDB(db);
  res.json({ stats: getStats(db, userId), traders: getTraders(db), operations: getOperations(db, userId, 20), positions: getPositions(db, userId) });
});

/* ════════════════════════════════════════════════════════════
   TRANSACTIONS
════════════════════════════════════════════════════════════ */

app.get('/api/transactions.php', (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const db = loadDB();
  res.json((db.transactions[String(userId)] || []).slice(0, 200));
});

/* ════════════════════════════════════════════════════════════
   OPERATION  (Buy / Sell)
════════════════════════════════════════════════════════════ */

app.post('/api/operation.php', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { type, trader, pair } = req.body;
  const opTime = ((req.body.time || '').replace(/[^0-9:]/g, '')) || nowTime();
  if (!type || !trader || !pair) return res.status(400).json({ error: 'Dados incompletos.' });

  const db  = loadDB();
  const key = String(userId);
  ensureAccount(db, userId);
  checkDayReset(db, userId);
  const acc = db.accounts[key];
  if (!db.operations[key])   db.operations[key]   = [];
  if (!db.positions[key])    db.positions[key]    = [];
  if (!db.transactions[key]) db.transactions[key] = [];

  if (type === 'Buy') {
    const amount = r4(parseFloat(req.body.amount) || 0);
    if (amount <= 0)           return res.status(400).json({ error: 'Montante inválido.' });
    if (amount > acc.botFunds) return res.status(400).json({ error: 'Fundos do bot insuficientes.' });

    acc.botFunds = r4(acc.botFunds - amount);
    const posId  = db.nextPosId++;
    db.positions[key].push({ id: posId, pair, trader, amount, opened_at: opTime });
    db.operations[key].unshift({ id: db.nextOpId++, trader, type: 'Buy', pair, profit: -amount, time: opTime });

  } else if (type === 'Sell') {
    const posId  = parseInt(req.body.positionId) || 0;
    const profit = r4(parseFloat(req.body.profit) || 0);
    const posIdx = db.positions[key].findIndex(p => p.id === posId);
    if (posIdx === -1) return res.status(404).json({ error: 'Posição não encontrada.' });

    const pos        = db.positions[key][posIdx];
    const sellReturn = r4(pos.amount + profit);
    acc.botFunds     = r4(acc.botFunds + sellReturn);
    acc.dailyProfit  = r4(acc.dailyProfit + profit);
    const total      = acc.botFunds + acc.balance;
    acc.dailyPct     = total > 0 ? r2(acc.dailyProfit / total * 100) : 0;
    db.positions[key].splice(posIdx, 1);
    db.operations[key].unshift({ id: db.nextOpId++, trader: pos.trader, type: 'Sell', pair: pos.pair, profit, time: opTime });

    const t = db.traders.find(x => x.name === pos.trader);
    if (t) t.weeklyProfit = parseFloat((t.weeklyProfit + (profit >= 0 ? 0.04 : -0.02)).toFixed(1));

  } else { return res.status(400).json({ error: 'Tipo inválido.' }); }

  if (db.operations[key].length > 200) db.operations[key].length = 200;
  saveDB(db);
  res.json({ stats: getStats(db, userId), traders: getTraders(db), operations: getOperations(db, userId, 20), positions: getPositions(db, userId) });
});

/* ════════════════════════════════════════════════════════════
   ALLOCATE  (wallet ↔ bot)
════════════════════════════════════════════════════════════ */

app.post('/api/allocate.php', (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const action = req.body.action;
  const amount = parseFloat(req.body.amount) || 0;
  if (!['to_bot','from_bot'].includes(action)) return res.status(400).json({ error: 'Ação inválida.' });
  if (amount <= 0) return res.status(400).json({ error: 'Valor inválido.' });

  const db  = loadDB();
  const key = String(userId);
  ensureAccount(db, userId);
  checkDayReset(db, userId);
  const acc = db.accounts[key];
  if (!db.transactions[key]) db.transactions[key] = [];

  if (action === 'to_bot') {
    if (amount > acc.balance) return res.status(400).json({ error: 'Saldo insuficiente na carteira principal.' });
    acc.balancePrev = acc.balance;
    acc.balance     = r4(acc.balance   - amount);
    acc.botFunds    = r4(acc.botFunds  + amount);
    db.transactions[key].unshift({ id: db.nextTxId++, type: 'Alocação para Bot', amount, time: nowDateTime() });
  } else {
    if (amount > acc.botFunds) return res.status(400).json({ error: 'Fundos do bot insuficientes.' });
    acc.balancePrev = acc.balance;
    acc.balance     = r4(acc.balance   + amount);
    acc.botFunds    = r4(acc.botFunds  - amount);
    db.transactions[key].unshift({ id: db.nextTxId++, type: 'Retirada do Bot', amount, time: nowDateTime() });
  }
  saveDB(db);
  res.json({ balance: acc.balance, botFunds: acc.botFunds });
});

/* ════════════════════════════════════════════════════════════
   DEPOSIT
════════════════════════════════════════════════════════════ */

app.post('/api/create_deposit.php', (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const amount = parseFloat(req.body.amount) || 0;
  if (amount <= 0) return res.status(400).json({ error: 'Valor inválido.' });
  const db    = loadDB();
  const since = Math.floor(Date.now() / 1000);
  const id    = db.nextDepId++;
  db.pending_deposits.push({ id, user_id: userId, amount, status: 'pending', created_at: since });
  saveDB(db);
  res.json({ id, since });
});

app.get('/api/poll_deposit.php', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const since    = parseInt(req.query.since)  || 0;
  const expected = parseFloat(req.query.amount) || 0;
  const pendId   = parseInt(req.query.id)    || 0;
  if (!since || expected <= 0 || !pendId) return res.status(400).json({ error: 'Parâmetros inválidos.' });

  const db   = loadDB();
  const pend = db.pending_deposits.find(p => p.id === pendId && p.user_id === userId && p.status === 'pending');
  if (!pend) return res.json({ status: 'not_found' });

  const WALLET = 'DkJDFb24fSTVHhiop2SJKtU1HhxPvus3emseXnX25UyV';
  const RPC    = 'https://api.mainnet-beta.solana.com';

  try {
    const sigRes  = await fetch(RPC, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'getSignaturesForAddress', params:[WALLET,{limit:10}] }) });
    const sigData = await sigRes.json();
    const sigs    = sigData.result || [];

    for (const entry of sigs) {
      if ((entry.blockTime || 0) < since || entry.err) continue;
      const sig = entry.signature;
      if (db.used_signatures.find(s => s.sig === sig)) continue;

      const txRes  = await fetch(RPC, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'getTransaction', params:[sig,{encoding:'json',maxSupportedTransactionVersion:0}] }) });
      const txData = await txRes.json();
      const tx     = txData.result;
      if (!tx || tx.meta?.err) continue;

      const keys     = tx.transaction?.message?.accountKeys || [];
      const idx      = keys.indexOf(WALLET);
      if (idx === -1) continue;
      const received = ((tx.meta.postBalances[idx] || 0) - (tx.meta.preBalances[idx] || 0)) / 1_000_000_000;
      if (received < (expected - 0.001)) continue;

      const key = String(userId);
      ensureAccount(db, userId);
      checkDayReset(db, userId);
      const acc = db.accounts[key];
      if (!db.transactions[key]) db.transactions[key] = [];
      acc.balancePrev = acc.balance;
      acc.balance     = r4(acc.balance + received);
      db.transactions[key].unshift({ id: db.nextTxId++, type: 'Depósito SOL', amount: received, time: nowDateTime() });
      db.used_signatures.push({ sig, created_at: nowDateTime() });
      pend.status = 'confirmed';
      saveDB(db);
      return res.json({ status: 'confirmed', balance: acc.balance, received });
    }
    res.json({ status: 'pending' });
  } catch { res.json({ status: 'rpc_error' }); }
});

/* ════════════════════════════════════════════════════════════
   WITHDRAW
════════════════════════════════════════════════════════════ */

app.post('/api/withdraw.php', (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const amount = parseFloat(req.body.amount) || 0;
  const wallet = (req.body.wallet || '').trim();
  if (amount <= 0)   return res.status(400).json({ error: 'Valor inválido.' });
  if (!wallet)       return res.status(400).json({ error: 'Insere o endereço da carteira de destino.' });
  if (wallet.length < 32 || wallet.length > 44) return res.status(400).json({ error: 'Endereço Solana inválido (32–44 caracteres).' });

  const db  = loadDB();
  const key = String(userId);
  ensureAccount(db, userId);
  checkDayReset(db, userId);
  const acc = db.accounts[key];
  if (!db.transactions[key]) db.transactions[key] = [];

  if (amount > acc.balance) return res.status(400).json({ error: `Saldo insuficiente. Disponível: ${acc.balance.toFixed(4)} SOL` });

  acc.balancePrev = acc.balance;
  acc.balance     = r4(acc.balance - amount);
  db.transactions[key].unshift({ id: db.nextTxId++, type: 'Levantamento', amount, wallet_address: wallet, time: nowDateTime() });
  saveDB(db);
  res.json({ balance: acc.balance });
});

/* ════════════════════════════════════════════════════════════
   RESET
════════════════════════════════════════════════════════════ */

app.post('/api/reset.php', (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const db  = loadDB();
  const key = String(userId);
  db.accounts[key]     = { balance:0, balancePrev:0, botFunds:0, dailyProfit:0, dailyPct:0, lastDate:'', botActive:0 };
  db.operations[key]   = [];
  db.transactions[key] = [];
  db.positions[key]    = [];
  db.pending_deposits  = db.pending_deposits.filter(p => p.user_id !== userId);
  saveDB(db);
  res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════════
   ADMIN
════════════════════════════════════════════════════════════ */

app.get('/api/admin/users.php', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const db    = loadDB();
  const users = db.users.map(u => {
    const acc = db.accounts[String(u.id)] || {};
    return { id: u.id, username: u.username, email: u.email, created_at: u.created_at, balance: acc.balance || 0, bot_funds: acc.botFunds || 0, daily_profit: acc.dailyProfit || 0 };
  });
  res.json({ users });
});

app.post('/api/admin/adjust.php', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const target = parseInt(req.body.user_id) || 0;
  const amount = parseFloat(req.body.amount) || 0;
  const type   = req.body.type;
  if (!target || amount <= 0 || !['add','remove'].includes(type)) return res.status(400).json({ error: 'Dados inválidos.' });

  const db  = loadDB();
  const key = String(target);
  ensureAccount(db, target);
  const acc = db.accounts[key];
  if (!db.transactions[key]) db.transactions[key] = [];

  if (type === 'remove' && amount > acc.balance) return res.status(400).json({ error: `Saldo insuficiente. Disponível: ${acc.balance.toFixed(4)} SOL` });

  const desc      = type === 'add' ? 'Admin: Depósito' : 'Admin: Remoção';
  acc.balancePrev = acc.balance;
  acc.balance     = r4(type === 'add' ? acc.balance + amount : acc.balance - amount);
  db.transactions[key].unshift({ id: db.nextTxId++, type: desc, amount, time: nowDateTime() });
  saveDB(db);
  res.json({ balance: acc.balance });
});

app.post('/api/admin/delete_user.php', (req, res) => {
  const adminId = requireAdmin(req, res);
  if (!adminId) return;
  const target = parseInt(req.body.user_id) || 0;
  if (!target)           return res.status(400).json({ error: 'user_id inválido.' });
  if (target === adminId) return res.status(400).json({ error: 'Não podes apagar a tua própria conta.' });

  const db  = loadDB();
  const key = String(target);
  const idx = db.users.findIndex(u => u.id === target);
  if (idx === -1) return res.status(404).json({ error: 'Utilizador não encontrado.' });

  const username = db.users[idx].username;
  db.users.splice(idx, 1);
  delete db.accounts[key];
  delete db.operations[key];
  delete db.transactions[key];
  delete db.positions[key];
  db.pending_deposits = db.pending_deposits.filter(p => p.user_id !== target);
  saveDB(db);
  res.json({ ok: true, deleted: username });
});

/* ════════════════════════════════════════════════════════════
   START
════════════════════════════════════════════════════════════ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SOL Copy Trading → http://localhost:${PORT}`));
