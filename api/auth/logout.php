<?php
require_once dirname(__DIR__) . '/config.php';
$_SESSION = [];
session_destroy();
json_out(['ok' => true]);
