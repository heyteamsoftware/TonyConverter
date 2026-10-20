// Documentos: PDF, DOCX y TXT.
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser.js';
import JSZip from 'jszip';
import {
  textToBlocks, blocksToText, htmlToBlocks, htmlToMarkdown, blocksToMarkdown,
  blocksToHtml, blocksToPdf, blocksToDocx, blocksToRtf, htmlPage, escapeHtml,
} from '../lib/writers.js';
import { canvasToBlob } from './image.js';
import { LIMITS } from '../formats.js';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/* ---------- PDF ---------- */

async function openPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    return await pdfjs.getDocument({ data, isEvalSupported: false, enableXfa: false }).promise;
  } catch (e) {
    if (e?.name === 'PasswordException') throw new Error('El PDF está protegido con contraseña.');
    throw new Error('No se ha podido abrir el PDF. Puede que esté dañado.');
  }
}

async function pdfToBlocks(doc, onProgress) {
  const blocks = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let text = '';
    for (const item of tc.items) {
      if (!('str' in item)) continue;
      text += item.str;
      if (item.hasEOL) text += '\n';
    }
    if (p > 1) blocks.push({ type: 'page' });
    for (const line of text.split('\n')) {
      if (line.trim()) blocks.push({ type: 'p', text: line.trim() });
    }
    page.cleanup();
    onProgress?.(p / doc.numPages);
  }
  if (!blocks.some((b) => b.type === 'p')) {
    throw new Error('Este PDF no contiene texto (parece escaneado). Prueba a convertirlo a JPG o PNG.');
  }
  return blocks;
}

async function pdfToImages(doc, to, base, onProgress) {
  const n = doc.numPages;
  if (n > LIMITS.maxPdfPagesAsImages) {
    throw new Error(`El PDF tiene ${n} páginas; el máximo para pasar a imágenes es ${LIMITS.maxPdfPagesAsImages}.`);
  }
  const type = to === 'jpg' ? 'image/jpeg' : 'image/png';
  const files = [];
  for (let p = 1; p <= n; p++) {
    const page = await doc.getPage(p);
    const vp1 = page.getViewport({ scale: 1 });
    // ~150 ppp, sin pasar de 12 megapíxeles por página
    const scale = Math.min(150 / 72, Math.sqrt(12_000_000 / (vp1.width * vp1.height)));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    files.push({ name: n > 1 ? `${base}-${String(p).padStart(String(n).length, '0')}.${to}` : `${base}.${to}`, blob: await canvasToBlob(canvas, type, 0.9) });
    canvas.width = canvas.height = 0;
    page.cleanup();
    onProgress?.(p / n);
  }
  if (files.length === 1) return files[0].blob;
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.blob);
  return { blob: await zip.generateAsync({ type: 'blob' }), ext: 'zip' };
}

/* ---------- TXT ---------- */

async function readText(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    // Textos antiguos de Windows en español
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/* ---------- Conversor principal ---------- */

export async function convertDocument(file, from, to, { base, onProgress }) {
  if (from === 'pdf') {
    const doc = await openPdf(file);
    try {
      if (to === 'jpg' || to === 'png') return await pdfToImages(doc, to, base, onProgress);
      const blocks = await pdfToBlocks(doc, onProgress);
      if (to === 'txt') return blocksToText(blocks.filter((b) => b.type !== 'page')).replace(/\n\n/g, '\n');
      if (to === 'html') return blocksToHtml(base, blocks);
      // PDF → DOCX se hace en el servidor (ver server.js)
    } finally {
      await doc.destroy();
    }
  }

  if (from === 'docx') {
    const arrayBuffer = await file.arrayBuffer();
    if (to === 'txt') {
      const { value } = await mammoth.extractRawText({ arrayBuffer });
      return value.replace(/\n{3,}/g, '\n\n');
    }
    let html;
    try {
      ({ value: html } = await mammoth.convertToHtml({ arrayBuffer }));
    } catch {
      throw new Error('No se ha podido leer el DOCX. Puede que esté dañado o protegido.');
    }
    if (to === 'html') return htmlPage(base, html);
    if (to === 'md') return htmlToMarkdown(html);
    const blocks = htmlToBlocks(html);
    if (to === 'pdf') return blocksToPdf(blocks, base);
    if (to === 'rtf') return blocksToRtf(blocks);
  }

  if (from === 'txt') {
    const text = await readText(file);
    const blocks = textToBlocks(text);
    if (to === 'pdf') return blocksToPdf(blocks, base);
    if (to === 'docx') return blocksToDocx(blocks, base);
    if (to === 'rtf') return blocksToRtf(blocks);
    if (to === 'md') return blocksToMarkdown(blocks);
    if (to === 'html') return htmlPage(base, `<pre style="white-space:pre-wrap;background:none;padding:0;font-family:inherit">${escapeHtml(text)}</pre>`);
  }

  throw new Error('Conversión no soportada.');
}
