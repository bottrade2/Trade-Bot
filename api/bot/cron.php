<?php
/**
 * Bot cron — corre a cada minuto via Task Scheduler / cPanel cron.
 *
 * CLI (XAMPP):
 *   php C:\xampp\htdocs\bot\api\bot\cron.php
 *
 * Web (hosting):
 *   curl "https://seusite.com/bot/api/bot/cron.php?secret=ALTERA_ESTE_TOKEN"
 */

define('CRON_SECRET', 'muda_este_token_para_algo_secreto');

/* Permite chamada CLI sem autenticação */
$isCli = php_sapi_name() === 'cli';
if (!$isCli) {
    /* Via HTTP: exige secret */
    $given = $_GET['secret'] ?? '';
    if (!hash_equals(CRON_SECRET, $given)) {
        http_response_code(403);
        exit('Forbidden');
    }
}

require_once dirname(__DIR__) . '/config.php';

/* Headers só em modo web */
if (!$isCli) {
    header('Content-Type: text/plain; charset=utf-8');
}

$db = getDB();

/* Intervalo mínimo entre ticks por utilizador (segundos) */
define('TICK_INTERVAL', 25);

$PAIRS = ['BONK/SOL','WIF/SOL','SOL/POPCAT','BOME/SOL','SOL/MEW',
          'SLERF/SOL','SOL/PONKE','MYRO/SOL','SOL/GIGA','SAMO/SOL'];

/* Busca utilizadores com bot ativo e cuja última execução foi há >TICK_INTERVAL segundos */
$cutoff = time() - TICK_INTERVAL;
$users  = $db->prepare('SELECT user_id FROM account WHERE bot_active=1 AND last_tick<?');
$users->execute([$cutoff]);
$rows   = $users->fetchAll();

$count = 0;
foreach ($rows as $row) {
    runTick($db, (int)$row['user_id'], $PAIRS);
    $count++;
}

echo date('Y-m-d H:i:s') . " — ticks: $count\n";

/* ─────────────────────────────────────────────────────── */

function runTick(PDO $db, int $userId, array $pairs): void {
    $db->beginTransaction();
    try {
        checkDayReset($db, $userId);

        $s = $db->prepare('SELECT * FROM account WHERE user_id=? FOR UPDATE');
        $s->execute([$userId]);
        $acc = $s->fetch();
        if (!$acc) { $db->rollBack(); return; }

        $botFunds = (float)$acc['bot_funds'];
        $canBuy   = $botFunds >= 0.01;

        $ps = $db->prepare('SELECT * FROM positions WHERE user_id=?');
        $ps->execute([$userId]);
        $positions = $ps->fetchAll();
        $canSell   = !empty($positions);

        if (!$canBuy && !$canSell) {
            /* Nada a fazer mas actualiza last_tick para não voltar a tentar a cada segundo */
            $db->prepare('UPDATE account SET last_tick=? WHERE user_id=?')->execute([time(), $userId]);
            $db->commit();
            return;
        }

        $traders = $db->query("SELECT * FROM traders WHERE drawdown<=20 AND weekly_profit>=10")->fetchAll();
        if (empty($traders)) { $db->rollBack(); return; }

        $doSell = $canSell && (!$canBuy || (mt_rand(0, 99) < 60));
        $opTime = date('H:i:s');

        if ($doSell) {
            $pos    = $positions[array_rand($positions)];
            $pct    = -0.08 + (mt_rand(0, 10000) / 10000) * 0.28;
            $profit = r4($pct * (float)$pos['amount']);

            $sellReturn  = r4((float)$pos['amount'] + $profit);
            $newBot      = r4($botFunds + $sellReturn);
            $newDailyP   = r4((float)$acc['daily_profit'] + $profit);
            $totalFunds  = $newBot + (float)$acc['balance'];
            $newDailyPct = $totalFunds > 0 ? r2($newDailyP / $totalFunds * 100) : 0;

            $db->prepare('UPDATE account SET bot_funds=?, daily_profit=?, daily_pct=?, last_tick=? WHERE user_id=?')
               ->execute([$newBot, $newDailyP, $newDailyPct, time(), $userId]);
            $db->prepare('DELETE FROM positions WHERE id=? AND user_id=?')->execute([$pos['id'], $userId]);
            $db->prepare('INSERT INTO operations (user_id,trader,type,pair,profit,created_at) VALUES (?,?,?,?,?,?)')
               ->execute([$userId, $pos['trader'], 'Sell', $pos['pair'], $profit, $opTime]);

            $tr = $db->prepare('SELECT weekly_profit FROM traders WHERE name=?');
            $tr->execute([$pos['trader']]);
            $t = $tr->fetch();
            if ($t) {
                $drift = $profit >= 0 ? 0.04 : -0.02;
                $db->prepare('UPDATE traders SET weekly_profit=? WHERE name=?')
                   ->execute([round((float)$t['weekly_profit'] + $drift, 1), $pos['trader']]);
            }

        } else {
            $trader = $traders[array_rand($traders)];
            $amount = r4($botFunds * (0.05 + (mt_rand(0, 10000) / 10000) * 0.15));
            if ($amount < 0.01) {
                $db->prepare('UPDATE account SET last_tick=? WHERE user_id=?')->execute([time(), $userId]);
                $db->commit();
                return;
            }
            $amount = min($amount, $botFunds);
            $pair   = $pairs[array_rand($pairs)];
            $newBot = r4($botFunds - $amount);

            $db->prepare('UPDATE account SET bot_funds=?, last_tick=? WHERE user_id=?')->execute([$newBot, time(), $userId]);
            $db->prepare('INSERT INTO positions (user_id,pair,trader,amount,opened_at) VALUES (?,?,?,?,?)')
               ->execute([$userId, $pair, $trader['name'], $amount, $opTime]);
            $db->prepare('INSERT INTO operations (user_id,trader,type,pair,profit,created_at) VALUES (?,?,?,?,?,?)')
               ->execute([$userId, $trader['name'], 'Buy', $pair, -$amount, $opTime]);
        }

        /* Mantém apenas as últimas 200 operações por utilizador */
        $db->prepare("DELETE FROM operations WHERE user_id=? AND id NOT IN (
            SELECT id FROM (SELECT id FROM operations WHERE user_id=? ORDER BY id DESC LIMIT 200) t
        )")->execute([$userId, $userId]);

        $db->commit();

    } catch (Exception $e) {
        $db->rollBack();
        echo "Erro user $userId: " . $e->getMessage() . "\n";
    }
}
