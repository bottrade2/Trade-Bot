<?php
require_once __DIR__ . '/config.php';
$userId = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'Method not allowed'], 405);

$body      = json_decode(file_get_contents('php://input'), true);
$signature = trim($body['signature'] ?? '');
$expected  = isset($body['amount']) ? (float)$body['amount'] : 0;

if (!$signature || $expected <= 0) json_out(['error' => 'Dados inválidos.'], 400);

$WALLET = 'DkJDFb24fSTVHhiop2SJKtU1HhxPvus3emseXnX25UyV';
$RPC    = 'https://api.mainnet-beta.solana.com';

$db = getDB();

$dup = $db->prepare('SELECT sig FROM used_signatures WHERE sig=?');
$dup->execute([$signature]);
if ($dup->fetch()) json_out(['error' => 'Transação já processada.'], 409);

$rpc = rpcPost($RPC, ['jsonrpc'=>'2.0','id'=>1,'method'=>'getTransaction','params'=>[$signature,['encoding'=>'json','maxSupportedTransactionVersion'=>0]]]);
if (!$rpc) json_out(['error' => 'Não foi possível contactar a blockchain.'], 502);

if (empty($rpc['result'])) json_out(['error' => 'Transação não encontrada ou não confirmada ainda.'], 404);

$tx = $rpc['result'];
if (!empty($tx['meta']['err'])) json_out(['error' => 'Transação falhou na blockchain.'], 400);

$keys = $tx['transaction']['message']['accountKeys'] ?? [];
$idx  = array_search($WALLET, $keys);
if ($idx === false) json_out(['error' => 'Transação não contém o endereço de destino correto.'], 400);

$received = ((float)($tx['meta']['postBalances'][$idx] ?? 0) - (float)($tx['meta']['preBalances'][$idx] ?? 0)) / 1_000_000_000;
if ($received < ($expected - 0.001)) json_out(['error' => sprintf('Valor recebido (%.4f SOL) inferior ao esperado (%.4f SOL).', $received, $expected)], 400);

$db->beginTransaction();
try {
    checkDayReset($db, $userId);
    $s = $db->prepare('SELECT balance FROM account WHERE user_id=? FOR UPDATE');
    $s->execute([$userId]);
    $acc = $s->fetch();
    $new = r4((float)$acc['balance'] + $received);
    $db->prepare('UPDATE account SET balance_prev=balance, balance=? WHERE user_id=?')->execute([$new, $userId]);
    $db->prepare('INSERT INTO transactions (user_id,type,amount,created_at) VALUES (?,?,?,?)')->execute([$userId, 'Depósito SOL', $received, nowDateTime()]);
    $db->prepare('INSERT INTO used_signatures (sig,created_at) VALUES (?,?)')->execute([$signature, nowDateTime()]);
    $db->commit();
    json_out(['balance' => $new, 'received' => $received]);
} catch (Exception $e) {
    $db->rollBack();
    json_out(['error' => 'Erro interno ao creditar.'], 500);
}
