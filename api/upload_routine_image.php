<?php
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  bad_request('Method Not Allowed', 405);
}

if (!isset($_FILES['file'])) {
  bad_request('No file uploaded');
}

$file = $_FILES['file'];
if ($file['error'] !== UPLOAD_ERR_OK) {
  bad_request('Upload error: ' . $file['error']);
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
$allowed = ['image/jpeg','image/png','image/webp','image/gif'];
if (!in_array($mime, $allowed, true)) {
  bad_request('Unsupported file type');
}

$targetDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'assets';
if (!is_dir($targetDir)) mkdir($targetDir, 0777, true);
$target = $targetDir . DIRECTORY_SEPARATOR . 'routine.jpg';

if (!move_uploaded_file($file['tmp_name'], $target)) {
  bad_request('Failed to save file');
}

ok(['saved' => true, 'path' => './assets/routine.jpg']);
