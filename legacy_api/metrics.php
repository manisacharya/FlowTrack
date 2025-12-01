<?php
require __DIR__ . '/config.php';
$pdo = ensure_database_and_schema();

$tasksCompleted = (int)$pdo->query('SELECT COUNT(*) AS c FROM tasks WHERE completed=1')->fetch()['c'];
$activeHabits = (int)$pdo->query('SELECT COUNT(*) AS c FROM habits')->fetch()['c'];
$longestStreak = (int)$pdo->query('SELECT COALESCE(MAX(streak),0) AS s FROM habits')->fetch()['s'];

ok([
  'tasksCompleted' => $tasksCompleted,
  'activeHabits' => $activeHabits,
  'longestStreak' => $longestStreak,
]); 