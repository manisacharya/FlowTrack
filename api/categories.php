<?php
require __DIR__ . '/config.php';
$pdo = ensure_database_and_schema();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = $pdo->query('SELECT * FROM categories ORDER BY name ASC')->fetchAll();
  ok($rows);
}

if ($method === 'POST') {
  $data = json_input();
  $name = isset($data['name']) ? trim($data['name']) : '';
  if ($name === '') bad_request('Name is required');
  $stmt = $pdo->prepare('INSERT INTO categories (name) VALUES (:name)');
  $stmt->execute([':name' => $name]);
  $id = $pdo->lastInsertId();
  $row = $pdo->query('SELECT * FROM categories WHERE id='.(int)$id)->fetch();
  ok($row);
}

if ($method === 'DELETE') {
  if (!isset($_GET['id'])) bad_request('Missing id', 422);
  $id = (int)$_GET['id'];
  $stmt = $pdo->prepare('DELETE FROM categories WHERE id = :id');
  $stmt->execute([':id' => $id]);
  ok(['deleted' => $id]);
}

bad_request('Method Not Allowed', 405); 