'use strict';

const express  = require('express');
const session  = require('express-session');
const bcrypt   = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();

/* ════════════════════════════════════════════════════════════
   MONGODB
════════════════════════════════════════════════════════════ */
const MONGO_URI = process.env.MONGODB_URI || '';
let db;

async function connectDB() {
  if (!MONGO_URI) { console.error('MONGODB_URI não definido!'); process.exit(1); }
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db();
  console.log('MongoDB ligado.');

  /* Índices únicos */
  await db.collection('users').createIndex({ username: 1 }, { unique: true });
  await db.collection('users').createIndex({ email: 1 },    { unique: true });

  /* Seed traders se estiver vazio */
  const count = await db.collection('traders').countDocuments();
  if (count === 0) {
    await db.collection('traders').insertMany([
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
    ]);
    console.log('Traders inseridos.');
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
  cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));
app.use(express.static(__dirname));

/* ════════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════════ */
const r4 = n => Math.round(n * 10000) / 10000;
const r2 = n => Math.round(n * 100)   / 100;

function nowDateTime() { return new Date().toLocaleString('pt-PT'); }
function nowTime()     { return new Date().toLocaleTimeString('pt-PT', { hour12: false }); }
function todayStr()    { return new Date().toLocaleDateString('pt-PT'); }

async function ensureAccount(userId) {
  const exists = await db.collection('accounts').findOne({ userId });
  if (!exists) {
    await db.collection('accounts').insertOne({
      userId, balance:0, balancePrev:0, botFunds:0,
      dailyProfit:0, dailyPct:0, lastDate:'', botActive:0,
    });
  }
}

async function checkDayReset(userId) {
  const acc = await db.collection('accounts').findOne({ userId });
  if (acc && acc.lastDate !== todayStr()) {
    await db.collection('accounts').updateOne({ userId }, { $set: { dailyProfit:0, dailyPct:0, lastDate: todayStr() } });
  }
}

function requireAuth(req, res) {
  if (!req.session?.userId) { res.status(401).json({ error:'Não autenticado.', auth:false }); return null; }
  return req.session.userId;
}

function requireAdmin(req, res) {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  if (!req.session.isAdmin) { res.status(403).json({ error:'Acesso negado.' }); return null; }
  return userId;
}

function calcStatus(t) {
  if (t.drawdown     > 20) return 'Removido';
  if (t.weeklyProfit < 10) return 'Suspenso';
  return 'Ativo';
}

async function getStats(userId) {
  const acc   = await db.collection('accounts').findOne({ userId });
  const active = await db.collection('traders').countDocuments({ drawdown:{ $lte:20 }, weeklyProfit:{ $gte:10 } });
  const total  = await db.collection('traders').countDocuments();
  const posAgg = await db.collection('positions').aggregate([{ $match:{ userId } }, { $group:{ _id:null, total:{ $sum:'$amount' } } }]).toArray();
  const openV  = posAgg[0]?.total || 0;
  return {
    totalBalance:       acc?.balance      || 0,
    totalBalancePrev:   acc?.balancePrev  || 0,
    botFunds:           acc?.botFunds     || 0,
    openPositionsValue: openV,
    dailyProfit:        acc?.dailyProfit  || 0,
    dailyProfitPct:     acc?.dailyPct     || 0,
    activeTraders:      active,
    totalTraders:       total,
    botActive:          acc?.botActive    || 0,
  };
}

async function getTraders() {
  const traders = await db.collection('traders').find().sort({ _id:1 }).toArray();
  return traders.map((t, i) => ({ id:i+1, name:t.name, weeklyProfit:t.weeklyProfit, drawdown:t.drawdown, score:t.score, status:calcStatus(t) }));
}

async function getOperations(userId, limit = 20) {
  return db.collection('operations').find({ userId }).sort({ _id:-1 }).limit(limit).toArray()
    .then(rows => rows.map(r => ({ id:r._id.toString(), trader:r.trader, type:r.type, pair:r.pair, profit:r.profit, time:r.time })));
}

async function getPositions(userId) {
  return db.collection('positions').find({ userId }).sort({ _id:1 }).toArray()
    .then(rows => rows.map(r => ({ id:r._id.toString(), pair:r.pair, trader:r.trader, amount:r.amount, opened_at:r.opened_at })));
}

/* ════════════════════════════════════════════════════════════
   AUTH
════════════════════════════════════════════════════════════ */

