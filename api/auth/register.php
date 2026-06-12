<?php
require_once dirname(__DIR__) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'Method not allowed'], 405);

$body    = json_decode(file_get_contents('php://input'), true);
$username = trim($body['username'] ?? '');
$email    = trim($body['email']    ?? '');
$password = $body['password']      ?? '';

if (strlen($username) < 3)  json_out(['error' => 'Nome de utilizador deve ter pelo menos 3 caracteres.'], 400);
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_out(['error' => 'Email inválido.'], 400);
if (strlen($password) < 6)  json_out(['error' => 'Palavra-passe deve ter pelo menos 6 caracteres.'], 400);
if (!preg_match('/^[a-zA-Z0-9_]+$/', $username)) json_out(['error' => 'Nome de utilizador só pode conter letras, números e _.'], 400);

$db = getDB();

$ck = $db->prepare('SELECT id FROM users WHERE username=? OR email=?');
$ck->execute([$username, $email]);
if ($ck->fetch()) json_out(['error' => 'Nome de utilizador ou email já em uso.'], 409);

$hash = password_hash($password, PASSWORD_BCRYPT);
$db->prepare('INSERT INTO users (username,email,password_hash) VALUES (?,?,?)')->execute([$username, $email, $hash]);
$userId = (int)$db->lastInsertId();

ensureAccount($db, $userId);

$_SESSION['user_id']  = $userId;
$_SESSION['username'] = $username;

json_out(['id' => $userId, 'username' => $username]);
