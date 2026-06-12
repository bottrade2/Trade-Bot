<?php
require_once dirname(__DIR__) . '/config.php';
if (empty($_SESSION['user_id'])) json_out(['auth' => false], 401);
json_out(['id' => (int)$_SESSION['user_id'], 'username' => $_SESSION['username'], 'is_admin' => (int)($_SESSION['is_admin'] ?? 0), 'auth' => true]);