app.post('/api/auth/login.php', async (req, res) => {
  const loginVal = ((req.body.login || req.body.username) ?? '').trim();
  const { password } = req.body;
  if (!loginVal || !password) return res.status(400).json({ error:'Preenche todos os campos.' });

  const ip     = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const WINDOW = 15 * 60;
  const MAX    = 5;
  const cutoff = new Date(Date.now() - WINDOW * 1000);

  await db.collection('loginAttempts').deleteMany({ attempted_at:{ $lt: cutoff } });
  const attempts = await db.collection('loginAttempts').countDocuments({ ip, attempted_at:{ $gte: cutoff } });
  if (attempts >= MAX) return res.status(429).json({ error:'Demasiadas tentativas. Tenta novamente em 15 min.' });

  const user = await db.collection('users').findOne({ $or:[{ username:loginVal },{ email:loginVal }] });
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    await db.collection('loginAttempts').insertOne({ ip, attempted_at: new Date() });
    const rem = MAX - attempts - 1;
    return res.status(401).json({ error:`Utilizador ou palavra-passe incorretos.${rem > 0 ? ` (${rem} tentativas restantes)` : ''}` });
  }

  await db.collection('loginAttempts').deleteMany({ ip });
  await ensureAccount(user._id.toString());

  req.session.userId   = user._id.toString();
  req.session.username = user.username;
  req.session.isAdmin  = user.is_admin || 0;
  res.json({ id: req.session.userId, username: user.username, is_admin: user.is_admin || 0 });
});

app.post('/api/auth/register.php', async (req, res) => {
  const { username='', email='', password='' } = req.body;
  if (username.length < 3)                        return res.status(400).json({ error:'Nome de utilizador deve ter pelo menos 3 caracteres.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error:'Email inválido.' });
  if (password.length < 6)                        return res.status(400).json({ error:'Palavra-passe deve ter pelo menos 6 caracteres.' });
  if (!/^[a-zA-Z0-9_]+$/.test(username))          return res.status(400).json({ error:'Nome de utilizador só pode conter letras, números e _.' });

  const exists = await db.collection('users').findOne({ $or:[{ username },{ email }] });
  if (exists) return res.status(409).json({ error:'Nome de utilizador ou email já em uso.' });

  const hash    = await bcrypt.hash(password, 10);
  const isAdmin = (username === 'KX3T' || email === 'manellopes1973@gmail.com') ? 1 : 0;

  try {
    const result = await db.collection('users').insertOne({ username, email, password_hash:hash, is_admin:isAdmin, created_at: nowDateTime() });
    const userId = result.insertedId.toString();
    await ensureAccount(userId);
    req.session.userId   = userId;
    req.session.username = username;
    req.session.isAdmin  = isAdmin;
    res.json({ id: userId, username, is_admin: isAdmin });
  } catch {
    res.status(409).json({ error:'Nome de utilizador ou email já em uso.' });
  }
});

app.get('/api/auth/me.php', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ auth:false });
  res.json({ id:req.session.userId, username:req.session.username, is_admin:req.session.isAdmin||0, auth:true });
});

app.post('/api/auth/logout.php', (req, res) => {
  req.session.destroy();
  res.json({ ok:true });
});

/* ════════════════════════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════════════════════════ */

app.get('/api/dashboard.php', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  await ensureAccount(userId);
  await checkDayReset(userId);
  res.json({ stats: await getStats(userId), traders: await getTraders(), operations: await getOperations(userId, 20), positions: await getPositions(userId) });
});

/* ════════════════════════════════════════════════════════════
   TRANSACTIONS
════════════════════════════════════════════════════════════ */

