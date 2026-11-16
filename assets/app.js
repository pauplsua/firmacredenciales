/**
 * Firma de credenciales · Ayuntamiento de Sagunto
 *
 * 1) El usuario teclea su NIP y firma con el dedo sobre el <canvas>.
 * 2) Al enviar, la firma se convierte a JPEG y se manda a una aplicación
 *    web de Google Apps Script que la guarda en Google Drive como
 *    "<NIP>.jpg" o, si ya existía, "<NIP>_AAAAMMDD-HHMMSS.jpg".
 */

const CONFIG = {
  // URL de la aplicación web de Google Apps Script (termina en /exec).
  // Se obtiene al implementarla: Implementar › Nueva implementación.
  endpoint: "https://script.google.com/macros/s/AKfycbyqViOiVaJeAwPuTuKOzB_dLMKVGD0m55QCBDhdhCR_KoD3eDhKqc02cugc_AhCNCalHA/exec",

  // text/plain evita la petición de comprobación previa (preflight) del
  // navegador, que Apps Script no responde. El cuerpo sigue siendo JSON.
  tipoContenido: "text/plain;charset=utf-8",

  maxDimension: 1100, // ancho de la imagen exportada, en píxeles
  margenRecorte: 24, // píxeles de margen alrededor de la firma al recortar
  calidadJpeg: 0.9,
  timeoutMs: 25000,
};

/* ---------------------------------------------------------------- elementos */

const formulario = document.getElementById("formulario");
const inputNip = document.getElementById("nip");
const nipError = document.getElementById("nip-error");
const firmaError = document.getElementById("firma-error");
const estado = document.getElementById("estado");
const botonEnviar = document.getElementById("enviar");
const botonBorrar = document.getElementById("borrar");
const lienzo = document.getElementById("lienzo");
const pista = document.getElementById("pista");
const exito = document.getElementById("exito");
const exitoNip = document.getElementById("exito-nip");
const exitoArchivo = document.getElementById("exito-archivo");
const botonOtra = document.getElementById("otra");
const avisoConfig = document.getElementById("aviso-config");

const ctx = lienzo.getContext("2d");
const trazos = []; // [{ x, y }] con coordenadas normalizadas 0..1
let trazoActual = null;
let anchoCss = 0;
let altoCss = 0;
let enviando = false;

/* -------------------------------------------------------------- configuración */

if (!CONFIG.endpoint.trim()) {
  avisoConfig.hidden = false;
  botonEnviar.disabled = true;
}

/* ------------------------------------------------------------------- lienzo */

function ajustarLienzo() {
  const rect = lienzo.getBoundingClientRect();
  const ancho = Math.round(rect.width);
  const alto = Math.round(rect.height);
  if (!ancho || !alto) return;
  if (ancho === anchoCss && alto === altoCss) return;

  anchoCss = ancho;
  altoCss = alto;

  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  lienzo.width = Math.round(ancho * dpr);
  lienzo.height = Math.round(alto * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  redibujar();
}

function pintarTrazo(contexto, trazo, ancho, alto) {
  if (trazo.length === 0) return;
  const grosor = Math.max(2.2, ancho * 0.006);
  contexto.strokeStyle = "#12222e";
  contexto.fillStyle = "#12222e";
  contexto.lineWidth = grosor;
  contexto.lineCap = "round";
  contexto.lineJoin = "round";

  if (trazo.length === 1) {
    const p = trazo[0];
    contexto.beginPath();
    contexto.arc(p.x * ancho, p.y * alto, grosor / 2, 0, Math.PI * 2);
    contexto.fill();
    return;
  }

  contexto.beginPath();
  contexto.moveTo(trazo[0].x * ancho, trazo[0].y * alto);
  for (let i = 1; i < trazo.length; i++) {
    contexto.lineTo(trazo[i].x * ancho, trazo[i].y * alto);
  }
  contexto.stroke();
}

function redibujar() {
  ctx.clearRect(0, 0, anchoCss, altoCss);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, anchoCss, altoCss);
  for (const trazo of trazos) pintarTrazo(ctx, trazo, anchoCss, altoCss);
}

