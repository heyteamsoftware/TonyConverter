import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import './style.css';
import { LIMITS, INPUTS, FAMILY, OUTPUT_LABEL, ACCEPT_ATTR, detectInput, sniff, baseName } from './formats.js';
import { convert } from './converters/index.js';
import { usesServer } from './converters/server.js';
import { LEGAL } from './legal.js';

const $ = (s) => document.querySelector(s);
const MB = 1024 * 1024;
const fmtBytes = (b) => (b < 1024 ? `${b} B` : b < MB ? `${(b / 1024).toFixed(0)} KB` : `${(b / MB).toFixed(1)} MB`);

const els = {
  drop: $('#dropzone'), input: $('#fileInput'), list: $('#list'), queue: $('#queue'), toast: $('#toast'),
  convertAll: $('#convertAll'), clear: $('#clearBtn'), zipAll: $('#zipAll'), bulk: $('#bulk'), bulkSelect: $('#bulkSelect'),
};

/** @type {Array<{id:number,file:File,kind:string,to:string,status:string,progress:number,msg:string,result:null|{blob:Blob,ext:string}}>} */
let items = [];
let nextId = 1;
let busy = false;

els.input.accept = ACCEPT_ATTR;
$('#limits').textContent = `Hasta ${LIMITS.maxFiles} archivos · ${LIMITS.maxFileBytes / MB} MB cada uno · ${LIMITS.maxTotalBytes / MB} MB en total`;

/* ---------- Avisos ---------- */
let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.hidden = true), 6000);
}

/* ---------- Añadir archivos ---------- */
async function addFiles(fileList) {
  const problems = [];
  let total = items.reduce((s, it) => s + it.file.size, 0);
  for (const file of fileList) {
    if (items.length >= LIMITS.maxFiles) {
      problems.push(`Máximo ${LIMITS.maxFiles} archivos a la vez.`);
      break;
    }
    const kind = detectInput(file);
    if (!kind) {
      problems.push(`«${file.name}»: formato no soportado.`);
      continue;
    }
    if (file.size === 0) {
      problems.push(`«${file.name}» está vacío.`);
      continue;
    }
    if (file.size > LIMITS.maxFileBytes) {
      problems.push(`«${file.name}» pesa ${fmtBytes(file.size)} (máx. ${LIMITS.maxFileBytes / MB} MB).`);
      continue;
    }
    if (total + file.size > LIMITS.maxTotalBytes) {
      problems.push(`Se ha superado el total de ${LIMITS.maxTotalBytes / MB} MB por tanda.`);
      break;
    }
    if (!(await sniff(file, kind))) {
      problems.push(`«${file.name}» no parece un ${kind.toUpperCase()} válido.`);
      continue;
    }
    total += file.size;
    items.push({ id: nextId++, file, kind, to: INPUTS[kind].outputs[0], status: 'idle', progress: 0, msg: '', result: null });
  }
  if (problems.length) toast([...new Set(problems)].join(' '));
  render();
}

els.drop.addEventListener('click', () => !busy && els.input.click());
els.drop.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && !busy) {
    e.preventDefault();
    els.input.click();
  }
});
els.input.addEventListener('change', () => {
  addFiles([...els.input.files]);
  els.input.value = '';
});
['dragenter', 'dragover'].forEach((t) =>
  els.drop.addEventListener(t, (e) => {
    e.preventDefault();
    els.drop.classList.add('over');
  })
);
['dragleave', 'drop'].forEach((t) =>
  els.drop.addEventListener(t, (e) => {
    e.preventDefault();
    els.drop.classList.remove('over');
  })
);
els.drop.addEventListener('drop', (e) => !busy && addFiles([...e.dataTransfer.files]));
// Evita que soltar un archivo fuera de la zona lo abra en el navegador
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

/* ---------- Pintar la lista ---------- */
function render() {
  els.queue.hidden = items.length === 0;
  els.list.replaceChildren(...items.map(row));

  // Selector común si todos comparten salidas posibles
  const common = items.length > 1
    ? INPUTS[items[0].kind].outputs.filter((o) => items.every((it) => INPUTS[it.kind].outputs.includes(o)))
    : [];
  els.bulk.hidden = common.length === 0;
  if (common.length) {
    const allSame = items.every((it) => it.to === items[0].to);
    els.bulkSelect.replaceChildren(
      new Option('—', ''),
      ...common.map((o) => new Option(OUTPUT_LABEL[o], o))
    );
    els.bulkSelect.value = allSame && common.includes(items[0].to) ? items[0].to : '';
    els.bulkSelect.disabled = busy;
  }
  const pending = items.some((it) => it.status === 'idle' || it.status === 'error');
  const done = items.filter((it) => it.status === 'done').length;
  els.convertAll.disabled = busy || (!pending && done === 0);
  els.convertAll.textContent = busy ? 'Convirtiendo…' : pending ? 'Convertir todo' : 'Descargar todo';
  els.clear.disabled = busy;
  els.zipAll.parentElement.hidden = items.length < 2;
  els.drop.classList.toggle('disabled', busy);
}

