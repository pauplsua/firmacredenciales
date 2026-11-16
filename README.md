# Firma de credenciales

Página web para que los agentes firmen con el dedo en el móvil. La firma se
guarda como imagen **JPEG** en Google Drive, con el número de agente (NIP)
como nombre de archivo.

- Web estática publicada en **GitHub Pages**. Sin servidor propio.
- **Google Apps Script** hace de servicio: valida el NIP y guarda el archivo
  en Drive con tu propia cuenta.
- No requiere administradores de Microsoft, ni permisos de Entra ID, ni
  cuentas de Cloudflare.
- Nombres: `1234.jpg`. Si ya existe: `1234_2026-11-16-103205.jpg`.

```
Móvil ──▶ GitHub Pages (HTML/JS) ──▶ Apps Script ──▶ Google Drive
                                     (valida NIP, guarda el JPEG)
```

## Estructura

```
index.html                    Página de firma
comprobar.html                Diagnóstico de la conexión (uso puntual)
assets/                       Estilos, lógica del canvas e icono
apps-script/Codigo.gs         Servicio de Google Apps Script
apps-script/appsscript.json   Manifiesto (zona horaria, permisos)
.github/workflows/pages.yml   Publicación automática al hacer push a main
SETUP-GOOGLE-DRIVE.md         Guía de puesta en marcha paso a paso
herramientas/servir-local.ps1 Previsualizar en el equipo sin instalar nada
```

## Puesta en marcha (resumen)

1. Crear la carpeta `CREDENCIALES/FIRMAS` en Google Drive.
2. Crear un proyecto en <https://script.google.com>, pegar
   `apps-script/Codigo.gs` y poner el ID de la carpeta.
3. Cargar el listado de NIP en **Propiedades del script** (clave `NIPS`).
4. **Implementar › Nueva implementación › Aplicación web**
   (ejecutar como *Yo*, acceso *Cualquier persona*).
5. Pegar la URL `/exec` resultante en `CONFIG.endpoint` de `assets/app.js`.
6. Subir el proyecto a GitHub y activar Pages
   (**Settings › Pages › Source: GitHub Actions**).

El detalle, con capturas de qué marcar en cada pantalla, está en
`SETUP-GOOGLE-DRIVE.md`.

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
  protección de datos. Ver el aviso del Paso 0 de la guía sobre qué cuenta de
  Google usar.
- Límite por envío: 3 MB (el navegador exporta ~20-250 KB).
- Cuotas de Apps Script: 20 000 ejecuciones/día y 90 min/día en cuentas
  personales. Sobrado para un centenar de firmas.

## Historial

La primera versión guardaba en OneDrive mediante un Worker de Cloudflare y una
aplicación de Entra ID. Se descartó porque requiere consentimiento de
administrador. Sigue recuperable:

```powershell
git show 053a191:worker/src/index.js
git show 053a191:SETUP-ONEDRIVE.md
```
