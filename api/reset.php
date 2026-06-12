<?php
require_once __DIR__ . '/config.php';
$userId = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'Method not allowed'], 405);

$db = getDB();
$db->prepare("UPDATE account SET balance=0, balance_prev=0, bot_funds=0, daily_profit=0, daily_pct=0, last_date='' WHERE user_id=?")->execute([$userId]);
$db->prepare("DELETE FROM operations  WHERE user_id=?")->execute([$userId]);
$db->prepare("DELETE FROM transactions WHERE user_id=?")->execute([$userId]);
$db->prepare("DELETE FROM positions   WHERE user_id=?")->execute([$userId]);

json_out(['ok' => true]);
