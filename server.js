'use strict';

const express  = require('express');
const session  = require('express-session');
const bcrypt   = require('bcryptjs');
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws       = require('ws');

neonConfig.webSocketConstructor = ws;

const app  = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.set('trust proxy', 1);

/* ════════════════════════════════════════════════════════════
   SCHEMA
════════════════════════════════════════════════════════════ */
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      balance REAL NOT NULL DEFAULT 0,
      balance_prev REAL NOT NULL DEFAULT 0,
      bot_funds REAL NOT NULL DEFAULT 0,
      daily_profit REAL NOT NULL DEFAULT 0,
      daily_pct REAL NOT NULL DEFAULT 0,
      last_date TEXT NOT NULL DEFAULT '',
      bot_active INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS traders (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      weekly_profit REAL NOT NULL DEFAULT 0,
      drawdown REAL NOT NULL DEFAULT 0,
      score INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS operations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      trader TEXT NOT NULL,
      type TEXT NOT NULL,
      pair TEXT NOT NULL,
      profit REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      wallet_address TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS positions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      pair TEXT NOT NULL,
      trader TEXT NOT NULL,
      amount REAL NOT NULL,
      opened_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS pending_deposits (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS used_signatures (
      sig TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS login_attempts (
      id SERIAL PRIMARY KEY,
      ip TEXT NOT NULL,
      attempted_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);

  const { rows } = await pool.query('SELECT COUNT(*) AS c FROM traders');
  if (parseInt(rows[0].c) === 0) {
    await pool.query(`
      INSERT INTO traders (name,weekly_profit,drawdown,score) VALUES
      ('trader1A',15.4,8.2,87),('trader2F',22.1,12.5,92),('trader3C',7.8,5.1,65),
      ('trader4B',18.9,25.3,45),('trader5E',11.2,9.8,78),('trader6D',5.3,7.2,58),
      ('trader7G',19.7,11.0,89),('trader8H',31.5,28.7,38),('trader9K',13.1,6.4,81),
      ('trader10M',4.2,9.1,52),('trader11R',26.8,14.3,94),('trader12T',8.5,4.7,63),
      ('trader13N',17.3,22.1,41),('trader14P',12.9,8.8,76),('trader15W',3.1,11.5,47),
      ('trader16Z',20.4,7.9,91),('trader17Q',14.7,16.2,69),('trader18J',6.9,5.5,60),
      ('trader19X',24.3,10.1,88),('trader20V',2.4,18.9,34),('trader21L',11.8,7.3,74),
      ('trader22S',29.1,31.4,29),('trader23Y',16.6,9.4,83),('trader24U',9.2,6.8,61),
      ('trader25O',21.5,13.7,86),('trader26I',1.8,8.3,44),('trader27E',18.2,24.6,42),
      ('trader28A',10.5,5.9,72),('trader29B',33.7,27.8,36),('trader30C',13.9,8.1,80)
    `);
    console.log('Traders inseridos.');
  }
  console.log('Base de dados pronta.');
}

/* ════════════════════════════════════════════════════════════
   SESSION STORE (Neon)
════════════════════════════════════════════════════════════ */
class NeonSessionStore extends session.Store {
  get(sid, cb) {
    pool.query('SELECT data FROM sessions WHERE sid=$1 AND expires_at > NOW()', [sid])
      .then(r => cb(null, r.rows[0] ? JSON.parse(r.rows[0].data) : null))
      .catch(cb);
  }
  set(sid, data, cb) {
    const exp = new Date(Date.now() + (data.cookie?.maxAge || 604800000));
    pool.query(`INSERT INTO sessions(sid,data,expires_at) VALUES($1,$2,$3)
                ON CONFLICT(sid) DO UPDATE SET data=$2, expires_at=$3`,
      [sid, JSON.stringify(data), exp])
      .then(() => cb(null)).catch(cb);
  }
  destroy(sid, cb) {
    pool.query('DELETE FROM sessions WHERE sid=$1', [sid])
      .then(() => cb(null)).catch(cb);
  }
}

/* ════════════════════════════════════════════════════════════
   MIDDLEWARE
════════════════════════════════════════════════════════════ */
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'sol-trading-2024-secret',
  resave: false,
  saveUninitialized: false,
  store: new NeonSessionStore(),
  cookie: { secure: 'auto', maxAge: 7 * 24 * 60 * 60 * 1000 },
}));
app.use(express.static(__dirname));

