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

  // Nombre visible del remitente.
  NOMBRE_REMITENTE: "Firma de credenciales",

  // Dirección a la que se responderá.
  RESPONDER_A: "p.puga@aytosagunto.es",

  // ID de la hoja de cálculo de Google para el registro de firmas.
  // Si se deja vacío, no se escribe en ninguna hoja.
  ID_HOJA_REGISTRO: "1IvncHAupv38f_hqERqgXne69cCyyZBR7WXyWJ8pCb1I",

  // Listado de reserva. El listado real va en Propiedades del script › NIPS.
  NIPS: ["109", "327", "328"],

  ZONA: "Europe/Madrid",
  MAX_BYTES: 3 * 1024 * 1024,

  // true = valida y responde, pero no envía correo ni escribe en la hoja.
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

  // Datos de auditoría (opcionales, nunca bloquean el envío).
  var ip = String(datos.ip == null ? "" : datos.ip).trim();
  var ubicacion = String(datos.ubicacion == null ? "" : datos.ubicacion).trim();
  var dispositivo = String(datos.dispositivo == null ? "" : datos.dispositivo).trim();

  var nombre = nombreArchivo(nip);

  if (CONFIG.SIMULADO) {
    return { ok: true, archivo: nombre, simulado: true };
  }

  var blob = Utilities.newBlob(bytes, "image/jpeg", nombre);

  // Cuerpo del correo con datos de auditoría.
  var cuerpo = "Se adjunta la firma manuscrita del agente " + nip + ".\n\n" +
    "Archivo: " + nombre + "\n" +
    "Fecha: " + Utilities.formatDate(new Date(), CONFIG.ZONA, "dd/MM/yyyy HH:mm:ss") + "\n" +
    "IP: " + (ip || "no disponible") + "\n" +
    "Ubicación aprox.: " + (ubicacion || "no disponible") + "\n" +
    "Dispositivo: " + (dispositivo || "no disponible");

  MailApp.sendEmail({
    to: CONFIG.CORREO_DESTINO,
    subject: "Firma credencial " + nip,
    body: cuerpo,
    name: CONFIG.NOMBRE_REMITENTE,
    replyTo: CONFIG.RESPONDER_A,
    attachments: [blob],
  });

  // Registrar la firma en la hoja de cálculo (si está configurada).
  actualizarRegistro(nip, nombre, ip, ubicacion, dispositivo);

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
  // base64Decode devuelve bytes con signo (-128..127).
  // 0xff = -1, 0xd8 = -40, 0xd9 = -39
  if (bytes[0] !== -1 || bytes[1] !== -40 || bytes[2] !== -1) {
    throw new Error("La imagen no es un JPEG válido.");
  }
  if (bytes[bytes.length - 2] !== -1 || bytes[bytes.length - 1] !== -39) {
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

/**
 * Registra la firma en la hoja de cálculo configurada.
 * Busca el NIP en la columna A y actualiza las columnas B-F.
 * Si no encuentra el NIP, no hace nada (no falla).
 */
function actualizarRegistro(nip, archivo, ip, ubicacion, dispositivo) {
  if (!CONFIG.ID_HOJA_REGISTRO) return;

  try {
    var hoja = SpreadsheetApp.openById(CONFIG.ID_HOJA_REGISTRO).getActiveSheet();
    var fecha = Utilities.formatDate(new Date(), CONFIG.ZONA, "dd/MM/yyyy HH:mm:ss");

    // Escribir cabeceras si la fila 1, columna B está vacía.
    if (!hoja.getRange(1, 2).getValue()) {
      hoja.getRange(1, 2).setValue("Fecha");
      hoja.getRange(1, 3).setValue("Archivo");
      hoja.getRange(1, 4).setValue("IP");
      hoja.getRange(1, 5).setValue("Ubicación");
      hoja.getRange(1, 6).setValue("Dispositivo");
    }

    // Buscar el NIP en la columna A.
    var ultimaFila = hoja.getLastRow();
    for (var i = 1; i <= ultimaFila; i++) {
      var valor = String(hoja.getRange(i, 1).getValue()).trim();
      if (valor === nip) {
        hoja.getRange(i, 2).setValue(fecha);
        hoja.getRange(i, 3).setValue(archivo);
        hoja.getRange(i, 4).setValue(ip || "no disponible");
        hoja.getRange(i, 5).setValue(ubicacion || "no disponible");
        hoja.getRange(i, 6).setValue(dispositivo || "no disponible");
        return;
      }
    }
    // Si no se encontró el NIP, no se añade fila nueva.
  } catch (err) {
    // No bloquea el envío si falla la escritura en la hoja.
    console.error("Error al actualizar registro: " + err);
  }
}

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
    var esValido = n.length >= 3 && n.length <= 4;
    if (esValido) {
      for (var j = 0; j < n.length; j++) {
        var c = n.charAt(j);
        if (c < "0" || c > "9") {
          esValido = false;
          break;
        }
      }
    }
    if (esValido && !vistos[n]) {
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
