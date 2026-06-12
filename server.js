'use strict';

const express  = require('express');
const session  = require('express-session');
const bcrypt   = require('bcryptjs');
const Database = require('better-sqlite3');
const path     = require('path');

const app     = express();
const DB_PATH = path.join(__dirname, 'data.db');
const db      = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ════════════════════════════════════════════════════════════
   SCHEMA
════════════════════════════════════════════════════════════ */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS account (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL UNIQUE,
    balance      REAL    NOT NULL DEFAULT 0,
    balance_prev REAL    NOT NULL DEFAULT 0,
    bot_funds    REAL    NOT NULL DEFAULT 0,
    daily_profit REAL    NOT NULL DEFAULT 0,
    daily_pct    REAL    NOT NULL DEFAULT 0,
    last_date    TEXT    NOT NULL DEFAULT '',
    bot_active   INTEGER NOT NULL DEFAULT 0,
    last_tick    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS traders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL UNIQUE,
    weekly_profit REAL NOT NULL DEFAULT 0,
    drawdown      REAL NOT NULL DEFAULT 0,
    score         INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS operations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL DEFAULT 1,
    trader     TEXT    NOT NULL,
    type       TEXT    NOT NULL,
    pair       TEXT    NOT NULL,
    profit     REAL    NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL DEFAULT 1,
    type           TEXT    NOT NULL,
    amount         REAL    NOT NULL,
    wallet_address TEXT    NOT NULL DEFAULT '',
    created_at     TEXT    NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS positions (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER NOT NULL DEFAULT 1,
    pair      TEXT    NOT NULL,
    trader    TEXT    NOT NULL,
    amount    REAL    NOT NULL,
    opened_at TEXT    NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS pending_deposits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL DEFAULT 1,
    amount     REAL    NOT NULL,
    status     TEXT    NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS used_signatures (
    sig        TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS login_attempts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ip           TEXT    NOT NULL,
    attempted_at INTEGER NOT NULL DEFAULT 0
  );
`);

/* Seed traders */
if (db.prepare('SELECT COUNT(*) AS c FROM traders').get().c === 0) {
  const ins = db.prepare('INSERT INTO traders (name,weekly_profit,drawdown,score) VALUES (?,?,?,?)');
  const seed = db.transaction(() => {
    [
      ['trader1A',15.4,8.2,87], ['trader2F',22.1,12.5,92], ['trader3C',7.8,5.1,65],
      ['trader4B',18.9,25.3,45], ['trader5E',11.2,9.8,78], ['trader6D',5.3,7.2,58],
      ['trader7G',19.7,11.0,89], ['trader8H',31.5,28.7,38], ['trader9K',13.1,6.4,81],
      ['trader10M',4.2,9.1,52], ['trader11R',26.8,14.3,94], ['trader12T',8.5,4.7,63],
      ['trader13N',17.3,22.1,41], ['trader14P',12.9,8.8,76], ['trader15W',3.1,11.5,47],
      ['trader16Z',20.4,7.9,91], ['trader17Q',14.7,16.2,69], ['trader18J',6.9,5.5,60],
      ['trader19X',24.3,10.1,88], ['trader20V',2.4,18.9,34], ['trader21L',11.8,7.3,74],
      ['trader22S',29.1,31.4,29], ['trader23Y',16.6,9.4,83], ['trader24U',9.2,6.8,61],
      ['trader25O',21.5,13.7,86], ['trader26I',1.8,8.3,44], ['trader27E',18.2,24.6,42],
      ['trader28A',10.5,5.9,72], ['trader29B',33.7,27.8,36], ['trader30C',13.9,8.1,80],
    ].forEach(r => ins.run(...r));
  });
  seed();
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

function ensureAccount(userId) {
  if (!db.prepare('SELECT id FROM account WHERE user_id=?').get(userId)) {
    db.prepare('INSERT INTO account (user_id) VALUES (?)').run(userId);
  }
}

function checkDayReset(userId) {
  const row = db.prepare('SELECT last_date FROM account WHERE user_id=?').get(userId);
  if (row && row.last_date !== todayStr()) {
    db.prepare('UPDATE account SET daily_profit=0,daily_pct=0,last_date=? WHERE user_id=?').run(todayStr(), userId);
  }
}

function requireAuth(req, res) {
  if (!req.session?.userId) {
    res.status(401).json({ error: 'Não autenticado.', auth: false });
    return null;
  }
  return req.session.userId;
}

function calcStatus(t) {
  if (t.drawdown      > 20) return 'Removido';
  if (t.weekly_profit < 10) return 'Suspenso';
  return 'Ativo';
}

function getStats(userId) {
  const acc    = db.prepare('SELECT * FROM account WHERE user_id=?').get(userId);
  const active = db.prepare('SELECT COUNT(*) AS c FROM traders WHERE drawdown<=20 AND weekly_profit>=10').get().c;
  const total  = db.prepare('SELECT COUNT(*) AS c FROM traders').get().c;
  const openV  = db.prepare('SELECT COALESCE(SUM(amount),0) AS v FROM positions WHERE user_id=?').get(userId).v;
  return {
    totalBalance:       acc ? acc.balance      : 0,
    totalBalancePrev:   acc ? acc.balance_prev : 0,
    botFunds:           acc ? acc.bot_funds    : 0,
    openPositionsValue: openV,
    dailyProfit:        acc ? acc.daily_profit : 0,
    dailyProfitPct:     acc ? acc.daily_pct    : 0,
    activeTraders:      active,
    totalTraders:       total,
    botActive:          acc ? acc.bot_active   : 0,
  };
}

function getTraders() {
  return db.prepare('SELECT * FROM traders ORDER BY id').all().map(t => ({
    id: t.id, name: t.name,
    weeklyProfit: t.weekly_profit,
    drawdown: t.drawdown,
    score: t.score,
    status: calcStatus(t),
  }));
}

function getOperations(userId, limit = 20) {
  return db.prepare('SELECT * FROM operations WHERE user_id=? ORDER BY id DESC LIMIT ?').all(userId, limit)
    .map(r => ({ id: r.id, trader: r.trader, type: r.type, pair: r.pair, profit: r.profit, time: r.created_at }));
}

function getPositions(userId) {
  return db.prepare('SELECT * FROM positions WHERE user_id=? ORDER BY id ASC').all(userId)
    .map(r => ({ id: r.id, pair: r.pair, trader: r.trader, amount: r.amount, opened_at: r.opened_at }));
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
  const cutoff = Math.floor(Date.now() / 1000) - WINDOW;

  db.prepare('DELETE FROM login_attempts WHERE attempted_at<?').run(cutoff);
  const attempts = db.prepare('SELECT COUNT(*) AS c FROM login_attempts WHERE ip=? AND attempted_at>=?').get(ip, cutoff).c;
  if (attempts >= MAX) return res.status(429).json({ error: 'Demasiadas tentativas. Tenta novamente em 15 min.' });

  const user = db.prepare('SELECT * FROM users WHERE username=? OR email=?').get(loginVal, loginVal);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    db.prepare('INSERT INTO login_attempts (ip,attempted_at) VALUES (?,?)').run(ip, Math.floor(Date.now() / 1000));
    const rem = MAX - attempts - 1;
    return res.status(401).json({ error: `Utilizador ou palavra-passe incorretos.${rem > 0 ? ` (${rem} tentativas restantes)` : ''}` });
  }

  db.prepare('DELETE FROM login_attempts WHERE ip=?').run(ip);
  ensureAccount(user.id);
  req.session.userId   = user.id;
  req.session.username = user.username;
  req.session.isAdmin  = user.is_admin;
  res.json({ id: user.id, username: user.username, is_admin: user.is_admin });
});

app.post('/api/auth/register.php', async (req, res) => {
  const { username = '', email = '', password = '' } = req.body;
  if (username.length < 3)                         return res.status(400).json({ error: 'Nome de utilizador deve ter pelo menos 3 caracteres.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))  return res.status(400).json({ error: 'Email inválido.' });
  if (password.length < 6)                         return res.status(400).json({ error: 'Palavra-passe deve ter pelo menos 6 caracteres.' });
  if (!/^[a-zA-Z0-9_]+$/.test(username))           return res.status(400).json({ error: 'Nome de utilizador só pode conter letras, números e _.' });

  if (db.prepare('SELECT id FROM users WHERE username=? OR email=?').get(username, email))
    return res.status(409).json({ error: 'Nome de utilizador ou email já em uso.' });

  const hash    = await bcrypt.hash(password, 10);
  const isAdmin = (username === 'KX3T' || email === 'manellopes1973@gmail.com') ? 1 : 0;

  try {
    const info   = db.prepare('INSERT INTO users (username,email,password_hash,is_admin) VALUES (?,?,?,?)').run(username, email, hash, isAdmin);
    const userId = info.lastInsertRowid;
    ensureAccount(userId);
    req.session.userId   = userId;
    req.session.username = username;
    req.session.isAdmin  = isAdmin;
    res.json({ id: userId, username, is_admin: isAdmin });
  } catch {
    res.status(409).json({ error: 'Nome de utilizador ou email já em uso.' });
  }
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
  ensureAccount(userId);
  checkDayReset(userId);
  res.json({ stats: getStats(userId), traders: getTraders(), operations: getOperations(userId, 20), positions: getPositions(userId) });
});

/* ════════════════════════════════════════════════════════════
   TRANSACTIONS
════════════════════════════════════════════════════════════ */

app.get('/api/transactions.php', (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const txs = db.prepare('SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 200').all(userId);
  res.json(txs.map(r => ({ id: r.id, type: r.type, amount: r.amount, time: r.created_at })));
});

/* ════════════════════════════════════════════════════════════
   OPERATION  (Buy / Sell)
════════════════════════════════════════════════════════════ */

app.post('/api/operation.php', (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { type, trader, pair } = req.body;
  const opTime = ((req.body.time || '').replace(/[^0-9:]/g, '')) || nowTime();
  if (!type || !trader || !pair) return res.status(400).json({ error: 'Dados incompletos.' });

  ensureAccount(userId);
  let errStatus = 500, errMsg = 'Erro interno.';

  const doOp = db.transaction(() => {
    checkDayReset(userId);
    const acc = db.prepare('SELECT * FROM account WHERE user_id=?').get(userId);

    if (type === 'Buy') {
      const amount = r4(parseFloat(req.body.amount) || 0);
      if (amount <= 0)              { errStatus = 400; throw new Error('Montante inválido.'); }
      if (amount > acc.bot_funds)   { errStatus = 400; throw new Error('Fundos do bot insuficientes.'); }
      db.prepare('UPDATE account SET bot_funds=? WHERE user_id=?').run(r4(acc.bot_funds - amount), userId);
      db.prepare('INSERT INTO positions (user_id,pair,trader,amount,opened_at) VALUES (?,?,?,?,?)').run(userId, pair, trader, amount, opTime);
      db.prepare('INSERT INTO operations (user_id,trader,type,pair,profit,created_at) VALUES (?,?,?,?,?,?)').run(userId, trader, 'Buy', pair, -amount, opTime);

    } else if (type === 'Sell') {
      const posId  = parseInt(req.body.positionId) || 0;
      const profit = r4(parseFloat(req.body.profit) || 0);
      const pos    = db.prepare('SELECT * FROM positions WHERE id=? AND user_id=?').get(posId, userId);
      if (!pos) { errStatus = 404; throw new Error('Posição não encontrada.'); }

      const sellReturn = r4(pos.amount + profit);
      const newBot     = r4(acc.bot_funds + sellReturn);
      const newDailyP  = r4(acc.daily_profit + profit);
      const total      = newBot + acc.balance;
      const newPct     = total > 0 ? r2(newDailyP / total * 100) : 0;
      db.prepare('UPDATE account SET bot_funds=?,daily_profit=?,daily_pct=? WHERE user_id=?').run(newBot, newDailyP, newPct, userId);
      db.prepare('DELETE FROM positions WHERE id=? AND user_id=?').run(posId, userId);
      db.prepare('INSERT INTO operations (user_id,trader,type,pair,profit,created_at) VALUES (?,?,?,?,?,?)').run(userId, pos.trader, 'Sell', pos.pair, profit, opTime);
      const t = db.prepare('SELECT weekly_profit FROM traders WHERE name=?').get(pos.trader);
      if (t) db.prepare('UPDATE traders SET weekly_profit=? WHERE name=?').run(parseFloat((t.weekly_profit + (profit >= 0 ? 0.04 : -0.02)).toFixed(1)), pos.trader);

    } else { errStatus = 400; throw new Error('Tipo inválido.'); }

    const old = db.prepare('SELECT id FROM operations WHERE user_id=? ORDER BY id DESC LIMIT -1 OFFSET 200').all(userId);
    if (old.length) db.exec(`DELETE FROM operations WHERE id IN (${old.map(o => o.id).join(',')})`);
  });

  try {
    doOp();
    res.json({ stats: getStats(userId), traders: getTraders(), operations: getOperations(userId, 20), positions: getPositions(userId) });
  } catch (e) {
    res.status(errStatus).json({ error: e.message || errMsg });
  }
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

  ensureAccount(userId);
  let errStatus = 500;

  const doAlloc = db.transaction(() => {
    checkDayReset(userId);
    const acc = db.prepare('SELECT balance,bot_funds FROM account WHERE user_id=?').get(userId);
    let newBal = acc.balance, newBot = acc.bot_funds, txType = '';

    if (action === 'to_bot') {
      if (amount > acc.balance) { errStatus = 400; throw new Error('Saldo insuficiente na carteira principal.'); }
      newBal = r4(acc.balance - amount); newBot = r4(acc.bot_funds + amount); txType = 'Alocação para Bot';
    } else {
      if (amount > acc.bot_funds) { errStatus = 400; throw new Error('Fundos do bot insuficientes.'); }
      newBal = r4(acc.balance + amount); newBot = r4(acc.bot_funds - amount); txType = 'Retirada do Bot';
    }
    db.prepare('UPDATE account SET balance_prev=balance,balance=?,bot_funds=? WHERE user_id=?').run(newBal, newBot, userId);
    db.prepare('INSERT INTO transactions (user_id,type,amount,created_at) VALUES (?,?,?,?)').run(userId, txType, amount, nowDateTime());
    return { balance: newBal, botFunds: newBot };
  });

  try { res.json(doAlloc()); }
  catch (e) { res.status(errStatus).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════════
   DEPOSIT  (create pending + poll Solana)
════════════════════════════════════════════════════════════ */

app.post('/api/create_deposit.php', (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const amount = parseFloat(req.body.amount) || 0;
  if (amount <= 0) return res.status(400).json({ error: 'Valor inválido.' });
  const since = Math.floor(Date.now() / 1000);
  const info  = db.prepare('INSERT INTO pending_deposits (user_id,amount,created_at) VALUES (?,?,?)').run(userId, amount, since);
  res.json({ id: info.lastInsertRowid, since });
});

app.get('/api/poll_deposit.php', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const since    = parseInt(req.query.since)  || 0;
  const expected = parseFloat(req.query.amount) || 0;
  const pendId   = parseInt(req.query.id)    || 0;
  if (!since || expected <= 0 || !pendId) return res.status(400).json({ error: 'Parâmetros inválidos.' });

  const pend = db.prepare('SELECT * FROM pending_deposits WHERE id=? AND user_id=? AND status=?').get(pendId, userId, 'pending');
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
      if (db.prepare('SELECT sig FROM used_signatures WHERE sig=?').get(sig)) continue;

      const txRes  = await fetch(RPC, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'getTransaction', params:[sig,{encoding:'json',maxSupportedTransactionVersion:0}] }) });
      const txData = await txRes.json();
      const tx     = txData.result;
      if (!tx || tx.meta?.err) continue;

      const keys     = tx.transaction?.message?.accountKeys || [];
      const idx      = keys.indexOf(WALLET);
      if (idx === -1) continue;
      const received = ((tx.meta.postBalances[idx] || 0) - (tx.meta.preBalances[idx] || 0)) / 1_000_000_000;
      if (received < (expected - 0.001)) continue;

      const newBal = db.transaction(() => {
        checkDayReset(userId);
        const acc = db.prepare('SELECT balance FROM account WHERE user_id=?').get(userId);
        const nb  = r4(acc.balance + received);
        db.prepare('UPDATE account SET balance_prev=balance,balance=? WHERE user_id=?').run(nb, userId);
        db.prepare('INSERT INTO transactions (user_id,type,amount,created_at) VALUES (?,?,?,?)').run(userId, 'Depósito SOL', received, nowDateTime());
        db.prepare('INSERT INTO used_signatures (sig,created_at) VALUES (?,?)').run(sig, nowDateTime());
        db.prepare('UPDATE pending_deposits SET status=? WHERE id=? AND user_id=?').run('confirmed', pendId, userId);
        return nb;
      })();
      return res.json({ status:'confirmed', balance: newBal, received });
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

  ensureAccount(userId);
  let errStatus = 500;

  const doWith = db.transaction(() => {
    checkDayReset(userId);
    const acc = db.prepare('SELECT balance FROM account WHERE user_id=?').get(userId);
    if (amount > acc.balance) { errStatus = 400; throw new Error(`Saldo insuficiente. Disponível: ${acc.balance.toFixed(4)} SOL`); }
    const nb = r4(acc.balance - amount);
    db.prepare('UPDATE account SET balance_prev=balance,balance=? WHERE user_id=?').run(nb, userId);
    db.prepare('INSERT INTO transactions (user_id,type,amount,wallet_address,created_at) VALUES (?,?,?,?,?)').run(userId, 'Levantamento', amount, wallet, nowDateTime());
    return nb;
  });

  try { res.json({ balance: doWith() }); }
  catch (e) { res.status(errStatus).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════════
   RESET
════════════════════════════════════════════════════════════ */

app.post('/api/reset.php', (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  db.transaction(() => {
    db.prepare("UPDATE account SET balance=0,balance_prev=0,bot_funds=0,daily_profit=0,daily_pct=0,last_date='' WHERE user_id=?").run(userId);
    db.prepare('DELETE FROM operations   WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM transactions WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM positions    WHERE user_id=?').run(userId);
  })();
  res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════════
   ADMIN
════════════════════════════════════════════════════════════ */

function requireAdmin(req, res) {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  if (!req.session.isAdmin) { res.status(403).json({ error: 'Acesso negado.' }); return null; }
  return userId;
}

app.get('/api/admin/users.php', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const rows = db.prepare(`
    SELECT u.id, u.username, u.email, u.created_at,
           COALESCE(a.balance,0)      AS balance,
           COALESCE(a.bot_funds,0)    AS bot_funds,
           COALESCE(a.daily_profit,0) AS daily_profit
    FROM users u
    LEFT JOIN account a ON a.user_id=u.id
    ORDER BY u.id ASC
  `).all();
  res.json({ users: rows.map(r => ({ id: r.id, username: r.username, email: r.email, created_at: r.created_at, balance: r.balance, bot_funds: r.bot_funds, daily_profit: r.daily_profit })) });
});

app.post('/api/admin/adjust.php', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const target = parseInt(req.body.user_id) || 0;
  const amount = parseFloat(req.body.amount) || 0;
  const type   = req.body.type;
  if (!target || amount <= 0 || !['add','remove'].includes(type)) return res.status(400).json({ error: 'Dados inválidos.' });

  ensureAccount(target);
  let errStatus = 500;

  const doAdj = db.transaction(() => {
    const acc = db.prepare('SELECT balance FROM account WHERE user_id=?').get(target);
    if (!acc) { errStatus = 404; throw new Error('Conta não encontrada.'); }
    if (type === 'remove' && amount > acc.balance) { errStatus = 400; throw new Error(`Saldo insuficiente. Disponível: ${acc.balance.toFixed(4)} SOL`); }
    const nb   = r4(type === 'add' ? acc.balance + amount : acc.balance - amount);
    const desc = type === 'add' ? 'Admin: Depósito' : 'Admin: Remoção';
    db.prepare('UPDATE account SET balance_prev=balance,balance=? WHERE user_id=?').run(nb, target);
    db.prepare('INSERT INTO transactions (user_id,type,amount,created_at) VALUES (?,?,?,?)').run(target, desc, amount, nowDateTime());
    return nb;
  });

  try { res.json({ balance: doAdj() }); }
  catch (e) { res.status(errStatus).json({ error: e.message }); }
});

app.post('/api/admin/delete_user.php', (req, res) => {
  const adminId = requireAdmin(req, res);
  if (!adminId) return;
  const target = parseInt(req.body.user_id) || 0;
  if (!target) return res.status(400).json({ error: 'user_id inválido.' });
  if (target === adminId) return res.status(400).json({ error: 'Não podes apagar a tua própria conta.' });

  const user = db.prepare('SELECT id,username FROM users WHERE id=?').get(target);
  if (!user) return res.status(404).json({ error: 'Utilizador não encontrado.' });

  db.transaction(() => {
    ['positions','operations','transactions','pending_deposits','account'].forEach(t =>
      db.prepare(`DELETE FROM ${t} WHERE user_id=?`).run(target));
    db.prepare('DELETE FROM users WHERE id=?').run(target);
  })();
  res.json({ ok: true, deleted: user.username });
});

/* ════════════════════════════════════════════════════════════
   START
════════════════════════════════════════════════════════════ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SOL Copy Trading → http://localhost:${PORT}`));
