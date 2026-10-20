// Conversiones en nuestro propio servidor, para conservar la maquetación:
//   DOCX → PDF / RTF con LibreOffice
//   PDF  → DOCX      con pdf2docx
// El servidor lo procesa en memoria y lo borra al terminar.

export const SERVER_CONVERSIONS = {
  docx: ['pdf', 'rtf'],
  pdf: ['docx'],
};

export const usesServer = (from, to) => SERVER_CONVERSIONS[from]?.includes(to) ?? false;

export function convertOnServer(file, from, to, { onProgress, onStatus }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `api/convert.php?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    xhr.responseType = 'blob';
    xhr.timeout = 300_000;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');

    onStatus?.('Enviando al conversor…');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.((e.loaded / e.total) * 0.5);
    };
    xhr.upload.onload = () => {
      onProgress?.(0);
      onStatus?.('Maquetando el documento…');
    };

    xhr.onload = async () => {
      if (xhr.status === 200) return resolve(xhr.response);
      let msg = `El servidor no ha podido convertir el documento (error ${xhr.status}).`;
      try {
        msg = JSON.parse(await xhr.response.text()).error || msg;
      } catch {
        /* respuesta sin JSON */
      }
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error('No hay conexión con el servidor. Comprueba tu conexión a internet.'));
    xhr.ontimeout = () => reject(new Error('El servidor ha tardado demasiado. Inténtalo de nuevo.'));
    xhr.send(file);
  });
}
