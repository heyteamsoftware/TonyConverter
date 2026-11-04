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
  // MP4 / MOV →
  mp4: ['-c', 'copy', '-movflags', '+faststart'],
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

// Error con un mensaje pensado para el usuario
class MediaError extends Error {}

const VIDEO_INPUTS = new Set(['mp4', 'mov']);
// Audio que FFmpeg no sabe leer (p. ej. el audio espacial APAC de los iPhone recientes)
const UNREADABLE_AUDIO = /^(none|apac)$/;

// Lee la lista de pistas que FFmpeg muestra al abrir el archivo y elige la
// primera pista de vídeo real (no la carátula) y el primer audio legible.
function pickStreams(lines) {
  let video = null, audio = null, hevc = false;
  for (const l of lines) {
    const m = l.match(/Stream #0:(\d+)[^:]*: (Video|Audio): (\w+)/);
    if (!m) continue;
    const [, idx, kind, codec] = m;
    if (kind === 'Video' && video === null && !/^(mjpeg|png|bmp)$/.test(codec)) {
      video = idx;
      hevc = codec === 'hevc';
    }
    if (kind === 'Audio' && audio === null && !UNREADABLE_AUDIO.test(codec)) audio = idx;
  }
  return { video, audio, hevc };
}

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

    // Intentos en orden: el primero que funcione gana
    let attempts = [ARGS[to]];

    if (VIDEO_INPUTS.has(from)) {
      // 1) Ver qué pistas trae el vídeo
      const probe = [];
      const grab = ({ message }) => probe.push(message);
      ff.on('log', grab);
      await ff.exec(['-hide_banner', '-i', input]);
      ff.off('log', grab);
      const { video, audio, hevc } = pickStreams(probe);

      // 2) Elegir pistas y formas de convertir
      if (to === 'mp3') {
        if (audio === null) throw new MediaError('Este vídeo no tiene sonido que se pueda extraer, así que no se puede pasar a MP3.');
        attempts = [['-map', `0:${audio}`, ...ARGS.mp3]];
      } else {
        if (video === null) throw new MediaError('No se ha encontrado imagen en este vídeo.');
        const map = ['-map', `0:${video}`, ...(audio !== null && to !== 'gif' ? ['-map', `0:${audio}`] : [])];
        // HEVC (iPhone) necesita la marca hvc1 para verse en dispositivos Apple
        const tag = hevc && (to === 'mp4' || to === 'mov') ? ['-tag:v', 'hvc1'] : [];
        const faststart = to === 'mp4' || to === 'mov' ? ['-movflags', '+faststart'] : [];
        if (to === 'mp4' || to === 'mov' || to === 'mkv') {
          attempts = [
            // a) copiar vídeo y audio tal cual (instantáneo)
            [...map, '-c', 'copy', ...tag, ...faststart],
            // b) copiar el vídeo y pasar el audio a AAC
            [...map, '-c:v', 'copy', ...tag, '-c:a', 'aac', '-b:a', '160k', ...faststart],
            // c) recodificar todo a H.264 + AAC (lento, pero se ve en cualquier sitio)
            [...map, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', ...faststart],
          ];
        } else {
          attempts = [[...map, ...ARGS[to]]];
        }
      }
    }

    let code = 1;
    for (const [i, args] of attempts.entries()) {
      if (i === attempts.length - 1 && i > 0) onStatus?.('Recodificando el vídeo (puede tardar)…');
      logs.length = 0;
      code = await ff.exec(['-hide_banner', '-i', input, ...args, '-y', output]);
      if (code === 0) break;
    }
    if (code !== 0) console.warn('FFmpeg:\n' + logs.join('\n'));
    if (code !== 0) throw new MediaError('FFmpeg no ha podido convertir el archivo. Puede que esté dañado.');
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
    if (e instanceof MediaError) throw e;
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
