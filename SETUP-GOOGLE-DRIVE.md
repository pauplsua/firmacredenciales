# Configurar Google Drive (sin administradores de por medio)

Todo se hace con **tu cuenta de Google**, en 10 minutos y sin pedir permisos
a nadie. No hay servidores ni servicios de terceros: la web está en GitHub
Pages y el almacenamiento lo gestiona una aplicación web de Google Apps
Script que se ejecuta **con tu propia cuenta**.

```
Móvil ──▶ GitHub Pages (HTML/JS) ──▶ Apps Script (tu cuenta) ──▶ Google Drive
                                     valida el NIP y guarda el JPEG
```

---

## Paso 0 · Decide con qué cuenta

Los archivos quedan en el Drive de la cuenta que despliegue el script.

⚠️ **Importante (protección de datos).** Una firma manuscrita digitalizada es
un dato biométrico de empleados municipales. Si el Ayuntamiento **no** tiene
Google Workspace, usar una cuenta personal de Gmail para guardarlas sitúa
datos municipales fuera del control del Ayuntamiento y sin contrato de
encargado del tratamiento. Opciones:

- **Recomendado**: usar una cuenta de Google **institucional** si existe
  (Google Workspace del Ayuntamiento).
- Si no existe: crear una cuenta de Google **dedicada** (no personal),
  con verificación en dos pasos, titularidad del Ayuntamiento y contraseña
  custodiada por el servicio. Documentarlo en el registro de actividades de
  tratamiento.

Si esto no es viable, la alternativa sigue siendo OneDrive con permiso de IT
(el código anterior está en el historial de git, commit `053a191`).

---

## Paso 1 · Crear la carpeta en Drive

1. Entra en <https://drive.google.com> con la cuenta elegida.
2. Crea `CREDENCIALES` y dentro `FIRMAS`.
3. Abre `FIRMAS` y copia el identificador de la URL:

```
https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz
                                       └────────── esto ──────────┘
```

---

## Paso 2 · Crear el proyecto de Apps Script

1. Ve a <https://script.google.com> › **Nuevo proyecto**.
2. Ponle nombre: `Firma credenciales` (arriba a la izquierda).
3. Borra el contenido de `Código.gs` y pega el de `apps-script/Codigo.gs`.
4. En la línea `ID_CARPETA: ""` pega el identificador del Paso 1.
5. Guarda (Ctrl+S).

## Paso 2 bis · Cargar el listado de NIP

El listado **no se escribe en el código**, para que el archivo del repositorio
pueda publicarse sin exponer los números de agente. Va en las propiedades del
proyecto:

1. En el editor de Apps Script, menú izquierdo: **⚙️ Configuración del
   proyecto**.
2. Abajo, **Propiedades del script › Agregar propiedad**.
3. Nombre: `NIPS`
4. Valor: abre `apps-script/nips.local.txt`, copia todo su contenido y pégalo.
5. **Guardar propiedades del script**.

Ventaja añadida: al leerlo en cada petición, **cambiar el listado no exige
publicar una versión nueva**, basta con editar esta propiedad.

> Si prefieres no usar propiedades, el script recurre a la lista de reserva
> `CONFIG.NIPS` del código (tres números de ejemplo). Sirve para probar el
> flujo, pero no para producción.

---

## Paso 3 · Publicar como aplicación web

1. **Implementar › Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Configuración:
   - **Descripción**: `firmas v1`
   - **Ejecutar como**: *Yo (paupuga@…)*
   - **Quién tiene acceso**: **Cualquier persona**
4. **Implementar**. La primera vez pedirá autorización:
   - *Revisar permisos* › elige tu cuenta.
   - Aparecerá "Google no ha verificado esta aplicación": pulsa
     **Configuración avanzada › Ir a Firma credenciales (no seguro)**.
     Es normal: la aplicación es tuya y no está publicada en el directorio
     de Google. Concede el permiso de Drive.
5. Copia la **URL de la aplicación web**, del tipo:

