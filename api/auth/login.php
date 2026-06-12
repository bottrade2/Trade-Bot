<?php
require_once dirname(__DIR__) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'Method not allowed'], 405);

$body     = json_decode(file_get_contents('php://input'), true);
$login    = trim($body['login'] ?? $body['username'] ?? '');
$password = $body['password'] ?? '';

if (!$login || !$password) json_out(['error' => 'Preenche todos os campos.'], 400);

$db = getDB();

/* ── Rate limiting ── */
define('MAX_ATTEMPTS', 5);
define('WINDOW_SECS',  15 * 60); // 15 minutos

$ip  = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$ip  = trim(explode(',', $ip)[0]); // primeiro IP se houver proxy

$cutoff = time() - WINDOW_SECS;

// Limpa tentativas antigas
$db->prepare('DELETE FROM login_attempts WHERE attempted_at < ?')->execute([$cutoff]);

// Conta tentativas recentes deste IP
$c = $db->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip=? AND attempted_at >= ?');
$c->execute([$ip, $cutoff]);
$attempts = (int)$c->fetchColumn();

if ($attempts >= MAX_ATTEMPTS) {
    $oldest = $db->prepare('SELECT MIN(attempted_at) FROM login_attempts WHERE ip=? AND attempted_at >= ?');
    $oldest->execute([$ip, $cutoff]);
    $firstAt  = (int)$oldest->fetchColumn();
    $waitSecs = max(1, WINDOW_SECS - (time() - $firstAt));
    $waitMins = (int)ceil($waitSecs / 60);
    json_out(['error' => "Demasiadas tentativas. Tenta novamente em {$waitMins} min."], 429);
}

/* ── Autenticação ── */
$s = $db->prepare('SELECT * FROM users WHERE username=? OR email=?');
$s->execute([$login, $login]);
$user = $s->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    // Regista tentativa falhada
    $db->prepare('INSERT INTO login_attempts (ip, attempted_at) VALUES (?, ?)')->execute([$ip, time()]);
    $remaining = MAX_ATTEMPTS - $attempts - 1;
    $msg = $remaining > 0
        ? "Utilizador ou palavra-passe incorretos. ({$remaining} tentativas restantes)"
        : 'Utilizador ou palavra-passe incorretos. (última tentativa — será bloqueado)';
    json_out(['error' => $msg], 401);
}

// Login bem-sucedido — limpa tentativas deste IP
$db->prepare('DELETE FROM login_attempts WHERE ip=?')->execute([$ip]);

ensureAccount($db, (int)$user['id']);

$_SESSION['user_id']  = (int)$user['id'];
$_SESSION['username'] = $user['username'];
$_SESSION['is_admin'] = (int)$user['is_admin'];

json_out(['id' => (int)$user['id'], 'username' => $user['username'], 'is_admin' => (int)$user['is_admin']]);
