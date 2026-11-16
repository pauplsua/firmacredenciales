# Firma de credenciales

Página web para que los agentes firmen con el dedo en el móvil. La firma se
envía por correo electrónico con el JPEG adjunto; el asunto es
`Firma credencial <NIP>` para que una regla de Outlook guarde el adjunto en
OneDrive.

- Web estática publicada en **GitHub Pages**. Sin servidor propio.
- **Google Apps Script** hace de servicio: valida el NIP y envía el correo con
  el adjunto desde la cuenta de Google.
- No requiere administradores de Microsoft, ni permisos de Entra ID, ni
  cuentas de Cloudflare.
- Nombres del adjunto: `1234.jpg`. Si el mismo agente firma otra vez:
  `1234_2026-11-16-103205.jpg`.
- La imagen se **recorta automáticamente** al área de la firma (con ~24 px de
  margen), eliminando el espacio en blanco para que encaje en la credencial.

```
Móvil ──▶ GitHub Pages (HTML/JS) ──▶ Apps Script ──▶ Tu bandeja corporativa
                                     (valida NIP, envía correo con adjunto)
```

## Estructura

```
index.html                    Página de firma
comprobar.html                Diagnóstico de la conexión (uso puntual)
assets/                       Estilos, lógica del canvas e icono
apps-script/Codigo.gs         Servicio de Google Apps Script
apps-script/appsscript.json   Manifiesto (zona horaria, permisos)
.github/workflows/pages.yml   Publicación automática al hacer push a main
SETUP-CORREO.md               Guía de puesta en marcha paso a paso
herramientas/servir-local.ps1 Previsualizar en el equipo sin instalar nada
```

## Puesta en marcha (resumen)

1. Crear un proyecto en <https://script.google.com> y pegar `Codigo.gs`.
2. Cargar el listado de NIP en **Propiedades del script** (clave `NIPS`).
3. (Opcional) Configurar alias de Gmail para enviar desde el correo corporativo.
4. **Implementar › Nueva implementación › Aplicación web**
   (ejecutar como *Yo*, acceso *Cualquier persona*).
5. Pegar la URL `/exec` resultante en `CONFIG.endpoint` de `assets/app.js`.
6. Subir el proyecto a GitHub y activar Pages
   (**Settings › Pages › Source: GitHub Actions**).
7. Crear la regla de Outlook (o el flujo de Power Automate) para guardar los
   adjuntos en OneDrive.

El detalle, con capturas de qué marcar en cada pantalla, está en
`SETUP-CORREO.md`.

## Qué valida

| Dónde | Qué comprueba |
|---|---|
| Navegador | Solo cifras, 3-4 dígitos, que haya firma |
| Apps Script | Que el NIP esté en el listado real |
| Apps Script | Que la imagen sea un JPEG completo y con contenido |

El listado de NIP vive **solo** en el script: nunca se descarga al navegador,
así que aunque la web sea pública no se pueden enumerar los agentes.

## Actualizar el listado de NIP

No se toca el código: ⚙️ Configuración del proyecto › Propiedades del script ›
`NIPS`. El cambio es inmediato, sin publicar versión nueva.

El archivo `apps-script/nips.local.txt` de tu equipo contiene la lista actual
en el formato exacto que espera esa propiedad. Está en `.gitignore`: no se sube
nunca al repositorio.

## Previsualizar en local

```powershell
powershell -ExecutionPolicy Bypass -File herramientas\servir-local.ps1
```

Y abrir <http://localhost:8765/>. Sin `endpoint` configurado la página avisa y
deshabilita el envío, pero se puede dibujar y probar la validación.

## Límites y consideraciones

- La página es **abierta a internet**: quien encuentre la URL puede enviar una
  firma con un NIP válido. Se puede añadir Turnstile o una palabra de paso.
- Una firma manuscrita digitalizada es un **dato biométrico**. La página
  incluye una cláusula informativa; conviene que la revise el responsable de
  protección de datos.
- Límite por envío: 3 MB (el navegador exporta ~20-250 KB).
- Cuotas de Apps Script: 20 000 ejecuciones/día y 100 envíos de correo/día en
  cuentas personales (1 500 en Workspace). Sobrado para 119 firmas.
- El correo y su adjunto quedan en tu buzón corporativo, bajo tu control y
  tus políticas de retención.

## Historial

La primera versión guardaba en OneDrive mediante un Worker de Cloudflare y una
aplicación de Entra ID. Se descartó porque requiere consentimiento de
administrador. La segunda guardaba en Google Drive. Se descartó porque el
usuario prefería recibir las firmas por correo. Ambas siguen recuperables:

```powershell
git show 053a191:worker/src/index.js
git show b098944:apps-script/Codigo.gs
```
