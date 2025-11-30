<?php
require __DIR__ . '/config.php';
$pdo = ensure_database_and_schema();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
  bad_request('Method Not Allowed', 405);
}

$start = isset($_GET['start']) ? $_GET['start'] : null;
$end = isset($_GET['end']) ? $_GET['end'] : null;
if (!$start || !$end) bad_request('start and end are required (YYYY-MM-DD)');

$stmt = $pdo->prepare('SELECT habit_id, log_date FROM habit_logs WHERE log_date BETWEEN :s AND :e');
$stmt->execute([':s' => $start, ':e' => $end]);
$rows = $stmt->fetchAll();

$map = [];
foreach ($rows as $r) {
  $hid = (string)$r['habit_id'];
  if (!isset($map[$hid])) { $map[$hid] = []; }
  $map[$hid][$r['log_date']] = 1;
}

ok(['logs' => $map]); 