<?php
require_once dirname(__DIR__) . '/config.php';

requireAuth();
if (empty($_SESSION['is_admin'])) json_out(['error' => 'Acesso negado.'], 403);

$db     = getDB();
$target = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 0;
$limit  = isset($_GET['limit'])   ? min((int)$_GET['limit'], 200) : 50;

if ($target) {
    $s = $db->prepare('SELECT t.*, u.username FROM transactions t LEFT JOIN users u ON u.id=t.user_id WHERE t.user_id=? ORDER BY t.id DESC LIMIT ' . $limit);
    $s->execute([$target]);
} else {
    $s = $db->query('SELECT t.*, u.username FROM transactions t LEFT JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT ' . $limit);
}

$rows = $s->fetchAll();
$out  = array_map(fn($r) => [
    'id'             => (int)$r['id'],
    'user_id'        => (int)$r['user_id'],
    'username'       => $r['username'] ?? null,
    'type'           => $r['type'],
    'amount'         => (float)$r['amount'],
    'wallet_address' => $r['wallet_address'] ?? '',
    'created_at'     => $r['created_at'],
], $rows);

json_out(['transactions' => $out]);
