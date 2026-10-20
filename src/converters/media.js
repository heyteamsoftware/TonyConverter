// Audio y vídeo con FFmpeg compilado a WebAssembly. El motor (~30 MB) se sirve
// desde nuestro propio dominio y solo se descarga la primera vez que hace falta.
import { FFmpeg } from '@ffmpeg/ffmpeg';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import { LIMITS } from '../formats.js';

let ffmpeg = null;
let loading = null;

async function getFFmpeg(onStatus) {
  if (ffmpeg) return ffmpeg;
  if (!loading) {
    onStatus?.('Cargando motor de audio/vídeo…');
    const ff = new FFmpeg();
    loading = ff
      .load({ coreURL, wasmURL })
      .then(() => (ffmpeg = ff))
      .catch((e) => {
        loading = null;
        throw new Error('No se ha podido cargar el motor de audio/vídeo: ' + (e?.message || e));
      });
  }
  return loading;
}

const ARGS = {
  // MP3 →
  wav: ['-vn', '-c:a', 'pcm_s16le'],
  ogg: ['-vn', '-c:a', 'libvorbis', '-q:a', '5'],
  m4a: ['-vn', '-c:a', 'aac', '-b:a', '192k'],
  flac: ['-vn', '-c:a', 'flac'],
  // libopus falla en la versión para navegador: usamos el codificador nativo
  opus: ['-vn', '-c:a', 'opus', '-strict', '-2', '-ar', '48000', '-ac', '2', '-b:a', '128k'],
  // MP4 →
  webm: ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '1500k', '-c:a', 'libvorbis', '-q:a', '4'],
  mov: ['-c', 'copy', '-movflags', '+faststart'],
  mkv: ['-c', 'copy'],
  mp3: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'],
  gif: [
    '-t', String(LIMITS.maxGifSeconds),
    '-filter_complex', 'fps=10,scale=480:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer',
    '-loop', '0',
  ],
};

export async function convertMedia(file, from, to, { onProgress, onStatus }) {
  const ff = await getFFmpeg(onStatus);
  onStatus?.('Convirtiendo…');
  const id = Math.random().toString(36).slice(2);
  const input = `in-${id}.${from}`;
  const output = `out-${id}.${to}`;
  const progress = ({ progress }) => onProgress?.(Math.max(0, Math.min(1, progress)));
  const logs = [];
  const log = ({ message }) => logs.push(message) > 40 && logs.shift();
  ff.on('progress', progress);
  ff.on('log', log);
  try {
    await ff.writeFile(input, new Uint8Array(await file.arrayBuffer()));
    let code = await ff.exec(['-hide_banner', '-i', input, ...ARGS[to], '-y', output]);
    if (code !== 0 && (to === 'mov' || to === 'mkv')) {
      // si copiar las pistas tal cual no funciona, se recodifica
      code = await ff.exec(['-hide_banner', '-i', input, '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-y', output]);
    }
    if (code !== 0) console.warn('FFmpeg:\n' + logs.join('\n'));
    if (code !== 0) throw new Error('FFmpeg no ha podido convertir el archivo. Puede que esté dañado.');
    const data = await ff.readFile(output);
    return data;
  } catch (e) {
    // Ante cualquier fallo apagamos el motor (se libera toda su memoria)
    // y la próxima conversión arranca uno limpio.
    try {
      ff.terminate();
    } catch {
      /* ya estaba parado */
    }
    ffmpeg = null;
    loading = null;
    if (e instanceof Error && e.message.startsWith('FFmpeg no ha podido')) throw e;
    throw new Error('El motor de audio/vídeo ha fallado con este archivo. Prueba con otro formato de salida.');
  } finally {
    ff.off('progress', progress);
    ff.off('log', log);
    // Se borra todo de la memoria del motor: no queda rastro.
    // (Si el motor se apagó por un fallo, su memoria ya se ha liberado entera.)
    for (const f of ffmpeg === ff ? [input, output] : []) {
      try {
        await ff.deleteFile(f);
      } catch {
        /* no existía */
      }
    }
  }
}
