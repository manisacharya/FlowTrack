<?php
require __DIR__ . '/config.php';
$pdo = ensure_database_and_schema();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $kind = isset($_GET['kind']) && in_array($_GET['kind'], ['morning','night']) ? $_GET['kind'] : null;
  if ($kind) {
    $stmt = $pdo->prepare('SELECT * FROM routines WHERE kind = :k ORDER BY sort ASC, id ASC');
    $stmt->execute([':k' => $kind]);
    ok($stmt->fetchAll());
  } else {
    $rows = $pdo->query('SELECT * FROM routines ORDER BY kind, sort ASC, id ASC')->fetchAll();
    ok($rows);
  }
}

if ($method === 'POST') {
  $data = json_input();
  $kind = isset($data['kind']) && in_array($data['kind'], ['morning','night']) ? $data['kind'] : null;
  $text = isset($data['text']) ? trim($data['text']) : '';
  if (!$kind || $text === '') bad_request('kind and text are required');
  $sort = isset($data['sort']) ? (int)$data['sort'] : 0;
  $stmt = $pdo->prepare('INSERT INTO routines (kind, text, sort) VALUES (:k, :t, :s)');
  $stmt->execute([':k' => $kind, ':t' => $text, ':s' => $sort]);
  $id = $pdo->lastInsertId();
  $row = $pdo->query('SELECT * FROM routines WHERE id='.(int)$id)->fetch();
  ok($row);
}

if ($method === 'PUT') {
  if (!isset($_GET['id'])) bad_request('Missing id', 422);
  $id = (int)$_GET['id'];
  $data = json_input();
  $fields = [];
  $params = [':id' => $id];
  if (isset($data['text'])) { $fields[] = 'text = :t'; $params[':t'] = trim($data['text']); }
  if (isset($data['sort'])) { $fields[] = 'sort = :s'; $params[':s'] = (int)$data['sort']; }
  if (isset($data['kind']) && in_array($data['kind'], ['morning','night'])) { $fields[] = 'kind = :k'; $params[':k'] = $data['kind']; }
  if (empty($fields)) bad_request('No fields to update');
  $sql = 'UPDATE routines SET '.implode(', ', $fields).' WHERE id = :id';
  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  $row = $pdo->query('SELECT * FROM routines WHERE id='.(int)$id)->fetch();
  ok($row);
}

if ($method === 'DELETE') {
  if (!isset($_GET['id'])) bad_request('Missing id', 422);
  $id = (int)$_GET['id'];
  $stmt = $pdo->prepare('DELETE FROM routines WHERE id = :id');
  $stmt->execute([':id' => $id]);
  ok(['deleted' => $id]);
}

bad_request('Method Not Allowed', 405);