function puntoDesde(evento) {
  const rect = lienzo.getBoundingClientRect();
  const x = (evento.clientX - rect.left) / rect.width;
  const y = (evento.clientY - rect.top) / rect.height;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

lienzo.addEventListener("pointerdown", (evento) => {
  if (evento.isPrimary === false) return;
  if (evento.button !== undefined && evento.button > 0) return;
  evento.preventDefault();
  try {
    lienzo.setPointerCapture(evento.pointerId);
  } catch {
    /* algún navegador antiguo no lo soporta; no es crítico */
  }
  trazoActual = [puntoDesde(evento)];
  trazos.push(trazoActual);
  actualizarBotones();
  redibujar();
});

lienzo.addEventListener("pointermove", (evento) => {
  if (!trazoActual) return;
  evento.preventDefault();
  trazoActual.push(puntoDesde(evento));
  redibujar();
});

function terminarTrazo() {
  if (!trazoActual) return;
  // Un toque sin desplazamiento deja un punto suelto: si es el primer trazo
  // (un roce accidental), se descarta.
  if (trazoActual.length === 1 && trazos.length === 1) {
    trazos.pop();
    redibujar();
  }
  trazoActual = null;
  actualizarBotones();
}

lienzo.addEventListener("pointerup", terminarTrazo);
lienzo.addEventListener("pointercancel", terminarTrazo);
lienzo.addEventListener("lostpointercapture", terminarTrazo);

lienzo.addEventListener("contextmenu", (evento) => evento.preventDefault());

// Redibujar si cambia el tamaño (rotación, teclado virtual, etc.).
if ("ResizeObserver" in window) {
  new ResizeObserver(() => ajustarLienzo()).observe(lienzo);
} else {
  window.addEventListener("resize", ajustarLienzo);
}

window.addEventListener("orientationchange", () => {
  window.setTimeout(ajustarLienzo, 250);
});

/* -------------------------------------------------------------- interacción */

function actualizarBotones() {
  const hayFirma = trazos.some((t) => t.length > 1);
  botonBorrar.disabled = !hayFirma;
  pista.classList.toggle("oculta", hayFirma);
  if (hayFirma) limpiarErrorFirma();
}

function borrarFirma() {
  trazos.length = 0;
  trazoActual = null;
  redibujar();
  actualizarBotones();
  pista.classList.remove("oculta");
  limpiarErrorFirma();
}

botonBorrar.addEventListener("click", borrarFirma);

inputNip.addEventListener("input", () => {
  inputNip.value = inputNip.value.replace(/\D+/g, "").slice(0, 4);
  inputNip.removeAttribute("aria-invalid");
  nipError.hidden = true;
});

function mostrarNipError(mensaje) {
  nipError.textContent = mensaje;
  nipError.hidden = false;
  inputNip.setAttribute("aria-invalid", "true");
  inputNip.focus();
}

function mostrarErrorFirma(mensaje) {
  firmaError.textContent = mensaje;
  firmaError.hidden = false;
}

function limpiarErrorFirma() {
  firmaError.hidden = true;
  firmaError.textContent = "";
}

function mostrarEstado(mensaje, esError = false) {
  estado.textContent = mensaje;
  estado.classList.toggle("es-error", esError);
}

function validar() {
  const nip = inputNip.value.trim();
  if (!/^\d{3,4}$/.test(nip)) {
    mostrarNipError("El número debe tener 3 o 4 cifras.");
    return null;
  }
  if (!trazos.some((t) => t.length > 1)) {
    mostrarErrorFirma("Falta la firma.");
    return null;
  }
  return nip;
}

/* ---------------------------------------------------------------- exportar */

function exportarJpeg() {
  if (!anchoCss || !altoCss) ajustarLienzo();

  const ancho = CONFIG.maxDimension;
  const alto = Math.max(1, Math.round((ancho * altoCss) / (anchoCss || ancho)));

  // 1. Renderizar la firma completa sobre fondo blanco.
  const completo = document.createElement("canvas");
  completo.width = ancho;
  completo.height = alto;
  const ctxCompleto = completo.getContext("2d");
  ctxCompleto.fillStyle = "#ffffff";
  ctxCompleto.fillRect(0, 0, ancho, alto);
  for (const trazo of trazos) pintarTrazo(ctxCompleto, trazo, ancho, alto);

  // 2. Encontrar el rectángulo que contiene la firma (píxeles no blancos).
  const datos = ctxCompleto.getImageData(0, 0, ancho, alto).data;
  let minX = ancho, minY = alto, maxX = 0, maxY = 0;
  let hayFirma = false;

  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      if (datos[i] < 245 || datos[i + 1] < 245 || datos[i + 2] < 245) {
        hayFirma = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Si por algún motivo no hay firma, devolver la imagen completa.
  if (!hayFirma) {
    return new Promise((resolve, reject) => {
      completo.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen."))),
        "image/jpeg",
        CONFIG.calidadJpeg
      );
    });
  }

  // 3. Recortar con margen, sin salir de los límites del canvas.
  const margen = CONFIG.margenRecorte;
  const x0 = Math.max(0, minX - margen);
  const y0 = Math.max(0, minY - margen);
  const x1 = Math.min(ancho, maxX + 1 + margen);
  const y1 = Math.min(alto, maxY + 1 + margen);
  const anchoRecorte = Math.max(1, x1 - x0);
  const altoRecorte = Math.max(1, y1 - y0);

  // 4. Renderizar solo la zona recortada.
  const recortado = document.createElement("canvas");
  recortado.width = anchoRecorte;
  recortado.height = altoRecorte;
  const ctxRecortado = recortado.getContext("2d");
  ctxRecortado.fillStyle = "#ffffff";
  ctxRecortado.fillRect(0, 0, anchoRecorte, altoRecorte);
  ctxRecortado.drawImage(completo, x0, y0, anchoRecorte, altoRecorte, 0, 0, anchoRecorte, altoRecorte);

  return new Promise((resolve, reject) => {
    recortado.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen."))),
      "image/jpeg",
      CONFIG.calidadJpeg
    );
  });
}

