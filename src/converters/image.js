// Imágenes: se decodifican y recodifican con el lienzo (canvas) del navegador.
import { PDFDocument } from 'pdf-lib';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { imageDataToBmp } from '../lib/writers.js';
import { LIMITS } from '../formats.js';

async function decode(file) {
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error('No se ha podido leer la imagen. Puede que esté dañada.');
  }
  if (bmp.width * bmp.height > LIMITS.maxImagePixels) {
    bmp.close();
    throw new Error('La imagen supera los 50 megapíxeles.');
  }
  return bmp;
}

function toCanvas(bmp, background) {
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bmp, 0, 0);
  return { canvas, ctx };
}

export function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('El navegador no ha podido generar la imagen.'))), type, quality)
  );
}

function hasAlpha(data) {
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

function encodeGif({ width, height, data }) {
  const alpha = hasAlpha(data);
  const format = alpha ? 'rgba4444' : 'rgb565';
  const palette = quantize(data, 256, { format, oneBitAlpha: alpha });
  const index = applyPalette(data, palette, format);
  const transparentIndex = alpha ? palette.findIndex((c) => c[3] === 0) : -1;
  const gif = GIFEncoder();
  gif.writeFrame(index, width, height, {
    palette,
    transparent: transparentIndex >= 0,
    transparentIndex: Math.max(0, transparentIndex),
  });
  gif.finish();
  return gif.bytes();
}

export async function convertImage(file, from, to) {
  const bmp = await decode(file);
  try {
    // JPG y BMP no tienen transparencia → fondo blanco
    const opaque = to === 'jpg' || to === 'bmp' || to === 'pdf';
    const { canvas, ctx } = toCanvas(bmp, opaque ? '#ffffff' : null);
    const w = canvas.width, h = canvas.height;

    if (to === 'png') return canvasToBlob(canvas, 'image/png');
    if (to === 'jpg') return canvasToBlob(canvas, 'image/jpeg', 0.92);
    if (to === 'webp') return canvasToBlob(canvas, 'image/webp', 0.9);
    if (to === 'bmp') return imageDataToBmp(ctx.getImageData(0, 0, w, h));
    if (to === 'gif') return encodeGif(ctx.getImageData(0, 0, w, h));
    if (to === 'pdf') {
      const pdf = await PDFDocument.create();
      pdf.setProducer('Gallardito Converter');
      const bytes =
        from === 'jpg'
          ? await file.arrayBuffer()
          : await (await canvasToBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer();
      const img = await pdf.embedJpg(bytes);
      // 96 ppp → puntos PDF
      const pw = (w * 72) / 96, ph = (h * 72) / 96;
      const page = pdf.addPage([pw, ph]);
      page.drawImage(img, { x: 0, y: 0, width: pw, height: ph });
      return pdf.save();
    }
    throw new Error('Conversión no soportada.');
  } finally {
    bmp.close();
  }
}
