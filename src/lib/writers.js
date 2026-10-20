// Generadores de documentos escritos por nosotros: PDF (con pdf-lib), DOCX, RTF,
// Markdown y HTML a partir de una lista sencilla de "bloques".
//   bloque = { type: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'pre', text: string }

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';

export const MAX_TEXT_CHARS = 5_000_000;

function checkSize(blocks) {
  let n = 0;
  for (const b of blocks) n += b.text?.length || 0;
  if (n > MAX_TEXT_CHARS) throw new Error('El texto es demasiado largo para generar este formato (máx. 5 millones de caracteres).');
}

/* ---------- Texto plano ⇄ bloques ---------- */

export function textToBlocks(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((t) => t.replace(/\s+$/, ''))
    .filter((t) => t.trim() !== '')
    .map((text) => ({ type: 'p', text }));
}

export function blocksToText(blocks) {
  return blocks.map((b) => (b.type === 'li' ? '• ' + b.text : b.text)).join('\n\n') + '\n';
}

/* ---------- HTML → bloques / Markdown ---------- */

export function htmlToBlocks(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = [];
  const clean = (s) => s.replace(/[ \t\u00a0]+/g, ' ').trim();
  const walk = (node) => {
    for (const el of node.children) {
      const tag = el.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        const lvl = Math.min(3, Number(tag[1]));
        const text = clean(el.textContent);
        if (text) out.push({ type: 'h' + lvl, text });
      } else if (tag === 'ul' || tag === 'ol') {
        let i = 1;
        for (const li of el.children) {
          const text = clean(li.textContent);
          if (text) out.push({ type: 'li', text: tag === 'ol' ? `${i++}. ${text}` : text, ordered: tag === 'ol' });
        }
      } else if (tag === 'table') {
        for (const tr of el.querySelectorAll('tr')) {
          const cells = [...tr.children].map((c) => clean(c.textContent));
          if (cells.some(Boolean)) out.push({ type: 'p', text: cells.join(' | ') });
        }
      } else if (tag === 'pre') {
        out.push({ type: 'pre', text: el.textContent });
      } else if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'blockquote') {
        walk(el);
      } else {
        // <br> dentro de párrafos → salto de línea
        const copy = el.cloneNode(true);
        copy.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
        const text = copy.textContent.split('\n').map(clean).join('\n').trim();
        if (text) out.push({ type: 'p', text });
      }
    }
  };
  walk(doc.body);
  return out;
}