app.get('/api/transactions.php', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const txs = await db.collection('transactions').find({ userId }).sort({ _id:-1 }).limit(200).toArray();
  res.json(txs.map(r => ({ id:r._id.toString(), type:r.type, amount:r.amount, time:r.time })));
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
  await checkDayReset(userId);
  const acc = await db.collection('accounts').findOne({ userId });

  if (type === 'Buy') {
    const amount = r4(parseFloat(req.body.amount)||0);
    if (amount <= 0)           return res.status(400).json({ error:'Montante inválido.' });
    if (amount > acc.botFunds) return res.status(400).json({ error:'Fundos do bot insuficientes.' });
    await db.collection('accounts').updateOne({ userId }, { $inc:{ botFunds:-amount } });
    await db.collection('positions').insertOne({ userId, pair, trader, amount, opened_at:opTime });
    await db.collection('operations').insertOne({ userId, trader, type:'Buy', pair, profit:-amount, time:opTime });

  } else if (type === 'Sell') {
    const posId  = req.body.positionId;
    const profit = r4(parseFloat(req.body.profit)||0);
    let pos;
    try { pos = await db.collection('positions').findOne({ _id: new ObjectId(posId), userId }); } catch { pos = null; }
    if (!pos) return res.status(404).json({ error:'Posição não encontrada.' });

    const sellReturn = r4(pos.amount + profit);
    const newBot     = r4(acc.botFunds + sellReturn);
    const newDailyP  = r4(acc.dailyProfit + profit);
    const total      = newBot + acc.balance;
    const newPct     = total > 0 ? r2(newDailyP / total * 100) : 0;
    await db.collection('accounts').updateOne({ userId }, { $set:{ botFunds:newBot, dailyProfit:newDailyP, dailyPct:newPct } });
    await db.collection('positions').deleteOne({ _id: new ObjectId(posId) });
    await db.collection('operations').insertOne({ userId, trader:pos.trader, type:'Sell', pair:pos.pair, profit, time:opTime });
    await db.collection('traders').updateOne({ name:pos.trader }, { $inc:{ weeklyProfit: profit >= 0 ? 0.04 : -0.02 } });

  } else { return res.status(400).json({ error:'Tipo inválido.' }); }

  /* Manter só 200 operações por user */
  const opCount = await db.collection('operations').countDocuments({ userId });
  if (opCount > 200) {
    const oldest = await db.collection('operations').find({ userId }).sort({ _id:1 }).limit(opCount - 200).toArray();
    const ids = oldest.map(o => o._id);
    await db.collection('operations').deleteMany({ _id:{ $in:ids } });
  }

  res.json({ stats: await getStats(userId), traders: await getTraders(), operations: await getOperations(userId, 20), positions: await getPositions(userId) });
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
  await checkDayReset(userId);
  const acc = await db.collection('accounts').findOne({ userId });

  if (action === 'to_bot') {
    if (amount > acc.balance) return res.status(400).json({ error:'Saldo insuficiente na carteira principal.' });
    await db.collection('accounts').updateOne({ userId }, { $set:{ balancePrev:acc.balance }, $inc:{ balance:-amount, botFunds:amount } });
    await db.collection('transactions').insertOne({ userId, type:'Alocação para Bot', amount, time:nowDateTime() });
  } else {
    if (amount > acc.botFunds) return res.status(400).json({ error:'Fundos do bot insuficientes.' });
    await db.collection('accounts').updateOne({ userId }, { $set:{ balancePrev:acc.balance }, $inc:{ balance:amount, botFunds:-amount } });
    await db.collection('transactions').insertOne({ userId, type:'Retirada do Bot', amount, time:nowDateTime() });
  }
  const updated = await db.collection('accounts').findOne({ userId });
  res.json({ balance:updated.balance, botFunds:updated.botFunds });
});

/* ════════════════════════════════════════════════════════════
   DEPOSIT
════════════════════════════════════════════════════════════ */

app.post('/api/create_deposit.php', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const amount = parseFloat(req.body.amount)||0;
  if (amount <= 0) return res.status(400).json({ error:'Valor inválido.' });
  const since  = Math.floor(Date.now()/1000);
  const result = await db.collection('pendingDeposits').insertOne({ userId, amount, status:'pending', created_at:since });
  res.json({ id:result.insertedId.toString(), since });
});

app.get('/api/poll_deposit.php', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const since    = parseInt(req.query.since)||0;
  const expected = parseFloat(req.query.amount)||0;
  const pendId   = req.query.id;
  if (!since || expected <= 0 || !pendId) return res.status(400).json({ error:'Parâmetros inválidos.' });

  let pend;
  try { pend = await db.collection('pendingDeposits').findOne({ _id:new ObjectId(pendId), userId, status:'pending' }); } catch { pend = null; }
  if (!pend) return res.json({ status:'not_found' });

  const WALLET = 'DkJDFb24fSTVHhiop2SJKtU1HhxPvus3emseXnX25UyV';
  const RPC    = 'https://api.mainnet-beta.solana.com';

  try {
    const sigRes  = await fetch(RPC, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ jsonrpc:'2.0', id:1, method:'getSignaturesForAddress', params:[WALLET,{limit:10}] }) });
    const sigData = await sigRes.json();
    for (const entry of (sigData.result||[])) {
      if ((entry.blockTime||0) < since || entry.err) continue;
      const sig = entry.signature;
      if (await db.collection('usedSignatures').findOne({ sig })) continue;
      const txRes  = await fetch(RPC, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ jsonrpc:'2.0', id:1, method:'getTransaction', params:[sig,{encoding:'json',maxSupportedTransactionVersion:0}] }) });
      const tx     = (await txRes.json()).result;
      if (!tx || tx.meta?.err) continue;
      const keys   = tx.transaction?.message?.accountKeys||[];
      const idx    = keys.indexOf(WALLET);
      if (idx === -1) continue;
      const received = ((tx.meta.postBalances[idx]||0)-(tx.meta.preBalances[idx]||0))/1_000_000_000;
      if (received < (expected-0.001)) continue;
      await ensureAccount(userId);
      await checkDayReset(userId);
      const acc = await db.collection('accounts').findOne({ userId });
      const nb  = r4(acc.balance + received);
      await db.collection('accounts').updateOne({ userId }, { $set:{ balancePrev:acc.balance, balance:nb } });
      await db.collection('transactions').insertOne({ userId, type:'Depósito SOL', amount:received, time:nowDateTime() });
      await db.collection('usedSignatures').insertOne({ sig, created_at:nowDateTime() });
      await db.collection('pendingDeposits').updateOne({ _id:pend._id }, { $set:{ status:'confirmed' } });
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
  if (wallet.length < 32 || wallet.length > 44) return res.status(400).json({ error:'Endereço Solana inválido (32–44 caracteres).' });

  await ensureAccount(userId);
  await checkDayReset(userId);
  const acc = await db.collection('accounts').findOne({ userId });
  if (amount > acc.balance) return res.status(400).json({ error:`Saldo insuficiente. Disponível: ${acc.balance.toFixed(4)} SOL` });

  const nb = r4(acc.balance - amount);
  await db.collection('accounts').updateOne({ userId }, { $set:{ balancePrev:acc.balance, balance:nb } });
  await db.collection('transactions').insertOne({ userId, type:'Levantamento', amount, wallet_address:wallet, time:nowDateTime() });
  res.json({ balance:nb });
});

