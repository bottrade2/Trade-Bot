<?php
require_once __DIR__ . '/config.php';
$userId = requireAuth();
$db   = getDB();
$stmt = $db->prepare('SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 200');
$stmt->execute([$userId]);
json_out(array_map(fn($r) => [
    'id'     => (int)$r['id'],
    'type'   => $r['type'],
    'amount' => (float)$r['amount'],
    'time'   => $r['created_at'],
], $stmt->fetchAll()));