/* ════════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════════ */
const r4 = n => Math.round(n * 10000) / 10000;
const r2 = n => Math.round(n * 100)   / 100;
const nowDateTime = () => new Date().toLocaleString('pt-PT');
const nowTime     = () => new Date().toLocaleTimeString('pt-PT', { hour12: false });
const todayStr    = () => new Date().toLocaleDateString('pt-PT');

async function ensureAccount(userId) {
  await pool.query(
    `INSERT INTO accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING`,
    [userId]
  );
}

async function checkDayReset(userId) {
  await pool.query(
    `UPDATE accounts SET daily_profit=0, daily_pct=0, last_date=$1
     WHERE user_id=$2 AND last_date <> $1`,
    [todayStr(), userId]
  );
}

function requireAuth(req, res) {
  if (!req.session?.userId) { res.status(401).json({ error:'Não autenticado.', auth:false }); return null; }
  return req.session.userId;
}
function requireAdmin(req, res) {
  const uid = requireAuth(req, res);
  if (!uid) return null;
  if (!req.session.isAdmin) { res.status(403).json({ error:'Acesso negado.' }); return null; }
  return uid;
}

function calcStatus(t) {
  if (t.drawdown > 20)       return 'Removido';
  if (t.weekly_profit < 10)  return 'Suspenso';
  return 'Ativo';
}

async function getStats(userId) {
  const { rows: [acc] }  = await pool.query('SELECT * FROM accounts WHERE user_id=$1', [userId]);
  const { rows: [act] }  = await pool.query('SELECT COUNT(*) AS c FROM traders WHERE drawdown<=20 AND weekly_profit>=10');
  const { rows: [tot] }  = await pool.query('SELECT COUNT(*) AS c FROM traders');
  const { rows: [pos] }  = await pool.query('SELECT COALESCE(SUM(amount),0) AS v FROM positions WHERE user_id=$1', [userId]);
  return {
    totalBalance:       acc?.balance      || 0,
    totalBalancePrev:   acc?.balance_prev || 0,
    botFunds:           acc?.bot_funds    || 0,
    openPositionsValue: parseFloat(pos.v) || 0,
    dailyProfit:        acc?.daily_profit || 0,
    dailyProfitPct:     acc?.daily_pct    || 0,
    activeTraders:      parseInt(act.c),
    totalTraders:       parseInt(tot.c),
    botActive:          acc?.bot_active   || 0,
  };
}

async function getTraders() {
  const { rows } = await pool.query('SELECT * FROM traders ORDER BY id');
  return rows.map(t => ({ id:t.id, name:t.name, weeklyProfit:t.weekly_profit, drawdown:t.drawdown, score:t.score, status:calcStatus(t) }));
}

async function getOperations(userId, limit = 20) {
  const { rows } = await pool.query('SELECT * FROM operations WHERE user_id=$1 ORDER BY id DESC LIMIT $2', [userId, limit]);
  return rows.map(r => ({ id:r.id, trader:r.trader, type:r.type, pair:r.pair, profit:r.profit, time:r.created_at }));
}

async function getPositions(userId) {
  const { rows } = await pool.query('SELECT * FROM positions WHERE user_id=$1 ORDER BY id', [userId]);
  return rows.map(r => ({ id:r.id, pair:r.pair, trader:r.trader, amount:r.amount, opened_at:r.opened_at }));
}

/* ════════════════════════════════════════════════════════════
   AUTH
════════════════════════════════════════════════════════════ */

app.post('/api/auth/login.php', async (req, res) => {
  const loginVal = ((req.body.login || req.body.username) ?? '').trim();
  const { password } = req.body;
  if (!loginVal || !password) return res.status(400).json({ error:'Preenche todos os campos.' });

  const ip     = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const MAX    = 5;
  const cutoff = Math.floor(Date.now()/1000) - 900;

  await pool.query('DELETE FROM login_attempts WHERE attempted_at<$1', [cutoff]);
  const { rows:[att] } = await pool.query('SELECT COUNT(*) AS c FROM login_attempts WHERE ip=$1 AND attempted_at>=$2', [ip, cutoff]);
  if (parseInt(att.c) >= MAX) return res.status(429).json({ error:'Demasiadas tentativas. Tenta novamente em 15 min.' });

  const { rows:[user] } = await pool.query('SELECT * FROM users WHERE username=$1 OR email=$1', [loginVal]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    await pool.query('INSERT INTO login_attempts(ip,attempted_at) VALUES($1,$2)', [ip, Math.floor(Date.now()/1000)]);
    const rem = MAX - parseInt(att.c) - 1;
    return res.status(401).json({ error:`Utilizador ou palavra-passe incorretos.${rem > 0 ? ` (${rem} tentativas restantes)` : ''}` });
  }

  await pool.query('DELETE FROM login_attempts WHERE ip=$1', [ip]);
  await ensureAccount(user.id);
  req.session.userId   = user.id;
  req.session.username = user.username;
  req.session.isAdmin  = user.is_admin;
  res.json({ id:user.id, username:user.username, is_admin:user.is_admin });
});

