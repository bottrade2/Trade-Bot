<?php
if (session_status() === PHP_SESSION_NONE) session_start();

define('DB_HOST', getenv('MYSQLHOST')     ?: 'sql101.infinityfree.com');
define('DB_USER', getenv('MYSQLUSER')     ?: 'if0_42153520');
define('DB_PASS', getenv('MYSQLPASSWORD') ?: 'FI8OSRMN3kts');
define('DB_NAME', getenv('MYSQLDATABASE') ?: 'if0_42153520_tradebot');

function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
             PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
        /* ── Migrations ─────────────────────────────────────── */
        $pdo->exec("CREATE TABLE IF NOT EXISTS users (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            username      VARCHAR(50)  NOT NULL UNIQUE,
            email         VARCHAR(100) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            is_admin      TINYINT(1)   NOT NULL DEFAULT 0,
            created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
        )");
        $pdo->exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin TINYINT(1) NOT NULL DEFAULT 0");
        // Garante is_admin=1 para a conta KX3T
        $pdo->exec("UPDATE users SET is_admin=1 WHERE username='KX3T' OR email='manellopes1973@gmail.com'");
        /* Garante que account.id é AUTO_INCREMENT (era DEFAULT 1 sem AI) */
        $pdo->exec("ALTER TABLE account MODIFY id INT NOT NULL AUTO_INCREMENT");
        $pdo->exec("ALTER TABLE account      ADD COLUMN IF NOT EXISTS user_id   INT           NOT NULL DEFAULT 1");
        $pdo->exec("ALTER TABLE account      ADD COLUMN IF NOT EXISTS bot_funds DECIMAL(20,4) NOT NULL DEFAULT 0");
        $pdo->exec("ALTER TABLE operations   ADD COLUMN IF NOT EXISTS user_id   INT           NOT NULL DEFAULT 1");
        $pdo->exec("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id   INT           NOT NULL DEFAULT 1");
        $pdo->exec("CREATE TABLE IF NOT EXISTS positions (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            user_id    INT           NOT NULL DEFAULT 1,
            pair       VARCHAR(30)   NOT NULL,
            trader     VARCHAR(50)   NOT NULL,
            amount     DECIMAL(20,4) NOT NULL,
            opened_at  VARCHAR(20)   NOT NULL DEFAULT ''
        )");
        $pdo->exec("ALTER TABLE positions ADD COLUMN IF NOT EXISTS user_id INT NOT NULL DEFAULT 1");
        $pdo->exec("CREATE TABLE IF NOT EXISTS pending_deposits (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            user_id    INT           NOT NULL DEFAULT 1,
            amount     DECIMAL(20,4) NOT NULL,
            status     VARCHAR(20)   NOT NULL DEFAULT 'pending',
            created_at INT           NOT NULL DEFAULT 0
        )");
        $pdo->exec("ALTER TABLE pending_deposits ADD COLUMN IF NOT EXISTS user_id INT NOT NULL DEFAULT 1");
        $pdo->exec("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(64) NOT NULL DEFAULT ''");
        $pdo->exec("ALTER TABLE account ADD COLUMN IF NOT EXISTS bot_active TINYINT(1) NOT NULL DEFAULT 0");
        $pdo->exec("ALTER TABLE account ADD COLUMN IF NOT EXISTS last_tick  INT         NOT NULL DEFAULT 0");
        $pdo->exec("CREATE TABLE IF NOT EXISTS login_attempts (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            ip           VARCHAR(45) NOT NULL,
            attempted_at INT         NOT NULL DEFAULT 0,
            INDEX idx_ip (ip)
        )");
        $pdo->exec("CREATE TABLE IF NOT EXISTS used_signatures (
            sig        VARCHAR(128) PRIMARY KEY,
            created_at VARCHAR(30)  NOT NULL DEFAULT ''
        )");
    }
    return $pdo;
}

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

function json_out(mixed $data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function requireAuth(): int {
    if (empty($_SESSION['user_id'])) json_out(['error' => 'Não autenticado.', 'auth' => false], 401);
    return (int)$_SESSION['user_id'];
}

function rpcPost(string $url, array $payload, int $timeout = 12): ?array {
    $json = json_encode($payload);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $json,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $raw = curl_exec($ch);
    } else {
        $ctx = stream_context_create(['http' => [
            'method'  => 'POST',
            'header'  => "Content-Type: application/json\r\n",
            'content' => $json,
            'timeout' => $timeout,
        ]]);
        $raw = @file_get_contents($url, false, $ctx);
    }
    if (!$raw) return null;
    return json_decode($raw, true) ?: null;
}

