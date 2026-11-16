/**
 * Worker de Cloudflare: recibe la firma de la web (GitHub Pages) y la guarda
 * en OneDrive / SharePoint mediante Microsoft Graph.
 *
 * Variables y secretos necesarios (Cloudflare › Workers › Settings):
 *   UPN            paupuga@aytosagunto.es      (cuenta destino)
 *   CARPETA        CREDENCIALES/FIRMAS          (ruta dentro de su OneDrive)
 *   TENANT_ID      0e89bb39-2f74-470b-886d-a2d2375152e4
 *   CLIENT_ID      (App registration de Entra ID)
 *   CLIENT_SECRET  (secreto de esa app)  [secreto]
 *   NIPS           109,327,328,...        [secreto]
 *   ALLOWED_ORIGIN https://pauplsua.github.io
 *   SIMULADO       true | false (sin Graph, solo valida y responde)
 */

const GRAPH = "https://graph.microsoft.com/v1.0";
const MAX_CUERPO = 4 * 1024 * 1024; // 4 MB de JSON (≈ 3 MB de imagen)
const MAX_BYTES_IMAGEN = 2 * 1024 * 1024;
const ZONA = "Europe/Madrid";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = cabecerasCors(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === "/" || url.pathname === "/api/salud") {
        return json(
          {
            ok: true,
            servicio: "firmacredenciales",
            simulado: esSimulado(env),
            nipsCargados: leerNips(env).size,
            carpeta: leerCarpeta(env),
          },
          200,
          cors
        );
      }

      if (url.pathname === "/api/firma") {
        if (request.method !== "POST") {
          return json({ error: "Método no permitido." }, 405, cors);
        }
        return await gestionarFirma(request, env, cors);
      }

      return json({ error: "Ruta no encontrada." }, 404, cors);
    } catch (error) {
      console.error("Error no controlado:", error && error.message);
      return json({ error: "Error interno. Inténtelo de nuevo." }, 500, cors);
    }
  },
};

/* --------------------------------------------------------------- petición */

async function gestionarFirma(request, env, cors) {
  const tipo = request.headers.get("content-type") || "";
  if (!tipo.includes("application/json")) {
    return json({ error: "Formato de envío no admitido." }, 415, cors);
  }

  const texto = await request.text();
  if (texto.length > MAX_CUERPO) {
    return json({ error: "La firma es demasiado grande." }, 413, cors);
  }

  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    return json({ error: "Petición no válida." }, 400, cors);
  }

  const nip = String(datos && datos.nip != null ? datos.nip : "").trim();
  if (!/^\d{3,4}$/.test(nip)) {
    return json({ error: "El número de agente debe tener 3 o 4 cifras." }, 400, cors);
  }

  const permitidos = leerNips(env);
  if (permitidos.size > 0 && !permitidos.has(nip)) {
    return json({ error: "El número de agente no figura en el listado." }, 403, cors);
  }

  const bytes = decodificarJpeg(datos && datos.imagen);
  if (!bytes) {
    return json({ error: "La firma no es una imagen JPEG válida." }, 400, cors);
  }
  if (bytes.length > MAX_BYTES_IMAGEN) {
    return json({ error: "La imagen supera el tamaño permitido." }, 413, cors);
  }
  if (!tieneTrazos(bytes)) {
    return json({ error: "La imagen de la firma está vacía." }, 400, cors);
  }

  const nombre = await elegirNombre(nip, env);
  await subirArchivo(bytes, nombre, env);

  console.log(`Firma guardada: ${nombre} (${bytes.length} bytes)`);
  return json({ ok: true, archivo: nombre, simulado: esSimulado(env) }, 200, cors);
}

/* ------------------------------------------------------------------ imagen */

function decodificarJpeg(imagen) {
  if (typeof imagen !== "string") return null;

  const prefijo = "data:image/jpeg;base64,";
  if (!imagen.startsWith(prefijo)) return null;

  const limpio = imagen.slice(prefijo.length).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(limpio)) return null;

  let binario;
  try {
    binario = atob(limpio);
  } catch {
    return null;
  }

  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);

  // Marcadores SOI (FF D8 FF) y EOI (FF D9).
  if (bytes.length < 4) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null;

  return bytes;
}

