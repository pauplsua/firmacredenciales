# Firma de credenciales

Página web para que los agentes firmen con el dedo en el móvil. La firma se
guarda en OneDrive como imagen **JPEG** con el número de agente (NIP) como
nombre de archivo.

- Web estática publicada en **GitHub Pages** (sin servidor propio).
- **Cloudflare Worker** como intermediario: valida el NIP y sube el archivo.
- Almacenamiento en **OneDrive** vía Microsoft Graph, carpeta
  `CREDENCIALES/FIRMAS`.
- Nombres: `1234.jpg`. Si ya existe: `1234_2026-11-16-103205.jpg`.

```
Móvil ──▶ GitHub Pages (HTML/JS) ──▶ Cloudflare Worker ──▶ Microsoft Graph ──▶ OneDrive
                                    (valida NIP, guarda el secreto)
```

## Estructura

```
index.html                  Página de firma
assets/                     Estilos, lógica del canvas e icono
worker/src/index.js         Worker de Cloudflare (una sola función, sin dependencias)
worker/wrangler.toml        Configuración opcional para desplegar con wrangler
worker/nips.ejemplo.txt     Formato del listado (valores de mentira)
.github/workflows/pages.yml Publicación automática al hacer push a main
SETUP-ONEDRIVE.md           Guía paso a paso de Entra ID y Cloudflare
```

## Puesta en marcha

### 1. Publicar la web

1. Crea el repositorio vacío `firmacredenciales` en GitHub (público).
2. Sube este proyecto a la rama `main`.
3. En GitHub: **Settings › Pages › Source = GitHub Actions**.
4. Al hacer push, el workflow publica en
   `https://pauplsua.github.io/firmacredenciales/`.

### 2. Preparar el acceso a OneDrive

Sigue `SETUP-ONEDRIVE.md`. Necesitas un administrador de Entra ID que apruebe
el permiso `Files.ReadWrite.All`. Al terminar tendrás `CLIENT_ID` y
`CLIENT_SECRET`.

### 3. Desplegar el Worker

1. Cloudflare › **Workers & Pages › Create › Worker** (plan gratuito).
2. Pega el contenido de `worker/src/index.js`, guarda y despliega.
3. En **Settings › Variables and Secrets** añade las variables de la tabla.
4. Copia la URL resultante, del tipo
   `https://firmacredenciales.tu-subdominio.workers.dev`.

### 4. Conectar la web con el Worker

Edita `assets/app.js` y cambia:

```js
endpoint: "https://firmacredenciales.CAMBIAR.workers.dev",
```

por la URL real. Haz commit y push.

### 5. Probar

- Abre `https://<worker>/api/salud`: debe responder `{"ok":true,...}`.
- Abre la web en el móvil, teclea un NIP del listado y firma.
- Comprueba que aparece el archivo en `OneDrive › CREDENCIALES › FIRMAS`.

## Variables del Worker

| Variable | Ejemplo | Secreto | Para qué |
|---|---|---|---|
| `UPN` | `paupuga@aytosagunto.es` | no | Cuenta de OneDrive destino |
| `CARPETA` | `CREDENCIALES/FIRMAS` | no | Ruta destino |
| `TENANT_ID` | `0e89bb39-…` | no | Inquilino de Microsoft 365 |
| `CLIENT_ID` | `a1b2c3…` | sí | App registration |
| `CLIENT_SECRET` | *(valor)* | sí | Secreto de la app |
| `NIPS` | `109,327,328,…` | sí | Listado válido de agentes |
| `ALLOWED_ORIGIN` | `https://pauplsua.github.io` | no | Dominio permitido |
| `SIMULADO` | `true` / `false` | no | Pruebas sin escribir en OneDrive |

Con `SIMULADO=true` el Worker valida todo y responde correctamente, pero no
sube nada. Útil para la primera prueba de extremo a extremo.

## Actualizar el listado de agentes

El listado **no está en el repositorio** (sería público). Vive en el secreto
`NIPS` del Worker:

1. Actualiza el CSV de origen.
2. Genera la lista separada por comas.
3. Cloudflare › Worker › Settings › `NIPS` › Edit › pega y guarda.

El archivo `worker/nips.local.txt` de tu equipo ya contiene la lista actual
(está en `.gitignore`, no se sube nunca).

## Límites y consideraciones

- La página es **abierta a internet**. Cualquiera que la encuentre puede
  enviar una firma con un NIP válido. Si eso no es aceptable, se puede
  añadir Cloudflare Turnstile, restricción por país o una clave de acceso.
- Validación en dos niveles: el navegador comprueba el formato (3-4 cifras) y
  el Worker comprueba que el NIP esté en el listado.
- El listado llega al Worker como secreto, nunca al navegador.
- La firma manuscrita digitalizada puede considerarse dato biométrico.
  La página incluye una cláusula informativa básica; conviene que la revise
  el responsable de protección de datos del Ayuntamiento.
- Límite por envío: 2 MB de imagen (el navegador exporta ~100-250 KB).
