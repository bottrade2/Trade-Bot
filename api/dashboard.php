<?php
require_once __DIR__ . '/config.php';
$userId = requireAuth();
$db = getDB();
ensureAccount($db, $userId);
checkDayReset($db, $userId);
json_out([
    'stats'      => getStats($db, $userId),
    'traders'    => getTraders($db),
    'operations' => getOperations($db, $userId, 20),
    'positions'  => getPositions($db, $userId),
]);
