<?php
require_once dirname(__DIR__) . '/config.php';

requireAuth();
if (empty($_SESSION['is_admin']))   json_out(['error' => 'Acesso negado.'], 403);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'Method not allowed'], 405);

$body   = json_decode(file_get_contents('php://input'), true);
$target = isset($body['user_id']) ? (int)$body['user_id'] : 0;

if (!$target) json_out(['error' => 'user_id inválido.'], 400);

// Impede apagar a própria conta de admin
if ($target === (int)$_SESSION['user_id']) json_out(['error' => 'Não podes apagar a tua própria conta.'], 400);

$db = getDB();

// Verifica que o utilizador existe
$s = $db->prepare('SELECT id, username FROM users WHERE id=?');
$s->execute([$target]);
$user = $s->fetch();
if (!$user) json_out(['error' => 'Utilizador não encontrado.'], 404);

$db->beginTransaction();
try {
    $db->prepare('DELETE FROM positions        WHERE user_id=?')->execute([$target]);
    $db->prepare('DELETE FROM operations       WHERE user_id=?')->execute([$target]);
    $db->prepare('DELETE FROM transactions     WHERE user_id=?')->execute([$target]);
    $db->prepare('DELETE FROM pending_deposits WHERE user_id=?')->execute([$target]);
    $db->prepare('DELETE FROM account          WHERE user_id=?')->execute([$target]);
    $db->prepare('DELETE FROM users            WHERE id=?')    ->execute([$target]);
    $db->commit();
    json_out(['ok' => true, 'deleted' => $user['username']]);
} catch (Exception $e) {
    $db->rollBack();
    json_out(['error' => 'Erro ao apagar utilizador.'], 500);
}
