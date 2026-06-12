<?php
require_once __DIR__ . '/config.php';
$userId = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'Method not allowed'], 405);

$body       = json_decode(file_get_contents('php://input'), true);
$type       = $body['type']   ?? '';
$trader     = $body['trader'] ?? '';
$pair       = $body['pair']   ?? '';
$clientTime = preg_replace('/[^0-9:]/', '', $body['time'] ?? '');
$opTime     = $clientTime ?: nowTime();

if (!$type || !$trader || !$pair) json_out(['error' => 'Dados incompletos.'], 400);

$db = getDB();
ensureAccount($db, $userId);
$db->beginTransaction();
try {
    checkDayReset($db, $userId);
    $s = $db->prepare('SELECT * FROM account WHERE user_id=? FOR UPDATE');
    $s->execute([$userId]);
    $acc = $s->fetch();

    if ($type === 'Buy') {
        $amount = isset($body['amount']) ? r4((float)$body['amount']) : 0;
        if ($amount <= 0)                       { $db->rollBack(); json_out(['error' => 'Montante inválido.'], 400); }
        if ($amount > (float)$acc['bot_funds']) { $db->rollBack(); json_out(['error' => 'Fundos do bot insuficientes.'], 400); }

        $newBot = r4((float)$acc['bot_funds'] - $amount);
        $db->prepare('UPDATE account SET bot_funds=? WHERE user_id=?')->execute([$newBot, $userId]);
        $db->prepare('INSERT INTO positions (user_id,pair,trader,amount,opened_at) VALUES (?,?,?,?,?)')->execute([$userId, $pair, $trader, $amount, $opTime]);
        $db->prepare('INSERT INTO operations (user_id,trader,type,pair,profit,created_at) VALUES (?,?,?,?,?,?)')->execute([$userId, $trader, 'Buy', $pair, -$amount, $opTime]);

    } elseif ($type === 'Sell') {
        $posId  = isset($body['positionId']) ? (int)$body['positionId'] : 0;
        $profit = isset($body['profit'])     ? r4((float)$body['profit']) : 0;

        $ps = $db->prepare('SELECT * FROM positions WHERE id=? AND user_id=?');
        $ps->execute([$posId, $userId]);
        $position = $ps->fetch();
        if (!$position) { $db->rollBack(); json_out(['error' => 'Posição não encontrada.'], 404); }

        $sellReturn  = r4((float)$position['amount'] + $profit);
        $newBot      = r4((float)$acc['bot_funds'] + $sellReturn);
        $newDailyP   = r4((float)$acc['daily_profit'] + $profit);
        $totalFunds  = $newBot + (float)$acc['balance'];
        $newDailyPct = $totalFunds > 0 ? r2($newDailyP / $totalFunds * 100) : 0;

        $db->prepare('UPDATE account SET bot_funds=?, daily_profit=?, daily_pct=? WHERE user_id=?')->execute([$newBot, $newDailyP, $newDailyPct, $userId]);
        $db->prepare('DELETE FROM positions WHERE id=? AND user_id=?')->execute([$posId, $userId]);
        $db->prepare('INSERT INTO operations (user_id,trader,type,pair,profit,created_at) VALUES (?,?,?,?,?,?)')->execute([$userId, $position['trader'], 'Sell', $position['pair'], $profit, $opTime]);

        $tr = $db->prepare('SELECT weekly_profit FROM traders WHERE name=?');
        $tr->execute([$position['trader']]);
        $t = $tr->fetch();
        if ($t) {
            $drift = $profit >= 0 ? 0.04 : -0.02;
            $db->prepare('UPDATE traders SET weekly_profit=? WHERE name=?')->execute([round((float)$t['weekly_profit'] + $drift, 1), $position['trader']]);
        }
    } else {
        $db->rollBack(); json_out(['error' => 'Tipo inválido.'], 400);
    }

    $db->prepare("DELETE FROM operations WHERE user_id=? AND id NOT IN (SELECT id FROM (SELECT id FROM operations WHERE user_id=? ORDER BY id DESC LIMIT 200) t)")->execute([$userId, $userId]);
    $db->commit();
} catch (Exception $e) {
    $db->rollBack();
    json_out(['error' => $e->getMessage()], 500);
}

json_out([
    'stats'      => getStats($db, $userId),
    'traders'    => getTraders($db),
    'operations' => getOperations($db, $userId, 20),
    'positions'  => getPositions($db, $userId),
]);
