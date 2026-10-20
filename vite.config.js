import { defineConfig } from 'vite';

// Política de seguridad (solo en producción): el navegador bloquea cualquier
// conexión a otro dominio, así que ningún archivo puede salir del dispositivo.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: data:",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

export default defineConfig({
  // Rutas relativas: la web funciona en cualquier carpeta (p. ej. /TonyConverter/)
  base: './',
  // En desarrollo, el conversor de Word usa el del servidor real
  server: {
    proxy: {
      '/api': {
        target: 'https://myappsserver.duckdns.org',
        changeOrigin: true,
        rewrite: (p) => '/TonyConverter' + p,
        headers: { origin: '' },
      },
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  worker: {
    format: 'es',
  },
  plugins: [
    {
      name: 'csp-meta',
      apply: 'build',
      transformIndexHtml(html) {
        return html.replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
        );
      },
    },
  ],
});