function row(it) {
  const li = document.createElement('li');
  li.className = `item ${it.status}`;
  const fam = FAMILY[INPUTS[it.kind].family];

  const icon = document.createElement('span');
  icon.className = 'item-icon';
  icon.textContent = fam.icon;
  icon.setAttribute('aria-hidden', 'true');

  const info = document.createElement('div');
  info.className = 'item-info';
  const name = document.createElement('div');
  name.className = 'item-name';
  name.textContent = it.file.name;
  name.title = it.file.name;
  const meta = document.createElement('div');
  meta.className = 'item-meta';
  meta.textContent =
    it.status === 'working' ? it.msg || 'Convirtiendo…'
    : it.status === 'done' ? `Listo · ${baseName(it.file.name)}.${it.result.ext} · ${fmtBytes(it.result.blob.size)}`
    : it.status === 'error' ? it.msg
    : `${it.kind.toUpperCase()} · ${fmtBytes(it.file.size)}`;
  info.append(name, meta);
  if (it.status === 'idle' && usesServer(it.kind, it.to)) {
    const note = document.createElement('div');
    note.className = 'item-note';
    note.textContent = '☁️ Para respetar la maquetación se convierte en nuestro servidor y se borra al instante.';
    info.append(note);
  }
  if (it.status === 'working') {
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('span');
    fill.style.width = `${Math.round(it.progress * 100)}%`;
    if (!it.progress) bar.classList.add('indeterminate');
    bar.append(fill);
    info.append(bar);
  }

  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.textContent = '→';
  arrow.setAttribute('aria-hidden', 'true');

  const sel = document.createElement('select');
  sel.setAttribute('aria-label', `Formato de salida para ${it.file.name}`);
  for (const o of INPUTS[it.kind].outputs) sel.add(new Option(OUTPUT_LABEL[o], o));
  sel.value = it.to;
  sel.disabled = busy;
  sel.addEventListener('change', () => {
    it.to = sel.value;
    resetItem(it);
    render();
  });

  const btns = document.createElement('div');
  btns.className = 'item-btns';
  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'btn small ' + (it.status === 'done' ? 'success' : 'primary');
  main.textContent = it.status === 'done' ? 'Descargar' : it.status === 'error' ? 'Reintentar' : 'Convertir';
  main.disabled = busy;
  main.addEventListener('click', async () => {
    if (it.status === 'done') return download(it.result.blob, outName(it));
    await runBatch([it]);
  });
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn small icon';
  del.textContent = '✕';
  del.title = 'Quitar';
  del.setAttribute('aria-label', `Quitar ${it.file.name}`);
  del.disabled = busy;
  del.addEventListener('click', () => {
    resetItem(it);
    items = items.filter((x) => x !== it);
    render();
  });
  btns.append(main, del);

  li.append(icon, info, arrow, sel, btns);
  return li;
}

function resetItem(it) {
  it.result = null; // se libera la memoria del resultado
  it.status = 'idle';
  it.progress = 0;
  it.msg = '';
}

els.bulkSelect.addEventListener('change', () => {
  const v = els.bulkSelect.value;
  if (!v) return;
  for (const it of items) {
    if (it.to !== v) {
      it.to = v;
      resetItem(it);
    }
  }
  render();
});

/* ---------- Convertir y descargar ---------- */
const outName = (it) => `${baseName(it.file.name)}.${it.result.ext}`;

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  // Liberamos el enlace temporal en cuanto el navegador ha empezado la descarga
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function convertItem(it) {
  it.status = 'working';
  it.progress = 0;
  it.msg = 'Convirtiendo…';
  render();
  let last = 0;
  const update = () => {
    const now = performance.now();
    if (now - last > 120) {
      last = now;
      render();
    }
  };
  try {
    it.result = await convert(it.file, it.kind, it.to, {
      base: baseName(it.file.name),
      onProgress: (p) => {
        it.progress = p;
        update();
      },
      onStatus: (m) => {
        it.msg = m;
        render();
      },
    });
    it.status = 'done';
    it.msg = '';
  } catch (e) {
    console.error(e);
    it.status = 'error';
    it.msg = e?.message || 'Error al convertir.';
    it.result = null;
  }
}

async function runBatch(list) {
  if (busy) return;
  busy = true;
  const zip = els.zipAll.checked && list.length > 1;
  try {
    for (const it of list) {
      if (it.status !== 'done') await convertItem(it);
      if (!zip && it.status === 'done') download(it.result.blob, outName(it));
    }
    if (zip) await downloadZip(list.filter((it) => it.status === 'done'));
  } finally {
    busy = false;
    render();
  }
}

async function downloadZip(done) {
  if (!done.length) return;
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const used = new Set();
  for (const it of done) {
    let name = outName(it);
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${baseName(it.file.name)} (${n}).${it.result.ext}`;
    used.add(name.toLowerCase());
    zip.file(name, it.result.blob);
  }
  download(await zip.generateAsync({ type: 'blob' }), 'gallardito-converter.zip');
}

els.convertAll.addEventListener('click', () => runBatch([...items]));
els.clear.addEventListener('click', () => {
  items.forEach(resetItem);
  items = [];
  render();
});

/* ---------- Tabla de formatos ---------- */
const grid = $('#formatsGrid');
for (const [kind, def] of Object.entries(INPUTS)) {
  const card = document.createElement('div');
  card.className = 'fcard';
  const h = document.createElement('h3');
  h.textContent = `${FAMILY[def.family].icon} ${kind.toUpperCase()}`;
  const p = document.createElement('p');
  p.textContent = def.outputs.map((o) => o.toUpperCase()).join(' · ');
  card.append(h, p);
  grid.append(card);
}

/* ---------- Textos legales ---------- */
const dialog = $('#legalDialog');
document.querySelectorAll('[data-legal]').forEach((b) =>
  b.addEventListener('click', () => {
    $('#legalBody').innerHTML = LEGAL[b.dataset.legal];
    dialog.showModal();
  })
);
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});

render();