/* ════════════════════════════════════════════════════════════
   RESET
════════════════════════════════════════════════════════════ */

app.post('/api/reset.php', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  await db.collection('accounts').updateOne({ userId }, { $set:{ balance:0, balancePrev:0, botFunds:0, dailyProfit:0, dailyPct:0, lastDate:'' } });
  await db.collection('operations').deleteMany({ userId });
  await db.collection('transactions').deleteMany({ userId });
  await db.collection('positions').deleteMany({ userId });
  await db.collection('pendingDeposits').deleteMany({ userId });
  res.json({ ok:true });
});

/* ════════════════════════════════════════════════════════════
   ADMIN
════════════════════════════════════════════════════════════ */

app.get('/api/admin/users.php', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const users = await db.collection('users').find().sort({ _id:1 }).toArray();
  const result = await Promise.all(users.map(async u => {
    const uid = u._id.toString();
    const acc = await db.collection('accounts').findOne({ userId: uid }) || {};
    return { id:uid, username:u.username, email:u.email, created_at:u.created_at, balance:acc.balance||0, bot_funds:acc.botFunds||0, daily_profit:acc.dailyProfit||0 };
  }));
  res.json({ users: result });
});

app.post('/api/admin/adjust.php', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const target = req.body.user_id;
  const amount = parseFloat(req.body.amount)||0;
  const type   = req.body.type;
  if (!target || amount <= 0 || !['add','remove'].includes(type)) return res.status(400).json({ error:'Dados inválidos.' });

  await ensureAccount(target);
  const acc = await db.collection('accounts').findOne({ userId: target });
  if (!acc) return res.status(404).json({ error:'Conta não encontrada.' });
  if (type === 'remove' && amount > acc.balance) return res.status(400).json({ error:`Saldo insuficiente. Disponível: ${acc.balance.toFixed(4)} SOL` });

  const nb   = r4(type === 'add' ? acc.balance + amount : acc.balance - amount);
  const desc = type === 'add' ? 'Admin: Depósito' : 'Admin: Remoção';
  await db.collection('accounts').updateOne({ userId:target }, { $set:{ balancePrev:acc.balance, balance:nb } });
  await db.collection('transactions').insertOne({ userId:target, type:desc, amount, time:nowDateTime() });
  res.json({ balance:nb });
});

app.post('/api/admin/delete_user.php', async (req, res) => {
  const adminId = requireAdmin(req, res);
  if (!adminId) return;
  const target = req.body.user_id;
  if (!target)          return res.status(400).json({ error:'user_id inválido.' });
  if (target === adminId) return res.status(400).json({ error:'Não podes apagar a tua própria conta.' });

  let userDoc;
  try { userDoc = await db.collection('users').findOne({ _id: new ObjectId(target) }); } catch { userDoc = null; }
  if (!userDoc) return res.status(404).json({ error:'Utilizador não encontrado.' });

  await db.collection('positions').deleteMany({ userId:target });
  await db.collection('operations').deleteMany({ userId:target });
  await db.collection('transactions').deleteMany({ userId:target });
  await db.collection('pendingDeposits').deleteMany({ userId:target });
  await db.collection('accounts').deleteOne({ userId:target });
  await db.collection('users').deleteOne({ _id: new ObjectId(target) });
  res.json({ ok:true, deleted:userDoc.username });
});

/* ════════════════════════════════════════════════════════════
   START
════════════════════════════════════════════════════════════ */
const PORT = process.env.PORT || 3000;
connectDB().then(() => {
  app.listen(PORT, () => console.log(`SOL Copy Trading → http://localhost:${PORT}`));
});