```
https://script.google.com/macros/s/AKfycb.../exec
```

---

## Paso 4 · Comprobar

Abre esa URL en el navegador. Debe responder un JSON:

```json
{"ok":true,"servicio":"firmacredenciales","nipsCargados":119,
 "origenListado":"propiedades","carpeta":"FIRMAS","simulado":false,"aviso":""}
```

- `nipsCargados` debe coincidir con tu listado (119 en el actual).
- `origenListado` debe ser `propiedades`. Si dice `codigo`, no se guardó la
  propiedad del Paso 2 bis.
- Si `aviso` no está vacío, el problema es la carpeta o el `ID_CARPETA`.

Después abre `https://pauplsua.github.io/firmacredenciales/comprobar.html`,
pega la URL `/exec` y pulsa **Probar**. Esa página envía una firma de prueba y
muestra exactamente qué responde el servicio; sirve para descartar problemas
de conexión del navegador.

---

## Paso 5 · Conectar la web

Edita `assets/app.js` y pega la URL:

```js
endpoint: "https://script.google.com/macros/s/AKfycb.../exec",
```

Haz commit y push. GitHub Pages publica solo.

---

## Paso 6 · Probar en el móvil

1. Abre `https://pauplsua.github.io/firmacredenciales/`.
2. Teclea un NIP de la lista, firma y pulsa **Enviar firma**.
3. En Drive debe aparecer `109.jpg`. Si repites con el mismo NIP:
   `109_2026-11-16-103205.jpg`.

---

## Mantenimiento

**Cambiar o añadir NIP.** ⚙️ Configuración del proyecto › Propiedades del
script › `NIPS` › editar. **No hace falta publicar versión nueva**, porque el
script lee la propiedad en cada petición.

**Cambiar el código** (`Codigo.gs`) sí exige publicar una versión nueva:

> Implementar › Gestionar implementaciones › ✏️ (lápiz) ›
> **Versión: Nueva versión** › Implementar

Si no se crea una versión nueva, la URL sigue ejecutando el código antiguo.
Es el error más habitual al tocar el script.

**Renovar permisos.** No caducan. Si cambias de cuenta de Google, hay que
repetir los pasos 2 a 5.

**Copias de seguridad.** El Drive de la cuenta es la copia. Puedes añadir una
tarea programada en el propio Apps Script que envíe un ZIP mensual, si lo
necesitas.

---

## Límites técnicos

| Límite | Valor | Relevancia |
|---|---|---|
| Ejecuciones de script al día | 20 000 (cuenta personal) | de sobra |
| Tiempo de ejecución al día | 90 min (personal) / 6 h (Workspace) | de sobra para 119 firmas |
| Tamaño de petición | 50 MB | usamos ~20-300 KB |
| Espacio en Drive | 15 GB (personal) | ~12 MB por cada 100 firmas |

---

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| "No se ha podido contactar con el servicio" | URL mal copiada o falta `/exec` | Revisa `endpoint` en `assets/app.js` |
| El JSON dice `"aviso"` con un error | `ID_CARPETA` incorrecto o sin permisos | Revisa el Paso 1 |
| `"nipsCargados": 3` | No se pegó la lista real | Paso 2, punto 5 |
| Sigue respondiendo lo mismo tras editar | Falta publicar versión nueva | Mantenimiento |
| "El número de agente no figura en el listado" | NIP fuera del listado | Revisa la lista |
| La web dice error pero el archivo sí aparece | Se lanzó dos veces | Comprueba duplicados en Drive |

---

## Sobre la seguridad

- El listado de NIP **no viaja al navegador**: solo lo conoce el script.
- El endpoint es público (va en el JavaScript de la página). Cualquiera que
  lo encuentre puede enviar una firma con un NIP válido. Mitigaciones
  posibles si molesta: Cloudflare Turnstile en la página, o una palabra de
  paso compartida con los agentes (no es secreto real, pero filtra curiosos).
- Apps Script no permite limitar por IP desde una aplicación web.
- Todo el tráfico va por HTTPS.
