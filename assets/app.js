/**
 * Firma de credenciales · Ayuntamiento de Sagunto
 *
 * 1) El usuario teclea su NIP y firma con el dedo sobre el <canvas>.
 * 2) Al enviar, la firma se convierte a JPEG y se manda al Worker
 *    (Cloudflare) que la guarda en OneDrive como "<NIP>.jpg" o, si ya
 *    existía, "<NIP>_AAAAMMDD-HHMMSS.jpg".
 */

const CONFIG = {
  // URL del Worker. Sustituir por la definitiva tras desplegarlo.
  endpoint: "https://firmacredenciales.CAMBIAR.workers.dev",
  maxDimension: 1100, // ancho de la imagen exportada, en píxeles
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

if (CONFIG.endpoint.includes("CAMBIAR")) {
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

  const salida = document.createElement("canvas");
  salida.width = ancho;
  salida.height = alto;
  const ctxSalida = salida.getContext("2d");

  ctxSalida.fillStyle = "#ffffff";
  ctxSalida.fillRect(0, 0, ancho, alto);

  for (const trazo of trazos) {
    pintarTrazo(ctxSalida, trazo, ancho, alto);
  }

  return new Promise((resolve, reject) => {
    salida.toBlob(
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

    const respuesta = await fetch(CONFIG.endpoint.replace(/\/+$/, "") + "/api/firma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nip, imagen: "data:image/jpeg;base64," + base64 }),
      signal: control.signal,
    });

    let datos = {};
    try {
      datos = await respuesta.json();
    } catch {
      /* respuesta sin JSON */
    }

    if (!respuesta.ok) {
      throw new Error(datos.error || "No se ha podido guardar la firma.");
    }

    mostrarExito(nip, datos.archivo || nip + ".jpg");
  } catch (error) {
    const mensaje =
      error && error.name === "AbortError"
        ? "La operación ha tardado demasiado. Compruebe su conexión e inténtelo de nuevo."
        : (error && error.message) || "No se ha podido guardar la firma.";
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
