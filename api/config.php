<?php
// Basic JSON headers
header('Content-Type: application/json');

// Database credentials (XAMPP defaults)
$DB_HOST = 'localhost';
$DB_USER = 'root';
$DB_PASS = '';
$DB_NAME = 'flowtrack';

function pdo_connect_root($host, $user, $pass) {
  $dsn = "mysql:host=$host;charset=utf8mb4";
  $options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ];
  return new PDO($dsn, $user, $pass, $options);
}

function pdo_connect_db($host, $user, $pass, $db) {
  $dsn = "mysql:host=$host;dbname=$db;charset=utf8mb4";
  $options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ];
  return new PDO($dsn, $user, $pass, $options);
}

function ensure_database_and_schema() {
  global $DB_HOST, $DB_USER, $DB_PASS, $DB_NAME;

  try {
    $pdo = pdo_connect_db($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
  } catch (Throwable $e) {
    // Database may not exist; create it
    $root = pdo_connect_root($DB_HOST, $DB_USER, $DB_PASS);
    $root->exec("CREATE DATABASE IF NOT EXISTS `$DB_NAME` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $pdo = pdo_connect_db($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
  }

  // Create tables if not exist
  $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
SQL);

  $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  category_id INT NULL,
  due_date DATE NULL,
  completed TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tasks_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
SQL);

  $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS habits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  frequency ENUM('daily','weekly') NOT NULL DEFAULT 'daily',
  streak INT NOT NULL DEFAULT 0,
  last_marked DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
SQL);

  $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS habit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  habit_id INT NOT NULL,
  log_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_habit_date (habit_id, log_date),
  CONSTRAINT fk_habit_logs_habit FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
SQL);

  $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS routines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('morning','night') NOT NULL,
  text VARCHAR(255) NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
SQL);

  // Seed default routines if empty
  $count = (int)$pdo->query("SELECT COUNT(*) FROM routines")->fetchColumn();
  if ($count === 0) {
    $defaults = [
      'morning' => ['skin care','make bed','warm lemon water','5 min stretching','journaling','workout'],
      'night' => ['nice warm bath','mood lights in room','herbal tea','journal','plan next day','read 10 pages'],
    ];
    $stmt = $pdo->prepare('INSERT INTO routines (kind, text, sort) VALUES (:k, :t, :s)');
    foreach ($defaults as $kind => $items) {
      $i = 0;
      foreach ($items as $txt) {
        $stmt->execute([':k' => $kind, ':t' => $txt, ':s' => $i++]);
      }
    }
  }

  return $pdo;
}

function json_input() {
  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function ok($data = null) {
  http_response_code(200);
  echo json_encode($data ?? ['ok' => true]);
  exit;
}

function bad_request($message = 'Bad Request', $code = 400) {
  http_response_code($code);
  echo json_encode(['error' => $message]);
  exit;
} 