/**
 * Descarta imágenes totalmente en blanco: un JPEG de firma vacía comprime
 * tanto que ocupa muy poco. No es infalible, pero evita envíos accidentales.
 */
function tieneTrazos(bytes) {
  return bytes.length > 3000;
}

/* ----------------------------------------------------------------- archivo */

async function elegirNombre(nip, env) {
  const base = `${nip}.jpg`;
  if (esSimulado(env)) return base;

  if (!(await existeArchivo(base, env))) return base;

  const marca = marcaTiempo();
  let candidato = `${nip}_${marca}.jpg`;
  let intento = 1;
  while (await existeArchivo(candidato, env)) {
    candidato = `${nip}_${marca}-${intento}.jpg`;
    intento += 1;
    if (intento > 10) break;
  }
  return candidato;
}

function marcaTiempo(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(fecha); // "2026-11-16 10:32:05"

  const [dia, hora] = partes.split(" ");
  return `${dia}-${(hora || "000000").replace(/:/g, "")}`;
}

async function existeArchivo(nombre, env) {
  const token = await obtenerToken(env);
  const respuesta = await fetch(urlElemento(nombre, env), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (respuesta.status === 404) return false;
  if (!respuesta.ok) {
    throw new Error(`Graph (comprobación) ${respuesta.status}: ${(await respuesta.text()).slice(0, 200)}`);
  }
  return true;
}

async function subirArchivo(bytes, nombre, env) {
  if (esSimulado(env)) return;

  const token = await obtenerToken(env);
  const respuesta = await fetch(`${urlElemento(nombre, env)}:/content`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "image/jpeg",
    },
    body: bytes,
  });

  if (!respuesta.ok) {
    throw new Error(`Graph (subida) ${respuesta.status}: ${(await respuesta.text()).slice(0, 300)}`);
  }
}

function urlElemento(nombre, env) {
  const ruta = `${leerCarpeta(env)}/${nombre}`;
  const codificada = ruta
    .split("/")
    .filter(Boolean)
    .map((parte) => encodeURIComponent(parte))
    .join("/");
  return `${GRAPH}/users/${encodeURIComponent(leerUpn(env))}/drive/root:/${codificada}`;
}

/* ------------------------------------------------------------------- token */

let cacheToken = { valor: null, caduca: 0 };

async function obtenerToken(env) {
  if (!env.TENANT_ID || !env.CLIENT_ID || !env.CLIENT_SECRET) {
    throw new Error("Faltan TENANT_ID, CLIENT_ID o CLIENT_SECRET en el Worker.");
  }

  if (cacheToken.valor && Date.now() < cacheToken.caduca - 60_000) {
    return cacheToken.valor;
  }

  const cuerpo = new URLSearchParams({
    client_id: env.CLIENT_ID,
    client_secret: env.CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const respuesta = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(env.TENANT_ID)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: cuerpo.toString(),
    }
  );

  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    throw new Error(
      `Token ${respuesta.status}: ${datos.error || ""} ${datos.error_description || ""}`.slice(0, 400)
    );
  }

  cacheToken = {
    valor: datos.access_token,
    caduca: Date.now() + Number(datos.expires_in || 3600) * 1000,
  };
  return cacheToken.valor;
}

/* ------------------------------------------------------------- utilidades */

function leerNips(env) {
  const crudo = typeof env.NIPS === "string" ? env.NIPS : "";
  return new Set(
    crudo
      .split(/[\s,;]+/)
      .map((n) => n.trim())
      .filter((n) => /^\d{3,4}$/.test(n))
  );
}

function leerUpn(env) {
  return (env.UPN || "paupuga@aytosagunto.es").trim();
}

function leerCarpeta(env) {
  return (env.CARPETA || "CREDENCIALES/FIRMAS").trim().replace(/^\/+|\/+$/g, "");
}

function esSimulado(env) {
  return String(env.SIMULADO || "").toLowerCase() === "true";
}

function cabecerasCors(request, env) {
  const configurado = (env.ALLOWED_ORIGIN || "*").trim();
  const origen = request.headers.get("Origin") || "";

  let permitido = "*";
  if (configurado !== "*") {
    permitido = configurado.split(",").map((o) => o.trim()).includes(origen) ? origen : "null";
  }

  return {
    "Access-Control-Allow-Origin": permitido,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(cuerpo, estado, cors) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...cors,
    },
  });
}