app.post('/api/auth/register.php', async (req, res) => {
  const { username='', email='', password='' } = req.body;
  if (username.length < 3)                        return res.status(400).json({ error:'Nome de utilizador deve ter pelo menos 3 caracteres.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error:'Email inválido.' });
  if (password.length < 6)                        return res.status(400).json({ error:'Palavra-passe deve ter pelo menos 6 caracteres.' });
  if (!/^[a-zA-Z0-9_]+$/.test(username))          return res.status(400).json({ error:'Nome de utilizador só pode conter letras, números e _.' });

  const { rows:[ex] } = await pool.query('SELECT id FROM users WHERE username=$1 OR email=$2', [username, email]);
  if (ex) return res.status(409).json({ error:'Nome de utilizador ou email já em uso.' });

  const hash    = await bcrypt.hash(password, 10);
  const isAdmin = (username === 'KX3T' || email === 'manellopes1973@gmail.com') ? 1 : 0;
  try {
    const { rows:[u] } = await pool.query(
      'INSERT INTO users(username,email,password_hash,is_admin,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id',
      [username, email, hash, isAdmin, nowDateTime()]
    );
    await ensureAccount(u.id);
    req.session.userId   = u.id;
    req.session.username = username;
    req.session.isAdmin  = isAdmin;
    res.json({ id:u.id, username, is_admin:isAdmin });
  } catch { res.status(409).json({ error:'Nome de utilizador ou email já em uso.' }); }
});

app.get('/api/auth/me.php', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ auth:false });
  res.json({ id:req.session.userId, username:req.session.username, is_admin:req.session.isAdmin||0, auth:true });
});

app.post('/api/auth/logout.php', (req, res) => {
  req.session.destroy(() => res.json({ ok:true }));
});

/* ════════════════════════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════════════════════════ */

app.get('/api/dashboard.php', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  await ensureAccount(userId);
  await checkDayReset(userId);
  res.json({ stats: await getStats(userId), traders: await getTraders(), operations: await getOperations(userId), positions: await getPositions(userId) });
});

/* ════════════════════════════════════════════════════════════
   TRANSACTIONS
════════════════════════════════════════════════════════════ */

app.get('/api/transactions.php', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { rows } = await pool.query('SELECT * FROM transactions WHERE user_id=$1 ORDER BY id DESC LIMIT 200', [userId]);
  res.json(rows.map(r => ({ id:r.id, type:r.type, amount:r.amount, time:r.created_at })));
});

/* ════════════════════════════════════════════════════════════
   OPERATION
════════════════════════════════════════════════════════════ */

