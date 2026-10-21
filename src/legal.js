// Textos legales (España: LSSI-CE, RGPD y LOPDGDD).
// Los campos marcados como [COMPLETAR] deben rellenarse con los datos reales del titular.
const T = (s) => `<span class="todo">[COMPLETAR: ${s}]</span>`;

const EMAIL = '<a href="mailto:secretaria-35015887@gobiernodecanarias.org">secretaria-35015887@gobiernodecanarias.org</a>';

export const LEGAL = {
  aviso: `
<h2>Aviso legal</h2>
<p>En cumplimiento del artículo 10 de la Ley 34/2002, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa de los datos del titular de este sitio web:</p>
<ul>
  <li><strong>Titular:</strong> CIFP Tony Gallardo, centro público de Formación Profesional dependiente de la Consejería competente en materia de educación del Gobierno de Canarias.</li>
  <li><strong>Domicilio:</strong> Ctra. de las Coloradas, 35009 Las Palmas de Gran Canaria (Las Palmas), España.</li>
  <li><strong>Teléfono:</strong> <a href="tel:+34928796292">+34 928 79 62 92</a></li>
  <li><strong>Correo de contacto:</strong> ${EMAIL}</li>
  <li><strong>Web del centro:</strong> <a href="https://www3.gobiernodecanarias.org/medusa/edublog/cifptonygallardo/" rel="noopener" target="_blank">www3.gobiernodecanarias.org/medusa/edublog/cifptonygallardo</a></li>
</ul>
<h3>Funcionamiento del servicio</h3>
<p>Gallardito Converter es una herramienta gratuita que convierte archivos <strong>directamente en el navegador del usuario</strong>. Las únicas excepciones son los documentos de Word (DOCX) que se convierten a PDF o RTF y los PDF que se convierten a Word: para conservar su maquetación se procesan en nuestro propio servidor y se borran en cuanto termina la conversión. Nunca se envían archivos a servidores de terceros.</p>
<h3>Uso responsable</h3>
<p>El usuario es el único responsable de los archivos que convierte y declara tener derecho a usarlos y transformarlos. Queda prohibido utilizar la herramienta para vulnerar derechos de propiedad intelectual o industrial, eludir medidas tecnológicas de protección o para cualquier fin ilícito.</p>
<h3>Responsabilidad</h3>
<p>El servicio se ofrece «tal cual». Aunque cuidamos la calidad de las conversiones, no garantizamos que el resultado sea idéntico al original (por ejemplo, el formato de documentos complejos puede simplificarse). Conserva siempre tu archivo original.</p>
<h3>Propiedad intelectual</h3>
<p>El diseño, la marca y el código propio de este sitio pertenecen a su titular. La herramienta incluye componentes de software libre, utilizados conforme a sus licencias (FFmpeg —GPL—, LibreOffice —MPL—, pdf2docx y PyMuPDF —AGPL—, PDF.js, pdf-lib, SheetJS Community Edition, Mammoth, JSZip y gifenc).</p>
<h3>Legislación aplicable</h3>
<p>Estas condiciones se rigen por la legislación española.</p>
`,
  privacidad: `
<h2>Política de privacidad</h2>
<p>Este texto cumple con el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD).</p>
<h3>Tus archivos</h3>
<p><strong>Casi todas las conversiones se hacen en tu dispositivo</strong>, dentro de tu navegador: esos archivos nunca se suben a internet, no se guardan y desaparecen de la memoria al cerrar o recargar la página o al pulsar «Vaciar». La propia página tiene una política de seguridad que impide al navegador enviar datos a otros dominios.</p>
<h3>Word a PDF o RTF, y PDF a Word</h3>
<p>Para que el resultado respete la maquetación original, estos documentos se envían cifrados (HTTPS) a nuestro propio servidor, donde se convierten con software libre (LibreOffice y pdf2docx) que se ejecuta sin acceso a internet:</p>
<ul>
  <li>El documento se guarda <strong>solo en la memoria RAM</strong> del servidor, nunca en disco.</li>
  <li><strong>Se borra automáticamente</strong> en cuanto se te devuelve el resultado, también si la conversión falla o cierras la página.</li>
  <li>No se guarda ni el nombre del archivo ni su contenido, no se revisa y no se usa para nada más.</li>
  <li>No interviene ninguna empresa externa en la conversión.</li>
  <li><strong>Base jurídica:</strong> la prestación del servicio que solicitas (art. 6.1.b RGPD).</li>
</ul>
<p>Si tu documento contiene datos personales de terceros, eres responsable de tener derecho a tratarlos. Si prefieres que nada salga de tu dispositivo, elige otro formato de salida (por ejemplo HTML o TXT), que se convierte en tu navegador.</p>
<h3>Datos técnicos de conexión</h3>
<p>Como en cualquier web, el servidor que entrega la página puede registrar de forma automática datos técnicos de la visita (dirección IP, fecha y hora, navegador) con fines exclusivamente de seguridad y funcionamiento.</p>
<ul>
  <li><strong>Responsable:</strong> CIFP Tony Gallardo, Ctra. de las Coloradas, 35009 Las Palmas de Gran Canaria. Correo: ${EMAIL}.</li>
  <li><strong>Finalidad:</strong> servir la web y protegerla frente a abusos.</li>
  <li><strong>Base jurídica:</strong> interés legítimo (art. 6.1.f RGPD).</li>
  <li><strong>Conservación:</strong> 14 días; después se borran automáticamente.</li>
  <li><strong>Alojamiento:</strong> Oracle Cloud Infrastructure, en un centro de datos de Marsella (Francia), dentro de la Unión Europea. No hay transferencias internacionales de datos.</li>
  <li><strong>Cesiones:</strong> no se ceden datos a terceros salvo obligación legal.</li>
</ul>
<h3>Tus derechos</h3>
<p>Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a ${EMAIL} o por correo postal a la dirección del centro. Si consideras que no se han respetado, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).</p>
`,
  cookies: `
<h2>Cookies</h2>
<p><strong>Esta web no usa cookies</strong> ni tecnologías parecidas para seguirte, analizar tu comportamiento o mostrarte publicidad. Tampoco usa servicios de análisis ni contenidos de terceros (ni siquiera tipografías externas).</p>
<p>Por eso no mostramos ningún aviso de consentimiento: no hay nada que aceptar.</p>
`,
};
