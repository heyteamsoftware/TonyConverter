// Reparte cada conversión a su motor. Los motores se cargan solo cuando hacen
// falta, así la página inicial es ligera.
import { INPUTS, MIME } from '../formats.js';

const loaders = {
  image: () => import('./image.js').then((m) => m.convertImage),
  document: () => import('./document.js').then((m) => m.convertDocument),
  sheet: () => import('./sheet.js').then((m) => m.convertSheet),
  audio: () => import('./media.js').then((m) => m.convertMedia),
  video: () => import('./media.js').then((m) => m.convertMedia),
};

// Devuelve { blob, ext }
export async function convert(file, from, to, opts) {
  const family = INPUTS[from].family;
  const fn = await loaders[family]();
  let out = await fn(file, from, to, opts);
  let ext = to;
  if (out && out.blob instanceof Blob) {
    ext = out.ext;
    out = out.blob;
  }
  const blob = out instanceof Blob ? out : new Blob([out], { type: MIME[ext] || 'application/octet-stream' });
  return { blob, ext };
}
