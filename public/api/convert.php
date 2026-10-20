<?php
// Gallardito Converter — DOCX → PDF / RTF con LibreOffice.
//
// Privacidad: el documento se escribe solo en RAM (/dev/shm), se convierte y
// todo se borra al terminar la petición, también si algo falla. No se guarda
// nada en disco ni se registra el nombre o el contenido del archivo.

declare(strict_types=1);

const MAX_BYTES = 50 * 1024 * 1024;
const BASE = '/dev/shm/gallardito';
const SOFFICE = '/usr/bin/soffice';
const TIMEOUT = 90;      // segundos máximos de conversión
const QUEUE_WAIT = 60;   // segundos máximos esperando turno
const FORMATS = [
    'pdf' => ['pdf:writer_pdf_Export', 'application/pdf'],
    'rtf' => ['rtf:Rich Text Format', 'application/rtf'],
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
    mkdir("$profile/user", 0700, true);
    file_put_contents("$profile/user/registrymodifications.xcu", $xml);
}

/* ---------- Comprobaciones de la petición ---------- */

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail(405, 'Método no permitido.');

// Solo desde nuestra propia web
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== ($_SERVER['HTTP_HOST'] ?? '')) {
    fail(403, 'Origen no permitido.');
}

$to = $_GET['to'] ?? '';
if (!isset(FORMATS[$to])) fail(400, 'Formato de salida no soportado.');

$len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($len <= 0) fail(400, 'El archivo está vacío.');
if ($len > MAX_BYTES) fail(413, 'El archivo supera los 50 MB.');

if (!is_dir(BASE) && !@mkdir(BASE, 0700) && !is_dir(BASE)) fail(503, 'Servicio no disponible.');
if (!is_executable(SOFFICE)) fail(503, 'Servicio no disponible.');

ignore_user_abort(true); // aunque el usuario cierre la página, se limpia todo
set_time_limit(TIMEOUT + QUEUE_WAIT + 30);
umask(0077);
sweep();

$job = BASE . '/' . bin2hex(random_bytes(16));
mkdir($job, 0700);
register_shutdown_function(static fn() => rrmdir($job));

/* ---------- Recibir el archivo directamente en RAM ---------- */

$in = fopen('php://input', 'rb');
$out = fopen("$job/in.docx", 'xb');
$copied = stream_copy_to_stream($in, $out, MAX_BYTES + 1);
fclose($out);
fclose($in);
if ($copied !== $len || $copied > MAX_BYTES) fail(400, 'El archivo no ha llegado completo.');

$fh = fopen("$job/in.docx", 'rb');
$magic = fread($fh, 4);
fclose($fh);
if ($magic !== "PK\x03\x04") fail(415, 'El archivo no es un DOCX válido.');

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
mkdir("$job/out", 0700);

[$filter, $mime] = FORMATS[$to];
$cmd = [
    '/usr/bin/timeout', '-k', '5', (string)TIMEOUT, SOFFICE,
    "-env:UserInstallation=file://$profile",
    '--headless', '--invisible', '--norestore', '--nolockcheck', '--nodefault', '--nologo',
    '--convert-to', $filter, '--outdir', "$job/out", "$job/in.docx",
];
$env = ['HOME' => $profile, 'PATH' => '/usr/bin:/bin', 'LANG' => 'es_ES.UTF-8', 'TMPDIR' => $job];
$proc = proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes, $job, $env);
if (!is_resource($proc)) fail(500, 'No se ha podido iniciar la conversión.');
$code = proc_close($proc);

flock($lock, LOCK_UN);
fclose($lock);

$result = "$job/out/in.$to";
if (!is_file($result) || filesize($result) === 0) {
    fail($code === 124 ? 504 : 422, $code === 124
        ? 'El documento ha tardado demasiado en convertirse.'
        : 'No se ha podido convertir el documento. Puede que esté dañado o protegido con contraseña.');
}

/* ---------- Enviar y borrar ---------- */

header('Content-Type: ' . $mime);
header('Content-Length: ' . filesize($result));
header('Content-Disposition: attachment; filename="documento.' . $to . '"');
readfile($result);
// register_shutdown_function borra la carpeta del trabajo al terminar
