<?php
require __DIR__ . '/config.php';
$pdo = ensure_database_and_schema();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $q = isset($_GET['q']) ? trim($_GET['q']) : '';
  $categoryId = isset($_GET['category_id']) && $_GET['category_id'] !== '' ? (int)$_GET['category_id'] : null;
  $startDue = isset($_GET['start_due']) && $_GET['start_due'] !== '' ? $_GET['start_due'] : null;
  $endDue = isset($_GET['end_due']) && $_GET['end_due'] !== '' ? $_GET['end_due'] : null;

  $sql = "SELECT t.*, c.name AS category_name FROM tasks t LEFT JOIN categories c ON t.category_id = c.id WHERE 1=1";
  $params = [];
  if ($q !== '') { $sql .= " AND t.title LIKE :q"; $params[':q'] = "%$q%"; }
  if ($categoryId !== null) { $sql .= " AND t.category_id = :cid"; $params[':cid'] = $categoryId; }
  if ($startDue && $endDue) { $sql .= " AND t.due_date BETWEEN :sd AND :ed"; $params[':sd'] = $startDue; $params[':ed'] = $endDue; }
  $sql .= " ORDER BY t.created_at DESC";
  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  ok($stmt->fetchAll());
}

if ($method === 'POST') {
  $data = json_input();
  $title = isset($data['title']) ? trim($data['title']) : '';
  if ($title === '') bad_request('Title is required');
  $categoryId = isset($data['category_id']) ? $data['category_id'] : null;
  $dueDate = isset($data['due_date']) && $data['due_date'] !== '' ? $data['due_date'] : null;

  $stmt = $pdo->prepare("INSERT INTO tasks (title, category_id, due_date) VALUES (:title, :category_id, :due_date)");
  $stmt->execute([
    ':title' => $title,
    ':category_id' => $categoryId ?: null,
    ':due_date' => $dueDate,
  ]);
  $id = $pdo->lastInsertId();

  $row = $pdo->query("SELECT t.*, c.name AS category_name FROM tasks t LEFT JOIN categories c ON t.category_id = c.id WHERE t.id=".(int)$id)->fetch();
  ok($row);
}

if ($method === 'PUT') {
  if (!isset($_GET['id'])) bad_request('Missing id', 422);
  $id = (int)$_GET['id'];
  $data = json_input();

  $fields = [];
  $params = [':id' => $id];
  if (isset($data['title'])) { $fields[] = 'title = :title'; $params[':title'] = trim($data['title']); }
  if (array_key_exists('category_id', $data)) { $fields[] = 'category_id = :category_id'; $params[':category_id'] = $data['category_id'] ?: null; }
  if (array_key_exists('due_date', $data)) { $fields[] = 'due_date = :due_date'; $params[':due_date'] = $data['due_date'] ?: null; }
  if (isset($data['completed'])) { $fields[] = 'completed = :completed'; $params[':completed'] = (int)$data['completed']; }

  if (empty($fields)) bad_request('No fields to update');
  $sql = 'UPDATE tasks SET ' . implode(', ', $fields) . ' WHERE id = :id';
  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);

  $row = $pdo->query("SELECT t.*, c.name AS category_name FROM tasks t LEFT JOIN categories c ON t.category_id = c.id WHERE t.id=".(int)$id)->fetch();
  ok($row);
}

if ($method === 'DELETE') {
  if (!isset($_GET['id'])) bad_request('Missing id', 422);
  $id = (int)$_GET['id'];
  $stmt = $pdo->prepare('DELETE FROM tasks WHERE id = :id');
  $stmt->execute([':id' => $id]);
  ok(['deleted' => $id]);
}

bad_request('Method Not Allowed', 405); 