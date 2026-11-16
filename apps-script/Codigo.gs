/**
 * Firma de credenciales · Ayuntamiento de Sagunto
 * ------------------------------------------------------------------
 * Servicio web de Google Apps Script: recibe la firma desde la página
 * de GitHub Pages y la guarda en una carpeta de Google Drive con el
 * NIP como nombre de archivo.
 *
 * Despliegue:  Implementar › Nueva implementación › Aplicación web
 *              - Ejecutar como: Yo
 *              - Quién tiene acceso: Cualquier persona
 *
 * Cada vez que modifique ESTE archivo debe publicar una VERSIÓN NUEVA
 * (Implementar › Gestionar implementaciones › lápiz › Versión: Nueva).
 * El listado de NIP no está aquí, así que cambiarlo no exige republicar.
 */

var CONFIG = {
  // Carpeta destino dentro de Mi unidad. Lo más seguro y rápido es
  // pegar aquí el ID de la carpeta (la parte final de su URL).
  // Si se deja vacío, se crea o reutiliza la ruta RUTA_CARPETA.
  ID_CARPETA: "",
  RUTA_CARPETA: "CREDENCIALES/FIRMAS",

  // Listado de reserva. El listado real NO se escribe aquí: va en
  // Configuración del proyecto › Propiedades del script › NIPS.
  // Así este archivo puede publicarse sin exponer los números.
  NIPS: ["109", "327", "328"],

  ZONA: "Europe/Madrid",
  MAX_BYTES: 3 * 1024 * 1024,

  // true = valida y responde, pero no guarda nada en Drive.
  SIMULADO: false,
};

/* ------------------------------------------------------------------ GET */

/**
 * Comprobación rápida: abrir la URL /exec en el navegador debe devolver
 * un JSON con ok: true.
 */
function doGet() {
  var carpeta = "";
  var aviso = "";
  try {
    carpeta = obtenerCarpeta().getName();
  } catch (err) {
    aviso = String(err && err.message ? err.message : err);
  }
  return responder({
    ok: !aviso,
    servicio: "firmacredenciales",
    nipsCargados: leerNips().size,
    origenListado: origenListado(),
    carpeta: carpeta,
    simulado: CONFIG.SIMULADO,
    aviso: aviso,
  });
}

/* ----------------------------------------------------------------- POST */

function doPost(e) {
  try {
    return responder(procesar(e));
  } catch (err) {
    console.error(err);
    return responder({ ok: false, error: mensaje(err) });
  }
}

function procesar(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("La petición llegó vacía.");
  }

  var datos;
  try {
    datos = JSON.parse(e.postData.contents);
  } catch (err) {
    throw new Error("La petición no es válida.");
  }

  var nip = String(datos.nip == null ? "" : datos.nip).trim();
  if (!/^\d{3,4}$/.test(nip)) {
    throw new Error("El número de agente debe tener 3 o 4 cifras.");
  }
  if (!leerNips().has(nip)) {
    throw new Error("El número de agente no figura en el listado.");
  }

  var bytes = decodificarJpeg(datos.imagen);
  if (bytes.length > CONFIG.MAX_BYTES) {
    throw new Error("La imagen supera el tamaño permitido.");
  }
  if (bytes.length < 3000) {
    throw new Error("La imagen de la firma está vacía.");
  }

  if (CONFIG.SIMULADO) {
    return { ok: true, archivo: nip + ".jpg", simulado: true };
  }

  var bloqueo = LockService.getScriptLock();
  var obtenido = bloqueo.tryLock(15000);
  try {
    var carpeta = obtenerCarpeta();
    var nombre = nombreLibre(carpeta, nip);
    var archivo = carpeta.createFile(Utilities.newBlob(bytes, "image/jpeg", nombre));
    return { ok: true, archivo: archivo.getName(), simulado: false };
  } finally {
    if (obtenido) bloqueo.releaseLock();
  }
}

/* --------------------------------------------------------------- imagen */

function decodificarJpeg(imagen) {
  if (typeof imagen !== "string") {
    throw new Error("Falta la imagen de la firma.");
  }

  var prefijo = "data:image/jpeg;base64,";
  if (imagen.indexOf(prefijo) !== 0) {
    throw new Error("El formato de la imagen no es JPEG.");
  }

  var limpio = imagen.slice(prefijo.length).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(limpio)) {
    throw new Error("La imagen recibida está dañada.");
  }

  var bytes;
  try {
    bytes = Utilities.base64Decode(limpio);
  } catch (err) {
    throw new Error("La imagen recibida está dañada.");
  }

  // Marcadores JPEG: inicio FF D8 FF y fin FF D9.
  if (bytes.length < 4) throw new Error("La imagen está vacía.");
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error("La imagen no es un JPEG válido.");
  }
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new Error("La imagen está incompleta.");
  }

  return bytes;
}

/* ---------------------------------------------------------------- Drive */

function obtenerCarpeta() {
  if (CONFIG.ID_CARPETA) {
    return DriveApp.getFolderById(CONFIG.ID_CARPETA);
  }

  var actual = DriveApp.getRootFolder();
  var partes = String(CONFIG.RUTA_CARPETA).split("/");
  for (var i = 0; i < partes.length; i++) {
    var nombre = partes[i].trim();
    if (!nombre) continue;
    var encontradas = actual.getFoldersByName(nombre);
    actual = encontradas.hasNext() ? encontradas.next() : actual.createFolder(nombre);
  }
  return actual;
}

/**
 * 109.jpg la primera vez; si ya existe, 109_2026-11-16-103205.jpg.
 */
function nombreLibre(carpeta, nip) {
  if (!existe(carpeta, nip + ".jpg")) return nip + ".jpg";

  var marca = Utilities.formatDate(new Date(), CONFIG.ZONA, "yyyy-MM-dd-HHmmss");
  var candidato = nip + "_" + marca + ".jpg";
  var intento = 1;
  while (existe(carpeta, candidato) && intento <= 10) {
    candidato = nip + "_" + marca + "-" + intento + ".jpg";
    intento++;
  }
  return candidato;
}

function existe(carpeta, nombre) {
  return carpeta.getFilesByName(nombre).hasNext();
}

/* ----------------------------------------------------------- utilidades */

/**
 * Listado de NIP autorizados. Prioridad:
 *   1. Propiedad del script "NIPS" (coma, punto y coma, espacio o salto de línea).
 *   2. Lista de reserva CONFIG.NIPS.
 * Se lee en cada petición, así que cambiar la propiedad NO requiere
 * publicar una versión nueva.
 */
function leerNips() {
  var propiedad = "";
  try {
    propiedad = PropertiesService.getScriptProperties().getProperty("NIPS") || "";
  } catch (err) {
    propiedad = "";
  }

  var crudo = propiedad || (CONFIG.NIPS || []).join(",");
  var vistos = {};
  var resultado = new Set();

  var partes = crudo.split(/[\s,;]+/);
  for (var i = 0; i < partes.length; i++) {
    var n = partes[i].trim();
    if (/^\d{3,4}$/.test(n) && !vistos[n]) {
      vistos[n] = true;
      resultado.add(n);
    }
  }
  return resultado;
}

function origenListado() {
  try {
    var propiedad = PropertiesService.getScriptProperties().getProperty("NIPS");
    return propiedad ? "propiedades" : "codigo";
  } catch (err) {
    return "codigo";
  }
}

function responder(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function mensaje(err) {
  var texto = err && err.message ? err.message : String(err);
  return texto.slice(0, 300);
}
