<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/missions_lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$user = koobdCurrentUser($conn);
if (!$user) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Please sign in again.']);
    exit();
}

$overview = koobdMissionOverview($user);
echo json_encode(['success' => true, 'unlocks' => $overview['unlocks']]);