export function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const inline = (node) => {
    let s = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        s += n.textContent.replace(/\s+/g, ' ').replace(/([*_`[\]])/g, '\\$1');
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      const inner = inline(n);
      if (tag === 'strong' || tag === 'b') s += inner.trim() ? `**${inner.trim()}**` : inner;
      else if (tag === 'em' || tag === 'i') s += inner.trim() ? `*${inner.trim()}*` : inner;
      else if (tag === 'a' && n.getAttribute('href') && !n.getAttribute('href').startsWith('#')) s += `[${inner}](${n.getAttribute('href')})`;
      else if (tag === 'br') s += '  \n';
      else if (tag === 'img') s += ''; // las imágenes incrustadas no caben en Markdown
      else s += inner;
    }
    return s;
  };
  const out = [];
  const walk = (node) => {
    for (const el of node.children) {
      const tag = el.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) out.push('#'.repeat(Number(tag[1])) + ' ' + inline(el).trim());
      else if (tag === 'ul' || tag === 'ol') {
        let i = 1;
        out.push([...el.children].map((li) => (tag === 'ol' ? `${i++}. ` : '- ') + inline(li).trim()).join('\n'));
      } else if (tag === 'table') {
        const rows = [...el.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => inline(c).trim().replace(/\|/g, '\\|')));
        if (rows.length) {
          const cols = Math.max(...rows.map((r) => r.length));
          const line = (r) => '| ' + Array.from({ length: cols }, (_, k) => r[k] || '').join(' | ') + ' |';
          out.push([line(rows[0]), '|' + ' --- |'.repeat(cols), ...rows.slice(1).map(line)].join('\n'));
        }
      } else if (tag === 'pre') out.push('```\n' + el.textContent + '\n```');
      else if (tag === 'blockquote') out.push('> ' + inline(el).trim());
      else if (tag === 'div' || tag === 'section' || tag === 'article') walk(el);
      else {
        const t = inline(el).trim();
        if (t) out.push(t);
      }
    }
  };
  walk(doc.body);
  return out.join('\n\n') + '\n';
}

/* ---------- Markdown y HTML ---------- */

export function blocksToMarkdown(blocks) {
  return (
    blocks
      .map((b) => {
        if (b.type === 'h1') return '# ' + b.text;
        if (b.type === 'h2') return '## ' + b.text;
        if (b.type === 'h3') return '### ' + b.text;
        if (b.type === 'li') return b.ordered ? b.text : '- ' + b.text;
        if (b.type === 'pre') return '```\n' + b.text + '\n```';
        return b.text.replace(/\n/g, '  \n');
      })
      .join('\n\n') + '\n'
  );
}

export const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function htmlPage(title, body) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1f2937; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; margin: 1rem 0; }
  td, th { border: 1px solid #d1d5db; padding: .3rem .6rem; text-align: left; vertical-align: top; }
  pre { background: #f3f4f6; padding: 1rem; overflow-x: auto; }
  .page { border-top: 1px dashed #d1d5db; margin-top: 2rem; padding-top: 1rem; }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

export function blocksToHtml(title, blocks) {
  const parts = [];
  let list = null;
  const closeList = () => {
    if (list) parts.push(`</${list}>`);
    list = null;
  };
  for (const b of blocks) {
    if (b.type === 'li') {
      const want = b.ordered ? 'ol' : 'ul';
      if (list !== want) {
        closeList();
        parts.push(`<${want}>`);
        list = want;
      }
      parts.push(`<li>${escapeHtml(b.ordered ? b.text.replace(/^\d+\.\s*/, '') : b.text)}</li>`);
      continue;
    }
    closeList();
    if (b.type === 'pre') parts.push(`<pre>${escapeHtml(b.text)}</pre>`);
    else if (b.type === 'page') parts.push(`<div class="page"></div>`);
    else {
      const tag = b.type === 'p' ? 'p' : b.type;
      parts.push(`<${tag}>${escapeHtml(b.text).replace(/\n/g, '<br>')}</${tag}>`);
    }
  }
  closeList();
  return htmlPage(title, parts.join('\n'));
}

/* ---------- PDF ---------- */

// Las fuentes estándar de PDF solo cubren el alfabeto latino (WinAnsi):
// español, catalán, francés… Lo que no cabe se sustituye por "?".
function makeSanitizer(font) {
  const cache = new Map();
  return (text) => {
    let out = '';
    for (const ch of text.replace(/\t/g, '    ')) {
      let ok = cache.get(ch);
      if (ok === undefined) {
        try {
          font.encodeText(ch);
          ok = true;
        } catch {
          ok = false;
        }
        cache.set(ch, ok);
      }
      out += ok ? ch : ch === '\u2019' || ch === '\u2018' ? "'" : '?';
    }
    return out;
  };
}

function wrapLine(text, font, size, maxWidth) {
  const words = text.split(/(\s+)/);
  const lines = [];
  let line = '';
  const width = (s) => font.widthOfTextAtSize(s, size);
  for (const w of words) {
    if (width(line + w) <= maxWidth) {
      line += w;
      continue;
    }
    if (line.trim()) lines.push(line.trimEnd());
    line = w.trimStart();
    // palabra más ancha que la línea: se corta a trozos
    while (width(line) > maxWidth) {
      let cut = line.length - 1;
      while (cut > 1 && width(line.slice(0, cut)) > maxWidth) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line.trim() || lines.length === 0) lines.push(line.trimEnd());
  return lines;
}

export async function blocksToPdf(blocks, title = '') {
  checkSize(blocks);
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setProducer('Gallardito Converter');
  pdf.setCreator('Gallardito Converter');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const san = { regular: makeSanitizer(regular), bold: makeSanitizer(bold), mono: makeSanitizer(mono) };
  const fonts = { regular, bold, mono };
  const STYLE = {
    h1: { font: 'bold', size: 20, before: 14, after: 8 },
    h2: { font: 'bold', size: 16, before: 12, after: 6 },
    h3: { font: 'bold', size: 13, before: 10, after: 4 },
    p: { font: 'regular', size: 11, before: 0, after: 7 },
    li: { font: 'regular', size: 11, before: 0, after: 3, indent: 14 },
    pre: { font: 'mono', size: 9, before: 4, after: 8 },
  };
  const W = 595.28, H = 841.89, M = 56;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
  };

  for (const b of blocks) {
    if (b.type === 'page') {
      if (y < H - M) newPage();
      continue;
    }
    const st = STYLE[b.type] || STYLE.p;
    const font = fonts[st.font];
    const lh = st.size * 1.35;
    const indent = st.indent || 0;
    const maxW = W - 2 * M - indent;
    if (y < H - M) y -= st.before;
    const raw = san[st.font](b.text);
    const lines = [];
    for (const hard of raw.split('\n')) lines.push(...wrapLine(hard, font, st.size, maxW));
    lines.forEach((ln, i) => {
      if (y - lh < M) newPage();
      y -= lh;
      if (b.type === 'li' && i === 0 && !b.ordered) {
        page.drawText('•', { x: M + 2, y, size: st.size, font, color: rgb(0.2, 0.2, 0.2) });
      }
      page.drawText(ln, { x: M + indent, y, size: st.size, font, color: rgb(0.1, 0.1, 0.12) });
    });
    y -= st.after;
  }
  return pdf.save();
}

// Tabla (hoja de cálculo) → PDF horizontal, con columnas repartidas en varias
// páginas si no caben a lo ancho.
export async function tableToPdf(sheets, title = '') {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setProducer('Gallardito Converter');
  const font = await pdf.embedFont(StandardFonts.Courier);
  const bold = await pdf.embedFont(StandardFonts.CourierBold);
  const san = makeSanitizer(font);
  const W = 841.89, H = 595.28, M = 32, SIZE = 7.5;
  const charW = font.widthOfTextAtSize('M', SIZE);
  const lh = SIZE * 1.45;
  const maxChars = Math.floor((W - 2 * M) / charW);
  let cells = 0;

  for (const { name, rows } of sheets) {
    if (!rows.length) continue;
    const ncols = Math.max(...rows.map((r) => r.length));
    const width = Array.from({ length: ncols }, (_, c) =>
      Math.min(28, Math.max(3, ...rows.slice(0, 2000).map((r) => String(r[c] ?? '').length)))
    );
    // agrupar columnas que quepan en una página
    const groups = [];
    let cur = [], used = 0;
    width.forEach((w, c) => {
      if (cur.length && used + w + 2 > maxChars) {
        groups.push(cur);
        cur = [];
        used = 0;
      }
      cur.push(c);
      used += w + 2;
    });
    if (cur.length) groups.push(cur);

    groups.forEach((cols, gi) => {
      let page, y;
      const header = () => {
        page = pdf.addPage([W, H]);
        y = H - M;
        const label = `${name}${groups.length > 1 ? `  (columnas ${cols[0] + 1}-${cols[cols.length - 1] + 1})` : ''}`;
        page.drawText(san(label), { x: M, y: y - 10, size: 10, font: bold });
        y -= 24;
      };
      header();
      rows.forEach((r, ri) => {
        if (y - lh < M) header();
        y -= lh;
        let x = M;
        for (const c of cols) {
          let t = san(String(r[c] ?? '').replace(/\s+/g, ' '));
          if (t.length > width[c]) t = t.slice(0, width[c] - 1) + '…';
          if (t) page.drawText(t, { x, y, size: SIZE, font: ri === 0 ? bold : font });
          x += (width[c] + 2) * charW;
          if (++cells > 2_000_000) throw new Error('La hoja es demasiado grande para generar un PDF.');
        }
      });
      void gi;
    });
  }
  if (pdf.getPageCount() === 0) pdf.addPage([W, H]);
  return pdf.save();
}

/* ---------- DOCX (Word) escrito a mano ---------- */

const xmlEscape = (s) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export async function blocksToDocx(blocks, title = '') {
  checkSize(blocks);
  const runs = (text, mono) =>
    text
      .split('\n')
      .map(
        (line, i) =>
          (i ? '<w:r><w:br/></w:r>' : '') +
          `<w:r>${mono ? '<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr>' : ''}<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`
      )
      .join('');
  const STYLE_ID = { h1: 'Heading1', h2: 'Heading2', h3: 'Heading3', li: 'ListParagraph' };
  const body = blocks
    .map((b) => {
      if (b.type === 'page') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      const style = STYLE_ID[b.type];
      const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
      const text = b.type === 'li' && !b.ordered ? '• ' + b.text : b.text;
      return `<w:p>${pPr}${runs(text, b.type === 'pre')}</w:p>`;
    })
    .join('');

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`
  );
  zip.file(
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${xmlEscape(title)}</dc:title><dc:creator>Gallardito Converter</dc:creator>
</cp:coreProperties>`
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  );
  const heading = (id, name, size) =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${heading('Heading1', 'heading 1', 36)}
${heading('Heading2', 'heading 2', 30)}
${heading('Heading3', 'heading 3', 26)}
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/><w:ind w:left="360"/></w:pPr></w:style>
</w:styles>`
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body || '<w:p/>'}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body>
</w:document>`
  );
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/* ---------- RTF ---------- */

function rtfEscape(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch;
    else if (ch === '\n') out += '\\line ';
    else if (ch === '\t') out += '\\tab ';
    else if (c < 128) out += ch;
    else if (c <= 0xffff) out += `\\u${c > 32767 ? c - 65536 : c}?`;
    else {
      // fuera del plano básico: par sustituto UTF-16
      const v = c - 0x10000;
      const hi = 0xd800 + (v >> 10), lo = 0xdc00 + (v & 0x3ff);
      out += `\\u${hi - 65536}?\\u${lo - 65536}?`;
    }
  }
  return out;
}

export function blocksToRtf(blocks) {
  checkSize(blocks);
  const SIZE = { h1: 36, h2: 30, h3: 26, p: 22, li: 22, pre: 18 };
  const body = blocks
    .map((b) => {
      if (b.type === 'page') return '\\page\n';
      const fs = SIZE[b.type] || 22;
      const isH = b.type.startsWith('h');
      const font = b.type === 'pre' ? '\\f1' : '\\f0';
      const text = b.type === 'li' && !b.ordered ? '\\bullet  ' + rtfEscape(b.text) : rtfEscape(b.text);
      const indent = b.type === 'li' ? '\\li360' : '';
      return `{\\pard${indent}\\sa${isH ? 160 : 120}${font}\\fs${fs}${isH ? '\\b' : ''} ${text}\\par}\n`;
    })
    .join('');
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\fswiss Calibri;}{\\f1\\fmodern Consolas;}}\n${body}}`;
}

/* ---------- BMP (24 bits) ---------- */

export function imageDataToBmp({ width, height, data }) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + rowSize * height;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);
  v.setUint8(0, 0x42); v.setUint8(1, 0x4d);
  v.setUint32(2, size, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, width, true);
  v.setInt32(22, height, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, rowSize * height, true);
  v.setInt32(38, 2835, true);
  v.setInt32(42, 2835, true);
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4;
    let dst = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const i = src + x * 4;
      u8[dst++] = data[i + 2];
      u8[dst++] = data[i + 1];
      u8[dst++] = data[i];
    }
  }
  return u8;
}
