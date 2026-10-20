// Tabla de formatos: qué se acepta de entrada y a qué se puede convertir.

export const LIMITS = {
  maxFiles: 10,
  maxFileBytes: 50 * 1024 * 1024, // 50 MB por archivo
  maxTotalBytes: 200 * 1024 * 1024, // 200 MB por tanda
  maxImagePixels: 50_000_000, // 50 megapíxeles
  maxPdfPagesAsImages: 100,
  maxGifSeconds: 20,
};

export const FAMILY = {
  image: { label: 'Imagen', icon: '🖼️' },
  document: { label: 'Documento', icon: '📄' },
  sheet: { label: 'Hoja de cálculo', icon: '📊' },
  audio: { label: 'Audio', icon: '🎵' },
  video: { label: 'Vídeo', icon: '🎬' },
};

// Formatos de entrada (los 10 más usados + CSV como hermano de XLSX)
export const INPUTS = {
  jpg: { family: 'image', exts: ['jpg', 'jpeg', 'jfif'], outputs: ['png', 'webp', 'gif', 'bmp', 'pdf'] },
  png: { family: 'image', exts: ['png'], outputs: ['jpg', 'webp', 'gif', 'bmp', 'pdf'] },
  webp: { family: 'image', exts: ['webp'], outputs: ['jpg', 'png', 'gif', 'bmp', 'pdf'] },
  gif: { family: 'image', exts: ['gif'], outputs: ['jpg', 'png', 'webp', 'bmp', 'pdf'] },
  pdf: { family: 'document', exts: ['pdf'], outputs: ['docx', 'txt', 'html', 'jpg', 'png'] },
  docx: { family: 'document', exts: ['docx'], outputs: ['pdf', 'txt', 'html', 'md', 'rtf'] },
  txt: { family: 'document', exts: ['txt', 'text', 'log'], outputs: ['pdf', 'docx', 'html', 'md', 'rtf'] },
  xlsx: { family: 'sheet', exts: ['xlsx', 'xls'], outputs: ['csv', 'ods', 'json', 'html', 'pdf'] },
  csv: { family: 'sheet', exts: ['csv', 'tsv'], outputs: ['xlsx', 'ods', 'json', 'html', 'pdf'] },
  mp3: { family: 'audio', exts: ['mp3'], outputs: ['wav', 'ogg', 'm4a', 'flac', 'opus'] },
  mp4: { family: 'video', exts: ['mp4', 'm4v'], outputs: ['webm', 'mov', 'mkv', 'mp3', 'gif'] },
};

export const OUTPUT_LABEL = {
  jpg: 'JPG', png: 'PNG', webp: 'WEBP', gif: 'GIF', bmp: 'BMP', pdf: 'PDF',
  docx: 'DOCX (Word)', txt: 'TXT', html: 'HTML', md: 'Markdown', rtf: 'RTF',
  csv: 'CSV', ods: 'ODS', json: 'JSON', xlsx: 'XLSX (Excel)',
  wav: 'WAV', ogg: 'OGG', m4a: 'M4A (AAC)', flac: 'FLAC', opus: 'OPUS',
  webm: 'WEBM', mov: 'MOV', mkv: 'MKV', mp3: 'MP3',
};

export const MIME = {
  jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain;charset=utf-8', html: 'text/html;charset=utf-8', md: 'text/markdown;charset=utf-8',
  rtf: 'application/rtf', csv: 'text/csv;charset=utf-8', json: 'application/json',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', opus: 'audio/ogg',
  webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', mp3: 'audio/mpeg',
  zip: 'application/zip',
};

const EXT_TO_INPUT = {};
for (const [key, def] of Object.entries(INPUTS)) for (const e of def.exts) EXT_TO_INPUT[e] = key;

export function extOf(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function baseName(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export function detectInput(file) {
  return EXT_TO_INPUT[extOf(file.name)] || null;
}

export const ACCEPT_ATTR = Object.keys(EXT_TO_INPUT).map((e) => '.' + e).join(',');

// Comprueba la "firma" del archivo para no fiarse solo de la extensión.
export async function sniff(file, kind) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (a, b) => String.fromCharCode(...head.slice(a, b));
  switch (kind) {
    case 'jpg': return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case 'png': return head[0] === 0x89 && ascii(1, 4) === 'PNG';
    case 'gif': return ascii(0, 4) === 'GIF8';
    case 'webp': return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case 'pdf': {
      // %PDF puede ir precedido de algunos bytes basura
      const t = new TextDecoder('latin1').decode(await file.slice(0, 1024).arrayBuffer());
      return t.includes('%PDF');
    }
    case 'docx': return head[0] === 0x50 && head[1] === 0x4b;
    case 'xlsx': {
      const ext = extOf(file.name);
      if (ext === 'xls') return head[0] === 0xd0 && head[1] === 0xcf; // OLE2
      return head[0] === 0x50 && head[1] === 0x4b;
    }
    case 'mp3': return ascii(0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
    case 'mp4': return ascii(4, 8) === 'ftyp';
    default: return true; // txt / csv: texto plano
  }
}
