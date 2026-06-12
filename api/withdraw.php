<?php
require_once __DIR__ . '/config.php';
$userId = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'Method not allowed'], 405);

$body    = json_decode(file_get_contents('php://input'), true);
$amount  = isset($body['amount']) ? (float)$body['amount'] : 0;
$wallet  = trim($body['wallet'] ?? '');
if ($amount <= 0) json_out(['error' => 'Valor inválido.'], 400);
if (!$wallet)     json_out(['error' => 'Insere o endereço da carteira de destino.'], 400);
if (strlen($wallet) < 32 || strlen($wallet) > 44) json_out(['error' => 'Endereço Solana inválido (32–44 caracteres).'], 400);

$db = getDB();
ensureAccount($db, $userId);
$db->beginTransaction();
try {
    checkDayReset($db, $userId);
    $s = $db->prepare('SELECT balance FROM account WHERE user_id=? FOR UPDATE');
    $s->execute([$userId]);
    $acc = $s->fetch();
    $cur = (float)$acc['balance'];
    if ($amount > $cur) {
        $db->rollBack();
        json_out(['error' => 'Saldo insuficiente. Disponível: ' . number_format($cur, 4) . ' SOL'], 400);
    }
    $new = r4($cur - $amount);
    $db->prepare('UPDATE account SET balance_prev=balance, balance=? WHERE user_id=?')->execute([$new, $userId]);
    $db->prepare('INSERT INTO transactions (user_id,type,amount,wallet_address,created_at) VALUES (?,?,?,?,?)')->execute([$userId, 'Levantamento', $amount, $wallet, nowDateTime()]);
    $db->commit();
    json_out(['balance' => $new]);
} catch (Exception $e) {
    $db->rollBack();
    json_out(['error' => 'Erro interno.'], 500);
}
