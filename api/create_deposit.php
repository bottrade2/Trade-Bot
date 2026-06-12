<?php
require_once __DIR__ . '/config.php';
$userId = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'Method not allowed'], 405);

$body   = json_decode(file_get_contents('php://input'), true);
$amount = isset($body['amount']) ? (float)$body['amount'] : 0;
if ($amount <= 0) json_out(['error' => 'Valor inválido.'], 400);

$db = getDB();
$db->prepare('INSERT INTO pending_deposits (user_id,amount,created_at) VALUES (?,?,?)')->execute([$userId, $amount, time()]);
$id = (int)$db->lastInsertId();

json_out(['id' => $id, 'since' => time()]);