function r4(float $n): float { return round($n, 4); }
function r2(float $n): float { return round($n, 2); }

function calcStatus(array $t): string {
    if ($t['drawdown']      > 20) return 'Removido';
    if ($t['weekly_profit'] < 10) return 'Suspenso';
    return 'Ativo';
}

function nowTime(): string     { return date('H:i:s'); }
function nowDateTime(): string { return date('d/m/Y H:i:s'); }
function todayStr(): string    { return date('d/m/Y'); }

function ensureAccount(PDO $db, int $userId): void {
    $exists = $db->prepare('SELECT id FROM account WHERE user_id=?');
    $exists->execute([$userId]);
    if (!$exists->fetch()) {
        $db->prepare("INSERT INTO account (user_id,balance,balance_prev,daily_profit,daily_pct,last_date,bot_funds) VALUES (?,0,0,0,0,'',0)")
           ->execute([$userId]);
    }
}

function checkDayReset(PDO $db, int $userId): void {
    $row = $db->prepare('SELECT last_date FROM account WHERE user_id=?');
    $row->execute([$userId]);
    $r = $row->fetch();
    if ($r && $r['last_date'] !== todayStr()) {
        $db->prepare('UPDATE account SET daily_profit=0, daily_pct=0, last_date=? WHERE user_id=?')
           ->execute([todayStr(), $userId]);
    }
}

function getStats(PDO $db, int $userId): array {
    $s = $db->prepare('SELECT * FROM account WHERE user_id=?');
    $s->execute([$userId]);
    $acc = $s->fetch();
    $active = (int)$db->query("SELECT COUNT(*) FROM traders WHERE drawdown<=20 AND weekly_profit>=10")->fetchColumn();
    $total  = (int)$db->query('SELECT COUNT(*) FROM traders')->fetchColumn();
    $p = $db->prepare('SELECT COALESCE(SUM(amount),0) FROM positions WHERE user_id=?');
    $p->execute([$userId]);
    $openVal = (float)$p->fetchColumn();
    $bal = $acc ? (float)$acc['balance'] : 0;
    $prev = $acc ? (float)$acc['balance_prev'] : 0;
    return [
        'totalBalance'       => $bal,
        'totalBalancePrev'   => $prev,
        'botFunds'           => $acc ? (float)$acc['bot_funds'] : 0,
        'openPositionsValue' => $openVal,
        'dailyProfit'        => $acc ? (float)$acc['daily_profit'] : 0,
        'dailyProfitPct'     => $acc ? (float)$acc['daily_pct'] : 0,
        'activeTraders'      => $active,
        'totalTraders'       => $total,
        'botActive'          => $acc ? (int)$acc['bot_active'] : 0,
    ];
}

function getTraders(PDO $db): array {
    $rows = $db->query('SELECT * FROM traders ORDER BY id')->fetchAll();
    return array_map(fn($r) => [
        'id'           => (int)$r['id'],
        'name'         => $r['name'],
        'weeklyProfit' => (float)$r['weekly_profit'],
        'drawdown'     => (float)$r['drawdown'],
        'score'        => (int)$r['score'],
        'status'       => calcStatus($r),
    ], $rows);
}

function getOperations(PDO $db, int $userId, int $limit = 20): array {
    $s = $db->prepare('SELECT * FROM operations WHERE user_id=? ORDER BY id DESC LIMIT ' . (int)$limit);
    $s->execute([$userId]);
    return array_map(fn($r) => [
        'id'     => (int)$r['id'],
        'trader' => $r['trader'],
        'type'   => $r['type'],
        'pair'   => $r['pair'],
        'profit' => (float)$r['profit'],
        'time'   => $r['created_at'],
    ], $s->fetchAll());
}

function getPositions(PDO $db, int $userId): array {
    $s = $db->prepare('SELECT * FROM positions WHERE user_id=? ORDER BY id ASC');
    $s->execute([$userId]);
    return array_map(fn($r) => [
        'id'        => (int)$r['id'],
        'pair'      => $r['pair'],
        'trader'    => $r['trader'],
        'amount'    => (float)$r['amount'],
        'opened_at' => $r['opened_at'],
    ], $s->fetchAll());
}
