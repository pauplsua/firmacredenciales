/**
 * Firma de credenciales · Ayuntamiento de Sagunto
 * ------------------------------------------------------------------
 * Servicio web de Google Apps Script: recibe la firma desde la página
 * de GitHub Pages y la envía por correo electrónico con el JPEG adjunto.
 *
 * El correo llega a la bandeja corporativa con asunto
 * "Firma credencial <NIP>", listo para una regla de Outlook que guarde
 * el adjunto en OneDrive.
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
  // Correo corporativo al que se envía la firma.
  CORREO_DESTINO: "p.puga@aytosagunto.es",

  // Nombre visible del remitente (el correo sale de la cuenta de Google
  // del script; para que salga de la cuenta corporativa hay que añadir
  // esa dirección como alias en Gmail, ver la guía).
  NOMBRE_REMITENTE: "Firma de credenciales",

  // Dirección a la que se responderá (tu correo corporativo).
  RESPONDER_A: "p.puga@aytosagunto.es",

  // Listado de reserva. El listado real NO se escribe aquí: va en
  // Configuración del proyecto › Propiedades del script › NIPS.
  NIPS: ["109", "327", "328"],

  ZONA: "Europe/Madrid",
  MAX_BYTES: 3 * 1024 * 1024,

  // true = valida y responde, pero no envía correo.
  SIMULADO: false,
};

/* ------------------------------------------------------------------ GET */

function doGet() {
  return responder({
    ok: true,
    servicio: "firmacredenciales",
    nipsCargados: leerNips().size,
    origenListado: origenListado(),
    simulado: CONFIG.SIMULADO,
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

  var nombre = nombreArchivo(nip);

  if (CONFIG.SIMULADO) {
    return { ok: true, archivo: nombre, simulado: true };
  }

  var blob = Utilities.newBlob(bytes, "image/jpeg", nombre);

  MailApp.sendEmail({
    to: CONFIG.CORREO_DESTINO,
    subject: "Firma credencial " + nip,
    body:
      "Se adjunta la firma manuscrita del agente " + nip + ".\n\n" +
      "Archivo: " + nombre + "\n" +
      "Fecha: " + Utilities.formatDate(new Date(), CONFIG.ZONA, "dd/MM/yyyy HH:mm:ss"),
    name: CONFIG.NOMBRE_REMITENTE,
    replyTo: CONFIG.RESPONDER_A,
    attachments: [blob],
  });

  return { ok: true, archivo: nombre, simulado: false };
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

  if (bytes.length < 4) throw new Error("La imagen está vacía.");
  // Utilities.base64Decode devuelve bytes con signo (-128..127), por eso
  // se normalizan con & 0xFF antes de comparar.
  if ((bytes[0] & 0xff) !== 0xff || (bytes[1] & 0xff) !== 0xd8 || (bytes[2] & 0xff) !== 0xff) {
    throw new Error("La imagen no es un JPEG válido.");
  }
  if ((bytes[bytes.length - 2] & 0xff) !== 0xff || (bytes[bytes.length - 1] & 0xff) !== 0xd9) {
    throw new Error("La imagen está incompleta.");
  }

  return bytes;
}

/* ------------------------------------------------------- nombre archivo */

/**
 * Primera firma de un NIP: "109.jpg".
 * Siguientes: "109_2026-11-16-103205.jpg".
 * Se lleva la cuenta en una propiedad del script.
 */
function nombreArchivo(nip) {
  var clave = "firma_" + nip;
  var propiedades = PropertiesService.getScriptProperties();
  var contador = 0;
  try {
    contador = parseInt(propiedades.getProperty(clave) || "0", 10) || 0;
  } catch (err) {
    contador = 0;
  }

  var nombre;
  if (contador === 0) {
    nombre = nip + ".jpg";
  } else {
    var marca = Utilities.formatDate(new Date(), CONFIG.ZONA, "yyyy-MM-dd-HHmmss");
    nombre = nip + "_" + marca + ".jpg";
  }

  try {
    propiedades.setProperty(clave, String(contador + 1));
  } catch (err) {
    // No bloquea el envío si no se puede guardar el contador.
  }

  return nombre;
}

/* ----------------------------------------------------------- utilidades */

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
