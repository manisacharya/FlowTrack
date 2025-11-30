<?php
require __DIR__ . '/config.php';
$pdo = ensure_database_and_schema();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  bad_request('Method Not Allowed', 405);
}

if (!isset($_GET['id'])) bad_request('Missing id', 422);
$id = (int)$_GET['id'];
$target = isset($_GET['d']) ? $_GET['d'] : (new DateTime('today'))->format('Y-m-d');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $target)) bad_request('Invalid date');

$habit = $pdo->prepare('SELECT * FROM habits WHERE id = :id');
$habit->execute([':id' => $id]);
$h = $habit->fetch();
if (!$h) bad_request('Habit not found', 404);

// Delete target date log
$pdo->prepare('DELETE FROM habit_logs WHERE habit_id = :id AND log_date = :d')->execute([':id' => $id, ':d' => $target]);

// Recompute last_marked and streak
$lastStmt = $pdo->prepare('SELECT MAX(log_date) FROM habit_logs WHERE habit_id = :id');
$lastStmt->execute([':id' => $id]);
$lastMarked = $lastStmt->fetchColumn();

$streak = 0;
if ($lastMarked) {
  $current = new DateTime($lastMarked);
  $frequency = $h['frequency'];
  while (true) {
    $check = $current->format('Y-m-d');
    $exists = $pdo->prepare('SELECT 1 FROM habit_logs WHERE habit_id = :id AND log_date = :d');
    $exists->execute([':id' => $id, ':d' => $check]);
    if (!$exists->fetchColumn()) break;
    $streak++;
    if ($frequency === 'daily') { $current->modify('-1 day'); } else { $current->modify('-7 days'); }
  }
}

$pdo->prepare('UPDATE habits SET last_marked = :lm, streak = :s WHERE id = :id')->execute([
  ':lm' => $lastMarked ?: null,
  ':s' => $streak,
  ':id' => $id,
]);

$updated = $pdo->query('SELECT * FROM habits WHERE id='.(int)$id)->fetch();
ok($updated); 