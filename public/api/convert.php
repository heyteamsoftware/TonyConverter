<?php
// Gallardito Converter — conversiones en el servidor:
//   DOCX → PDF / RTF con LibreOffice
//   PDF  → DOCX      con pdf2docx
//
// Privacidad: el documento se escribe solo en RAM (/dev/shm), se convierte y
// todo se borra al terminar la petición, también si algo falla. No se guarda
// nada en disco ni se registra el nombre o el contenido del archivo.

declare(strict_types=1);

const MAX_BYTES = 50 * 1024 * 1024;
const BASE = '/dev/shm/gallardito';
// Los conversores se ejecutan como el usuario lo-convert, que no tiene acceso a la red
const RUNNER = '/usr/local/bin/gallardito-convert';
const TIMEOUT = 160;     // segundos máximos de conversión
const QUEUE_WAIT = 60;   // segundos máximos esperando turno
// origen => [destino => tipo MIME]
const CONVERSIONS = [
    'docx' => ['pdf' => 'application/pdf', 'rtf' => 'application/rtf'],
    'pdf' => ['docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
];

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');

function fail(int $code, string $msg): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function rrmdir(string $dir): void
{
    if (!is_dir($dir) || is_link($dir)) {
        @unlink($dir);
        return;
    }
    foreach (scandir($dir) ?: [] as $f) {
        if ($f !== '.' && $f !== '..') rrmdir("$dir/$f");
    }
    @rmdir($dir);
}

// Restos de conversiones interrumpidas (p. ej. un reinicio de Apache)
function sweep(): void
{
    foreach (glob(BASE . '/*', GLOB_ONLYDIR) ?: [] as $d) {
        if (filemtime($d) < time() - 600) rrmdir($d);
    }
}

// Perfil de LibreOffice endurecido: sin macros y sin cargar nada externo
function writeProfile(string $profile): void
{
    $items = [
        ['/org.openoffice.Office.Common/Security/Scripting', 'MacroSecurityLevel', 'int', '3'],
        ['/org.openoffice.Office.Common/Security/Scripting', 'DisableMacrosExecution', 'boolean', 'true'],
        ['/org.openoffice.Office.Common/Security/Scripting', 'BlockUntrustedRefererLinks', 'boolean', 'true'],
        ['/org.openoffice.Office.Common/Misc', 'UseLocking', 'boolean', 'false'],
        ['/org.openoffice.Office.Common/History', 'PickListSize', 'int', '0'],
        ['/org.openoffice.Office.Common/History', 'Size', 'int', '0'],
        ['/org.openoffice.Office.Common/Save/Document', 'CreateBackup', 'boolean', 'false'],
        ['/org.openoffice.Office.Recovery/AutoSave', 'Enabled', 'boolean', 'false'],
        ['/org.openoffice.Office.Recovery/RecoveryInfo', 'Enabled', 'boolean', 'false'],
        ['/org.openoffice.Office.Writer/Content/Update', 'Link', 'int', '0'],
        ['/org.openoffice.Office.Calc/Content/Update', 'Link', 'int', '0'],
    ];
    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
        . '<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' . "\n";
    foreach ($items as [$path, $prop, $type, $value]) {
        $xml .= "<item oor:path=\"$path\"><prop oor:name=\"$prop\" oor:op=\"fuse\"><value>$value</value></prop></item>\n";
    }
    $xml .= "</oor:items>\n";
    mkdir("$profile/user", 0770, true);
    file_put_contents("$profile/user/registrymodifications.xcu", $xml);
}

/* ---------- Comprobaciones de la petición ---------- */

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail(405, 'Método no permitido.');

// Solo desde nuestra propia web
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== ($_SERVER['HTTP_HOST'] ?? '')) {
    fail(403, 'Origen no permitido.');
}

$from = $_GET['from'] ?? 'docx';
$to = $_GET['to'] ?? '';
if (!is_string($from) || !is_string($to) || !isset(CONVERSIONS[$from][$to])) fail(400, 'Conversión no soportada.');

$len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($len <= 0) fail(400, 'El archivo está vacío.');
if ($len > MAX_BYTES) fail(413, 'El archivo supera los 50 MB.');

if (!is_dir(BASE) && !@mkdir(BASE, 0700) && !is_dir(BASE)) fail(503, 'Servicio no disponible.');
if (!is_executable(RUNNER)) fail(503, 'Servicio no disponible.');

ignore_user_abort(true); // aunque el usuario cierre la página, se limpia todo
set_time_limit(TIMEOUT + QUEUE_WAIT + 30);
// Carpetas compartidas solo con el grupo lo-convert (heredado de la carpeta base)
umask(0007);
sweep();

$job = BASE . '/' . bin2hex(random_bytes(16));
mkdir($job, 0770);
register_shutdown_function(static fn() => rrmdir($job));

/* ---------- Recibir el archivo directamente en RAM ---------- */

$in = fopen('php://input', 'rb');
$out = fopen("$job/in.$from", 'xb');
$copied = stream_copy_to_stream($in, $out, MAX_BYTES + 1);
fclose($out);
fclose($in);
if ($copied !== $len || $copied > MAX_BYTES) fail(400, 'El archivo no ha llegado completo.');

$fh = fopen("$job/in.$from", 'rb');
$head = (string)fread($fh, 1024);
fclose($fh);
$valid = $from === 'pdf' ? str_contains($head, '%PDF') : str_starts_with($head, "PK\x03\x04");
if (!$valid) fail(415, 'El archivo no es un ' . strtoupper($from) . ' válido.');

/* ---------- Esperar turno (una conversión a la vez) ---------- */

$lock = fopen(BASE . '/.lock', 'c');
$start = time();
while (!flock($lock, LOCK_EX | LOCK_NB)) {
    if (time() - $start > QUEUE_WAIT) fail(503, 'El servidor está ocupado. Inténtalo de nuevo en unos segundos.');
    usleep(250000);
}

/* ---------- Convertir ---------- */

$profile = "$job/profile";
writeProfile($profile);
mkdir("$job/out", 0770);

$mime = CONVERSIONS[$from][$to];
$cmd = ['/usr/bin/sudo', '-n', '-u', 'lo-convert', RUNNER, $job, $from, $to];
$proc = proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes, $job, ['PATH' => '/usr/bin:/bin']);
if (!is_resource($proc)) fail(500, 'No se ha podido iniciar la conversión.');
$code = proc_close($proc);

flock($lock, LOCK_UN);
fclose($lock);

$result = "$job/out/in.$to";
if (!is_file($result) || filesize($result) === 0) {
    [$status, $msg] = match ($code) {
        124 => [504, 'El documento ha tardado demasiado en convertirse.'],
        3 => [422, 'El PDF está protegido con contraseña.'],
        4 => [413, 'El PDF tiene más de 60 páginas, el máximo para pasarlo a Word.'],
        5 => [422, 'Este PDF no contiene texto (parece escaneado), así que no se puede pasar a Word.'],
        default => [422, 'No se ha podido convertir el documento. Puede que esté dañado o protegido con contraseña.'],
    };
    fail($status, $msg);
}

/* ---------- Enviar y borrar ---------- */

header('Content-Type: ' . $mime);
header('Content-Length: ' . filesize($result));
header('Content-Disposition: attachment; filename="documento.' . $to . '"');
readfile($result);
// register_shutdown_function borra la carpeta del trabajo al terminar
