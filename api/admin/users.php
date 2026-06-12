<?php
require_once dirname(__DIR__) . '/config.php';

requireAuth();
if (empty($_SESSION['is_admin'])) json_out(['error' => 'Acesso negado.'], 403);

$db = getDB();

$rows = $db->query("
    SELECT u.id, u.username, u.email, u.created_at,
           COALESCE(a.balance,0)      AS balance,
           COALESCE(a.bot_funds,0)    AS bot_funds,
           COALESCE(a.daily_profit,0) AS daily_profit
    FROM users u
    LEFT JOIN account a ON a.user_id = u.id
    ORDER BY u.id ASC
")->fetchAll();

$users = array_map(fn($r) => [
    'id'           => (int)$r['id'],
    'username'     => $r['username'],
    'email'        => $r['email'],
    'created_at'   => $r['created_at'],
    'balance'      => (float)$r['balance'],
    'bot_funds'    => (float)$r['bot_funds'],
    'daily_profit' => (float)$r['daily_profit'],
], $rows);

json_out(['users' => $users]);