app.post('/api/operation.php', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { type, trader, pair } = req.body;
  const opTime = ((req.body.time||'').replace(/[^0-9:]/g,'')) || nowTime();
  if (!type || !trader || !pair) return res.status(400).json({ error:'Dados incompletos.' });

  await ensureAccount(userId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE accounts SET daily_profit=0,daily_pct=0,last_date=$1 WHERE user_id=$2 AND last_date<>$1`, [todayStr(), userId]);
    const { rows:[acc] } = await client.query('SELECT * FROM accounts WHERE user_id=$1', [userId]);

    if (type === 'Buy') {
      const amount = r4(parseFloat(req.body.amount)||0);
      if (amount <= 0)            { await client.query('ROLLBACK'); return res.status(400).json({ error:'Montante inválido.' }); }
      if (amount > acc.bot_funds) { await client.query('ROLLBACK'); return res.status(400).json({ error:'Fundos do bot insuficientes.' }); }
      await client.query('UPDATE accounts SET bot_funds=bot_funds-$1 WHERE user_id=$2', [amount, userId]);
      await client.query('INSERT INTO positions(user_id,pair,trader,amount,opened_at) VALUES($1,$2,$3,$4,$5)', [userId, pair, trader, amount, opTime]);
      await client.query('INSERT INTO operations(user_id,trader,type,pair,profit,created_at) VALUES($1,$2,$3,$4,$5,$6)', [userId, trader, 'Buy', pair, -amount, opTime]);

    } else if (type === 'Sell') {
      const posId  = parseInt(req.body.positionId)||0;
      const profit = r4(parseFloat(req.body.profit)||0);
      const { rows:[pos] } = await client.query('SELECT * FROM positions WHERE id=$1 AND user_id=$2', [posId, userId]);
      if (!pos) { await client.query('ROLLBACK'); return res.status(404).json({ error:'Posição não encontrada.' }); }

      const sellReturn = r4(pos.amount + profit);
      const newBot     = r4(acc.bot_funds + sellReturn);
      const newDailyP  = r4(acc.daily_profit + profit);
      const total      = newBot + acc.balance;
      const newPct     = total > 0 ? r2(newDailyP / total * 100) : 0;
      await client.query('UPDATE accounts SET bot_funds=$1,daily_profit=$2,daily_pct=$3 WHERE user_id=$4', [newBot, newDailyP, newPct, userId]);
      await client.query('DELETE FROM positions WHERE id=$1', [posId]);
      await client.query('INSERT INTO operations(user_id,trader,type,pair,profit,created_at) VALUES($1,$2,$3,$4,$5,$6)', [userId, pos.trader, 'Sell', pos.pair, profit, opTime]);
      await client.query('UPDATE traders SET weekly_profit=weekly_profit+$1 WHERE name=$2', [profit >= 0 ? 0.04 : -0.02, pos.trader]);
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ error:'Tipo inválido.' });
    }

    const { rows:[cnt] } = await client.query('SELECT COUNT(*) AS c FROM operations WHERE user_id=$1', [userId]);
    if (parseInt(cnt.c) > 200) {
      await client.query(`DELETE FROM operations WHERE id IN (SELECT id FROM operations WHERE user_id=$1 ORDER BY id ASC LIMIT $2)`, [userId, parseInt(cnt.c) - 200]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error:e.message });
  } finally { client.release(); }

  res.json({ stats: await getStats(userId), traders: await getTraders(), operations: await getOperations(userId), positions: await getPositions(userId) });
});

/* ════════════════════════════════════════════════════════════
   ALLOCATE
════════════════════════════════════════════════════════════ */

app.post('/api/allocate.php', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const action = req.body.action;
  const amount = parseFloat(req.body.amount)||0;
  if (!['to_bot','from_bot'].includes(action)) return res.status(400).json({ error:'Ação inválida.' });
  if (amount <= 0) return res.status(400).json({ error:'Valor inválido.' });

  await ensureAccount(userId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE accounts SET daily_profit=0,daily_pct=0,last_date=$1 WHERE user_id=$2 AND last_date<>$1`, [todayStr(), userId]);
    const { rows:[acc] } = await client.query('SELECT balance,bot_funds FROM accounts WHERE user_id=$1', [userId]);

    if (action === 'to_bot') {
      if (amount > acc.balance) { await client.query('ROLLBACK'); return res.status(400).json({ error:'Saldo insuficiente.' }); }
      await client.query('UPDATE accounts SET balance_prev=balance, balance=balance-$1, bot_funds=bot_funds+$1 WHERE user_id=$2', [amount, userId]);
      await client.query('INSERT INTO transactions(user_id,type,amount,created_at) VALUES($1,$2,$3,$4)', [userId,'Alocação para Bot',amount,nowDateTime()]);
    } else {
      if (amount > acc.bot_funds) { await client.query('ROLLBACK'); return res.status(400).json({ error:'Fundos do bot insuficientes.' }); }
      await client.query('UPDATE accounts SET balance_prev=balance, balance=balance+$1, bot_funds=bot_funds-$1 WHERE user_id=$2', [amount, userId]);
      await client.query('INSERT INTO transactions(user_id,type,amount,created_at) VALUES($1,$2,$3,$4)', [userId,'Retirada do Bot',amount,nowDateTime()]);
    }
    await client.query('COMMIT');
    const { rows:[upd] } = await pool.query('SELECT balance,bot_funds FROM accounts WHERE user_id=$1', [userId]);
    res.json({ balance:upd.balance, botFunds:upd.bot_funds });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error:e.message });
  } finally { client.release(); }
});

