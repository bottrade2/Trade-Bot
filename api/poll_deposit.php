<?php
require_once __DIR__ . '/config.php';
$userId = requireAuth();

$since    = isset($_GET['since'])  ? (int)$_GET['since']   : 0;
$expected = isset($_GET['amount']) ? (float)$_GET['amount'] : 0;
$pendId   = isset($_GET['id'])     ? (int)$_GET['id']       : 0;

if (!$since || $expected <= 0 || !$pendId) json_out(['error' => 'Parâmetros inválidos.'], 400);

$WALLET = 'DkJDFb24fSTVHhiop2SJKtU1HhxPvus3emseXnX25UyV';
$RPC    = 'https://api.mainnet-beta.solana.com';

$db   = getDB();
$pend = $db->prepare('SELECT * FROM pending_deposits WHERE id=? AND user_id=? AND status=?');
$pend->execute([$pendId, $userId, 'pending']);
if (!$pend->fetch()) json_out(['status' => 'not_found']);

$res = rpcPost($RPC, ['jsonrpc'=>'2.0','id'=>1,'method'=>'getSignaturesForAddress','params'=>[$WALLET,['limit'=>10]]]);
if (!$res) json_out(['status' => 'rpc_error']);

$sigs = $res['result'] ?? [];

foreach ($sigs as $entry) {
    if (($entry['blockTime'] ?? 0) < $since) continue;
    if (!empty($entry['err'])) continue;
    $sig = $entry['signature'];

    $ck = $db->prepare('SELECT sig FROM used_signatures WHERE sig=?');
    $ck->execute([$sig]);
    if ($ck->fetch()) continue;

    $tx = rpcPost($RPC, ['jsonrpc'=>'2.0','id'=>1,'method'=>'getTransaction','params'=>[$sig,['encoding'=>'json','maxSupportedTransactionVersion'=>0]]]);
    if (!$tx) continue;
    $tx = $tx['result'] ?? null;
    if (!$tx || !empty($tx['meta']['err'])) continue;

    $keys = $tx['transaction']['message']['accountKeys'] ?? [];
    $idx  = array_search($WALLET, $keys);
    if ($idx === false) continue;

    $received = ((float)($tx['meta']['postBalances'][$idx] ?? 0) - (float)($tx['meta']['preBalances'][$idx] ?? 0)) / 1_000_000_000;
    if ($received < ($expected - 0.001)) continue;

    $db->beginTransaction();
    try {
        checkDayReset($db, $userId);
        $s = $db->prepare('SELECT balance FROM account WHERE user_id=? FOR UPDATE');
        $s->execute([$userId]);
        $acc = $s->fetch();
        $new = r4((float)$acc['balance'] + $received);
        $db->prepare('UPDATE account SET balance_prev=balance, balance=? WHERE user_id=?')->execute([$new, $userId]);
        $db->prepare('INSERT INTO transactions (user_id,type,amount,created_at) VALUES (?,?,?,?)')->execute([$userId, 'Depósito SOL', $received, nowDateTime()]);
        $db->prepare('INSERT INTO used_signatures (sig,created_at) VALUES (?,?)')->execute([$sig, nowDateTime()]);
        $db->prepare('UPDATE pending_deposits SET status=? WHERE id=? AND user_id=?')->execute(['confirmed', $pendId, $userId]);
        $db->commit();
        json_out(['status' => 'confirmed', 'balance' => $new, 'received' => $received]);
    } catch (Exception $e) {
        $db->rollBack();
        json_out(['status' => 'db_error']);
    }
}

json_out(['status' => 'pending']);
