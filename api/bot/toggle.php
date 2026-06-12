<?php
require_once dirname(__DIR__) . '/config.php';
$userId = requireAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'Method not allowed'], 405);

$db = getDB();
ensureAccount($db, $userId);

$s = $db->prepare('SELECT bot_active FROM account WHERE user_id=?');
$s->execute([$userId]);
$cur = (int)($s->fetch()['bot_active'] ?? 0);
$new = $cur ? 0 : 1;

$db->prepare('UPDATE account SET bot_active=? WHERE user_id=?')->execute([$new, $userId]);

json_out(['bot_active' => $new]);