/* ════════════════════════════════════════════════════════════
   DEPOSIT
════════════════════════════════════════════════════════════ */

app.post('/api/create_deposit.php', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const amount = parseFloat(req.body.amount)||0;
  if (amount <= 0) return res.status(400).json({ error:'Valor inválido.' });
  const since = Math.floor(Date.now()/1000);
  const { rows:[r] } = await pool.query('INSERT INTO pending_deposits(user_id,amount,created_at) VALUES($1,$2,$3) RETURNING id', [userId, amount, since]);
  res.json({ id:r.id, since });
});

app.get('/api/poll_deposit.php', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const since    = parseInt(req.query.since)||0;
  const expected = parseFloat(req.query.amount)||0;
  const pendId   = parseInt(req.query.id)||0;
  if (!since || expected <= 0 || !pendId) return res.status(400).json({ error:'Parâmetros inválidos.' });

  const { rows:[pend] } = await pool.query('SELECT * FROM pending_deposits WHERE id=$1 AND user_id=$2 AND status=$3', [pendId, userId, 'pending']);
  if (!pend) return res.json({ status:'not_found' });

  const WALLET = 'DkJDFb24fSTVHhiop2SJKtU1HhxPvus3emseXnX25UyV';
  const RPC    = 'https://api.mainnet-beta.solana.com';
  try {
    const sigData = await (await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getSignaturesForAddress',params:[WALLET,{limit:10}]})})).json();
    for (const entry of (sigData.result||[])) {
      if ((entry.blockTime||0) < since || entry.err) continue;
      const sig = entry.signature;
      const { rows:[used] } = await pool.query('SELECT sig FROM used_signatures WHERE sig=$1', [sig]);
      if (used) continue;
      const tx = (await (await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',params:[sig,{encoding:'json',maxSupportedTransactionVersion:0}]})})).json()).result;
      if (!tx || tx.meta?.err) continue;
      const keys = tx.transaction?.message?.accountKeys||[];
      const idx  = keys.indexOf(WALLET);
      if (idx === -1) continue;
      const received = ((tx.meta.postBalances[idx]||0)-(tx.meta.preBalances[idx]||0))/1_000_000_000;
      if (received < (expected-0.001)) continue;
      await ensureAccount(userId);
      await checkDayReset(userId);
      const { rows:[acc] } = await pool.query('SELECT balance FROM accounts WHERE user_id=$1', [userId]);
      const nb = r4(acc.balance + received);
      await pool.query('UPDATE accounts SET balance_prev=balance, balance=$1 WHERE user_id=$2', [nb, userId]);
      await pool.query('INSERT INTO transactions(user_id,type,amount,created_at) VALUES($1,$2,$3,$4)', [userId,'Depósito SOL',received,nowDateTime()]);
      await pool.query('INSERT INTO used_signatures(sig,created_at) VALUES($1,$2)', [sig,nowDateTime()]);
      await pool.query('UPDATE pending_deposits SET status=$1 WHERE id=$2', ['confirmed',pendId]);
      return res.json({ status:'confirmed', balance:nb, received });
    }
    res.json({ status:'pending' });
  } catch { res.json({ status:'rpc_error' }); }
});

/* ════════════════════════════════════════════════════════════
   WITHDRAW
════════════════════════════════════════════════════════════ */

app.post('/api/withdraw.php', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const amount = parseFloat(req.body.amount)||0;
  const wallet = (req.body.wallet||'').trim();
  if (amount <= 0)   return res.status(400).json({ error:'Valor inválido.' });
  if (!wallet)       return res.status(400).json({ error:'Insere o endereço da carteira de destino.' });
  if (wallet.length < 32 || wallet.length > 44) return res.status(400).json({ error:'Endereço Solana inválido.' });

  await ensureAccount(userId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE accounts SET daily_profit=0,daily_pct=0,last_date=$1 WHERE user_id=$2 AND last_date<>$1`, [todayStr(), userId]);
    const { rows:[acc] } = await client.query('SELECT balance FROM accounts WHERE user_id=$1', [userId]);
    if (amount > acc.balance) { await client.query('ROLLBACK'); return res.status(400).json({ error:`Saldo insuficiente. Disponível: ${acc.balance.toFixed(4)} SOL` }); }
    await client.query('UPDATE accounts SET balance_prev=balance, balance=balance-$1 WHERE user_id=$2', [amount, userId]);
    await client.query('INSERT INTO transactions(user_id,type,amount,wallet_address,created_at) VALUES($1,$2,$3,$4,$5)', [userId,'Levantamento',amount,wallet,nowDateTime()]);
    await client.query('COMMIT');
    const { rows:[upd] } = await pool.query('SELECT balance FROM accounts WHERE user_id=$1', [userId]);
    res.json({ balance:upd.balance });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error:e.message });
  } finally { client.release(); }
});

/* ════════════════════════════════════════════════════════════
   RESET
════════════════════════════════════════════════════════════ */

app.post('/api/reset.php', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  await pool.query(`UPDATE accounts SET balance=0,balance_prev=0,bot_funds=0,daily_profit=0,daily_pct=0,last_date='' WHERE user_id=$1`, [userId]);
  await pool.query('DELETE FROM operations   WHERE user_id=$1', [userId]);
  await pool.query('DELETE FROM transactions WHERE user_id=$1', [userId]);
  await pool.query('DELETE FROM positions    WHERE user_id=$1', [userId]);
  await pool.query('DELETE FROM pending_deposits WHERE user_id=$1', [userId]);
  res.json({ ok:true });
});

/* ════════════════════════════════════════════════════════════
   ADMIN
════════════════════════════════════════════════════════════ */

app.get('/api/admin/users.php', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { rows } = await pool.query(`
    SELECT u.id, u.username, u.email, u.created_at,
           COALESCE(a.balance,0) AS balance,
           COALESCE(a.bot_funds,0) AS bot_funds,
           COALESCE(a.daily_profit,0) AS daily_profit
    FROM users u LEFT JOIN accounts a ON a.user_id=u.id ORDER BY u.id`);
  res.json({ users: rows });
});

app.post('/api/admin/adjust.php', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const target = parseInt(req.body.user_id)||0;
  const amount = parseFloat(req.body.amount)||0;
  const type   = req.body.type;
  if (!target || amount <= 0 || !['add','remove'].includes(type)) return res.status(400).json({ error:'Dados inválidos.' });

  await ensureAccount(target);
  const { rows:[acc] } = await pool.query('SELECT balance FROM accounts WHERE user_id=$1', [target]);
  if (!acc) return res.status(404).json({ error:'Conta não encontrada.' });
  if (type === 'remove' && amount > acc.balance) return res.status(400).json({ error:`Saldo insuficiente.` });

  const desc = type === 'add' ? 'Admin: Depósito' : 'Admin: Remoção';
  await pool.query(`UPDATE accounts SET balance_prev=balance, balance=balance${type==='add'?'+':'-'}$1 WHERE user_id=$2`, [amount, target]);
  await pool.query('INSERT INTO transactions(user_id,type,amount,created_at) VALUES($1,$2,$3,$4)', [target, desc, amount, nowDateTime()]);
  const { rows:[upd] } = await pool.query('SELECT balance FROM accounts WHERE user_id=$1', [target]);
  res.json({ balance:upd.balance });
});

app.post('/api/admin/delete_user.php', async (req, res) => {
  const adminId = requireAdmin(req, res);
  if (!adminId) return;
  const target = parseInt(req.body.user_id)||0;
  if (!target)            return res.status(400).json({ error:'user_id inválido.' });
  if (target === adminId) return res.status(400).json({ error:'Não podes apagar a tua própria conta.' });

  const { rows:[u] } = await pool.query('SELECT username FROM users WHERE id=$1', [target]);
  if (!u) return res.status(404).json({ error:'Utilizador não encontrado.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const t of ['positions','operations','transactions','pending_deposits','accounts'])
      await client.query(`DELETE FROM ${t} WHERE user_id=$1`, [target]);
    await client.query('DELETE FROM users WHERE id=$1', [target]);
    await client.query('COMMIT');
    res.json({ ok:true, deleted:u.username });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error:e.message });
  } finally { client.release(); }
});

/* ════════════════════════════════════════════════════════════
   START
════════════════════════════════════════════════════════════ */
const PORT = process.env.PORT || 3000;
initDB()
  .then(() => app.listen(PORT, () => console.log(`SOL Copy Trading → http://localhost:${PORT}`)))
  .catch(err => { console.error('Erro ao iniciar:', err.message); process.exit(1); });
