<?php
require_once dirname(__DIR__) . '/config.php';

requireAuth();
if (empty($_SESSION['is_admin'])) json_out(['error' => 'Acesso negado.'], 403);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'Method not allowed'], 405);

$body   = json_decode(file_get_contents('php://input'), true);
$target = isset($body['user_id']) ? (int)$body['user_id'] : 0;
$amount = isset($body['amount'])  ? (float)$body['amount'] : 0;
$type   = $body['type'] ?? ''; // 'add' or 'remove'

if (!$target || $amount <= 0 || !in_array($type, ['add','remove'])) {
    json_out(['error' => 'Dados inválidos.'], 400);
}

$db = getDB();
ensureAccount($db, $target);

$db->beginTransaction();
try {
    $s = $db->prepare('SELECT balance FROM account WHERE user_id=? FOR UPDATE');
    $s->execute([$target]);
    $acc = $s->fetch();
    if (!$acc) json_out(['error' => 'Conta não encontrada.'], 404);

    $cur = (float)$acc['balance'];
    if ($type === 'remove' && $amount > $cur) {
        $db->rollBack();
        json_out(['error' => sprintf('Saldo insuficiente. Disponível: %.4f SOL', $cur)], 400);
    }

    $new  = r4($type === 'add' ? $cur + $amount : $cur - $amount);
    $desc = $type === 'add' ? 'Admin: Depósito' : 'Admin: Remoção';

    $db->prepare('UPDATE account SET balance_prev=balance, balance=? WHERE user_id=?')->execute([$new, $target]);
    $db->prepare('INSERT INTO transactions (user_id,type,amount,created_at) VALUES (?,?,?,?)')->execute([$target, $desc, $amount, nowDateTime()]);
    $db->commit();

    json_out(['balance' => $new]);
} catch (Exception $e) {
    $db->rollBack();
    json_out(['error' => 'Erro interno.'], 500);
}