function blobABase64(blob) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result).split(",")[1] || "");
    lector.onerror = () => reject(new Error("No se pudo leer la imagen."));
    lector.readAsDataURL(blob);
  });
}

/* ------------------------------------------------------------------ envío */

formulario.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (enviando) return;

  mostrarEstado("");
  const nip = validar();
  if (!nip) return;

  enviando = true;
  botonEnviar.disabled = true;
  botonEnviar.textContent = "Enviando…";
  mostrarEstado("Guardando la firma, espere un momento…");

  const control = new AbortController();
  const temporizador = window.setTimeout(() => control.abort(), CONFIG.timeoutMs);

  try {
    const blob = await exportarJpeg();
    const base64 = await blobABase64(blob);

    if (!base64) throw new Error("La firma está vacía.");

    const respuesta = await fetch(CONFIG.endpoint.trim(), {
      method: "POST",
      headers: { "Content-Type": CONFIG.tipoContenido },
      body: JSON.stringify({ nip, imagen: "data:image/jpeg;base64," + base64 }),
      signal: control.signal,
    });

    let datos = {};
    try {
      datos = await respuesta.json();
    } catch {
      /* respuesta sin JSON */
    }

    // Apps Script siempre responde 200, así que la señal de éxito es datos.ok.
    if (!respuesta.ok || datos.ok !== true) {
      throw new Error(datos.error || "No se ha podido guardar la firma.");
    }

    mostrarExito(nip, datos.archivo || nip + ".jpg");
  } catch (error) {
    let mensaje;
    if (error && error.name === "AbortError") {
      mensaje = "La operación ha tardado demasiado. Compruebe su conexión e inténtelo de nuevo.";
    } else if (error instanceof TypeError) {
      // fetch lanza TypeError cuando no hay red o el navegador bloquea la conexión.
      mensaje = "No se ha podido contactar con el servicio. Compruebe su conexión e inténtelo de nuevo.";
    } else {
      mensaje = (error && error.message) || "No se ha podido guardar la firma.";
    }
    mostrarEstado(mensaje, true);
  } finally {
    window.clearTimeout(temporizador);
    enviando = false;
    botonEnviar.disabled = false;
    botonEnviar.textContent = "Enviar firma";
  }
});

function mostrarExito(nip, archivo) {
  formulario.hidden = true;
  exito.hidden = false;
  exitoNip.textContent = nip;
  exitoArchivo.textContent = archivo;
  exito.scrollIntoView({ block: "nearest" });
  botonOtra.focus({ preventScroll: true });
}

botonOtra.addEventListener("click", () => {
  borrarFirma();
  inputNip.value = "";
  mostrarEstado("");
  exito.hidden = true;
  formulario.hidden = false;
  inputNip.focus();
});

/* ------------------------------------------------------------------ inicio */

ajustarLienzo();
requestAnimationFrame(ajustarLienzo);
window.addEventListener("load", ajustarLienzo);
actualizarBotones();
