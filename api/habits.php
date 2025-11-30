<?php
require __DIR__ . '/config.php';
$pdo = ensure_database_and_schema();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = $pdo->query('SELECT * FROM habits ORDER BY created_at DESC')->fetchAll();
  ok($rows);
}

if ($method === 'POST') {
  $data = json_input();
  $title = isset($data['title']) ? trim($data['title']) : '';
  $frequency = isset($data['frequency']) && in_array($data['frequency'], ['daily','weekly']) ? $data['frequency'] : 'daily';
  if ($title === '') bad_request('Title is required');

  $stmt = $pdo->prepare('INSERT INTO habits (title, frequency, streak, last_marked) VALUES (:title, :freq, 0, NULL)');
  $stmt->execute([':title' => $title, ':freq' => $frequency]);
  $id = $pdo->lastInsertId();
  $row = $pdo->query('SELECT * FROM habits WHERE id='.(int)$id)->fetch();
  ok($row);
}

if ($method === 'DELETE') {
  if (!isset($_GET['id'])) bad_request('Missing id', 422);
  $id = (int)$_GET['id'];
  $stmt = $pdo->prepare('DELETE FROM habits WHERE id = :id');
  $stmt->execute([':id' => $id]);
  ok(['deleted' => $id]);
}

bad_request('Method Not Allowed', 405); 