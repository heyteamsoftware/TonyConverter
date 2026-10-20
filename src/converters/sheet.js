// Hojas de cálculo: XLSX/XLS y CSV con SheetJS (librería libre, incluida en la web).
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { htmlPage, escapeHtml, tableToPdf } from '../lib/writers.js';

const MAX_CELLS = 3_000_000;

// El CSV se lee todo como texto y aquí convertimos a número solo lo que
// claramente lo es. Con separador ";" (Excel en español) la coma es decimal:
// "1.234,50" → 1234.5. Las fechas y los códigos con ceros a la izquierda se
// quedan como texto para no estropearlos.
const NUM_ES = /^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/;
const NUM_EN = /^-?\d+(\.\d+)?$/;
function typeNumbers(wb, spanish) {
  for (const name of wb.SheetNames) {
    const data = wb.Sheets[name]['!data'] || [];
    for (const row of data) {
      if (!row) continue;
      for (const cell of row) {
        if (!cell || cell.t !== 's') continue;
        const s = String(cell.v).trim();
        if (/^-?0\d/.test(s)) continue; // 007, 01234…
        let n = null;
        if (spanish && NUM_ES.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'));
        else if (!spanish && NUM_EN.test(s)) n = Number(s);
        if (n !== null && Number.isFinite(n)) {
          cell.t = 'n';
          cell.v = n;
          delete cell.w;
        }
      }
    }
  }
}

async function readWorkbook(file, from) {
  try {
    if (from === 'csv') {
      const buf = await file.arrayBuffer();
      let text;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
      } catch {
        text = new TextDecoder('windows-1252').decode(buf);
      }
      // Excel en español separa con ";": lo detectamos en la primera línea
      const first = text.slice(0, text.indexOf('\n') >>> 0);
      const FS = file.name.toLowerCase().endsWith('.tsv') ? '\t'
        : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
      const wb = XLSX.read(text, { type: 'string', FS, raw: true, dense: true });
      typeNumbers(wb, FS === ';');
      return wb;
    }
    return XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, dense: true });
  } catch {
    throw new Error('No se ha podido leer la hoja de cálculo. Puede que esté dañada o protegida.');
  }
}

function checkCells(wb) {
  let cells = 0;
  for (const name of wb.SheetNames) {
    const ref = wb.Sheets[name]['!ref'];
    if (!ref) continue;
    const r = XLSX.utils.decode_range(ref);
    cells += (r.e.r - r.s.r + 1) * (r.e.c - r.s.c + 1);
  }
  if (cells > MAX_CELLS) throw new Error('La hoja tiene demasiadas celdas (máx. 3 millones).');
}

const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, '_');

export async function convertSheet(file, from, to, { base }) {
  const wb = await readWorkbook(file, from);
  checkCells(wb);
  const names = wb.SheetNames;

  if (to === 'xlsx' || to === 'ods') {
    return XLSX.write(wb, { bookType: to, type: 'array', compression: true });
  }

  if (to === 'csv') {
    const csv = (n) => '﻿' + XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false });
    if (names.length === 1) return csv(names[0]);
    // varias hojas → un CSV por hoja dentro de un ZIP
    const zip = new JSZip();
    for (const n of names) zip.file(`${base} - ${safeName(n)}.csv`, csv(n));
    return { blob: await zip.generateAsync({ type: 'blob' }), ext: 'zip' };
  }

  if (to === 'json') {
    const rows = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: true });
    const data = names.length === 1 ? rows(names[0]) : Object.fromEntries(names.map((n) => [n, rows(n)]));
    return JSON.stringify(data, null, 2);
  }

  if (to === 'html') {
    const body = names
      .map((n) => {
        const table = XLSX.utils.sheet_to_html(wb.Sheets[n], { header: '', footer: '' });
        return (names.length > 1 ? `<h2>${escapeHtml(n)}</h2>\n` : '') + table;
      })
      .join('\n');
    return htmlPage(base, body);
  }

  if (to === 'pdf') {
    const sheets = names.map((n) => ({
      name: n,
      rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false, blankrows: false }),
    }));
    return tableToPdf(sheets, base);
  }

  throw new Error('Conversión no soportada.');
}
