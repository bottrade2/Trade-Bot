<?php
require_once __DIR__ . '/config.php';
$userId = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'Method not allowed'], 405);

$body   = json_decode(file_get_contents('php://input'), true);
$action = $body['action'] ?? '';
$amount = isset($body['amount']) ? (float)$body['amount'] : 0;

if (!in_array($action, ['to_bot', 'from_bot'], true)) json_out(['error' => 'Ação inválida.'], 400);
if ($amount <= 0) json_out(['error' => 'Valor inválido.'], 400);

$db = getDB();
ensureAccount($db, $userId);
$db->beginTransaction();
try {
    checkDayReset($db, $userId);
    $s = $db->prepare('SELECT balance, bot_funds FROM account WHERE user_id=? FOR UPDATE');
    $s->execute([$userId]);
    $acc    = $s->fetch();
    $bal    = (float)$acc['balance'];
    $bot    = (float)$acc['bot_funds'];
    $newBal = $bal;
    $newBot = $bot;
    $txType = '';

    if ($action === 'to_bot') {
        if ($amount > $bal) { $db->rollBack(); json_out(['error' => 'Saldo insuficiente na carteira principal.'], 400); }
        $newBal = r4($bal - $amount);
        $newBot = r4($bot + $amount);
        $txType = 'Alocação para Bot';
    } else {
        if ($amount > $bot) { $db->rollBack(); json_out(['error' => 'Fundos do bot insuficientes.'], 400); }
        $newBal = r4($bal + $amount);
        $newBot = r4($bot - $amount);
        $txType = 'Retirada do Bot';
    }

    $db->prepare('UPDATE account SET balance_prev=balance, balance=?, bot_funds=? WHERE user_id=?')->execute([$newBal, $newBot, $userId]);
    $db->prepare('INSERT INTO transactions (user_id,type,amount,created_at) VALUES (?,?,?,?)')->execute([$userId, $txType, $amount, nowDateTime()]);
    $db->commit();
    json_out(['balance' => $newBal, 'botFunds' => $newBot]);
} catch (Exception $e) {
    $db->rollBack();
    json_out(['error' => 'Erro interno.'], 500);
}
