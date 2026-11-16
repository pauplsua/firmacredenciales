# Configurar el envío de correo (Google Apps Script)

Todo se hace con **tu cuenta de Google**, en 10 minutos y sin pedir permisos
a nadie. No hay servidores, ni servicios de terceros, ni administradores:
la web está en GitHub Pages y Google Apps Script recibe la firma y la envía
por correo con el JPEG adjunto.

```
Móvil ──▶ GitHub Pages (HTML/JS) ──▶ Apps Script ──▶ Tu bandeja corporativa
                                     (valida NIP, envía correo con adjunto)
```

El correo llega con asunto `Firma credencial <NIP>` y adjunto `<NIP>.jpg`,
listo para una regla de Outlook que guarde el adjunto en OneDrive.

---

## Paso 0 · Decide con qué cuenta de Google

El correo sale de la cuenta de Google que despliegue el script. Dos opciones:

- **Cuenta de Google personal** (la más rápida): el correo sale de tu Gmail.
  Funciona de inmediato, sin configuración adicional.
- **Cuenta del Ayuntamiento con Google Workspace** (si existe): el correo sale
  de una dirección institucional.

⚠️ **Protección de datos.** La firma es un dato biométrico de empleados
municipales. Si usas una cuenta personal de Gmail, el correo (con el adjunto)
pasa por los servidores de Google. Es comunicación interna y transitoria, pero
conviente documentarlo en el registro de actividades de tratamiento. Si el
Ayuntamiento tiene Google Workspace, úsalo.

---

## Paso 1 · Crear el proyecto de Apps Script

1. Ve a <https://script.google.com> › **Nuevo proyecto**.
2. Ponle nombre: `Firma credenciales` (arriba a la izquierda).
3. Borra el contenido de `Código.gs` y pega el de `apps-script/Codigo.gs`.
4. Guarda (Ctrl+S).

No hay que crear carpetas ni copiar IDs: el script solo envía correo.

---

## Paso 2 · Cargar el listado de NIP

El listado **no se escribe en el código**, para que el archivo del repositorio
pueda publicarse sin exponer los números de agente. Va en las propiedades del
proyecto:

1. En el editor de Apps Script, menú izquierdo: **⚙️ Configuración del
   proyecto**.
2. Abajo, **Propiedades del script › Agregar propiedad**.
3. Nombre: `NIPS`
4. Valor: abre `apps-script/nips.local.txt`, copia todo su contenido y pégalo.
5. **Guardar propiedades del script**.

Ventaja: al leerlo en cada petición, **cambiar el listado no exige publicar
una versión nueva**, basta con editar esta propiedad.

> Si prefieres no usar propiedades, el script recurre a la lista de reserva
> `CONFIG.NIPS` del código (tres números de ejemplo). Sirve para probar el
> flujo, pero no para producción.

---

## Paso 3 · (Opcional) Que el correo salga de tu buzón corporativo

Por defecto el correo sale de la cuenta de Google del script, con el nombre
"Firma de credenciales" y con `Reply-To` a tu correo corporativo. Si quieres
que el remitente sea `p.puga@aytosagunto.es`:

1. En Gmail (cuenta de Google del script): **Configuración › Cuentas e
   importación › Enviar correo como › Añadir otra dirección de correo**.
2. Introduce `p.puga@aytosagunto.es`.
3. Elige **Enviar a través de los servidores SMTP de p.puga@aytosagunto.es**
   y rellena:
   - Servidor SMTP: `smtp.office365.com`
   - Puerto: `587`
   - Conexión segura: TLS
   - Usuario: `p.puga@aytosagunto.es`
   - Contraseña: la de tu correo corporativo (o una contraseña de aplicación
     si tienes 2FA)
4. Gmail envía un correo de verificación a `p.puga@aytosagunto.es`; confírmalo.
5. Avísame y cambio una línea del script (`name`/`from`) para que use esa
   dirección como remitente.

⚠️ **SMTP AUTH** debe estar habilitado en tu buzón de Microsoft 365. Si tu
administrador lo tiene desactivado (es lo habitual en tenants modernos), este
paso fallará y el correo saldrá de la cuenta de Google con `Reply-To` a tu
corporativo. En la práctica funciona igual de bien para recibir las firmas.

---

## Paso 4 · Publicar como aplicación web

1. **Implementar › Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Configuración:
   - **Descripción**: `firmas v1`
   - **Ejecutar como**: *Yo*
   - **Quién tiene acceso**: **Cualquier persona**
4. **Implementar**. La primera vez pedirá autorización:
   - *Revisar permisos* › elige tu cuenta.
   - Aparecerá "Google no ha verificado esta aplicación": pulsa
     **Configuración avanzada › Ir a Firma credenciales (no seguro)**.
     Es normal: la aplicación es tuya y no está publicada en el directorio
     de Google. Concede el permiso de envío de correo.
5. Copia la **URL de la aplicación web**, del tipo:

```
https://script.google.com/macros/s/AKfycb.../exec
```

---

## Paso 5 · Comprobar

Abre esa URL en el navegador. Debe responder un JSON:

```json
{"ok":true,"servicio":"firmacredenciales","nipsCargados":119,
 "origenListado":"propiedades","simulado":false}
```

- `nipsCargados` debe coincidir con tu listado (119 en el actual).
- `origenListado` debe ser `propiedades`. Si dice `codigo`, no se guardó la
  propiedad del Paso 2.

Después abre `https://pauplsua.github.io/firmacredenciales/comprobar.html`,
pega la URL `/exec` y pulsa **Probar**. Esa página envía una firma de prueba y
muestra exactamente qué responde el servicio; sirve para descartar problemas
de conexión del navegador.

---

## Paso 6 · Conectar la web

Edita `assets/app.js` y pega la URL:

```js
endpoint: "https://script.google.com/macros/s/AKfycb.../exec",
```

Haz commit y push. GitHub Pages publica solo.

---

## Paso 7 · Probar en el móvil

1. Abre `https://pauplsua.github.io/firmacredenciales/`.
2. Teclea un NIP de la lista, firma y pulsa **Enviar firma**.
3. En tu bandeja corporativa debe aparecer un correo con asunto
   `Firma credencial 109` y adjunto `109.jpg`.

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
repetir los pasos 1 a 4.

---

## Límites técnicos

| Límite | Valor | Relevancia |
|---|---|---|
| Ejecuciones de script al día | 20 000 (cuenta personal) | de sobra |
| Tiempo de ejecución al día | 90 min (personal) / 6 h (Workspace) | de sobra para 119 firmas |
| Tamaño de petición | 50 MB | usamos ~20-300 KB |
| Envíos de correo al día | 100 (personal) / 1 500 (Workspace) | de sobra para 119 firmas |
| Tamaño máximo por correo | 25 MB | usamos ~20-250 KB |

---

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| "No se ha podido contactar con el servicio" | URL mal copiada o falta `/exec` | Revisa `endpoint` en `assets/app.js` |
| El JSON dice `"aviso"` o falla | Error en el script | Abre **Ejecuciones** en el editor y mira el log |
| `"nipsCargados": 3` | No se guardó la propiedad | Paso 2 |
| Sigue respondiendo lo mismo tras editar | Falta publicar versión nueva | Mantenimiento |
| "El número de agente no figura en el listado" | NIP fuera del listado | Revisa la propiedad `NIPS` |
| El correo no llega | Revisa spam / límite diario | Mira la carpeta de spam |
| `Exception: ... is not authorized to send email` | Falta autorizar MailApp | Repite el Paso 4 (autorización) |

---

## Regla de Outlook para guardar en OneDrive

Una vez que los correos lleguen a tu bandeja, crea esta regla en Outlook:

1. **Archivo › Administrar reglas y alertas › Nueva regla**.
2. *Aplicar regla a los mensajes que recibo*.
3. Condiciones:
   - *de personas o grupo público*: tu propia dirección (p.puga@aytosagunto.es)
   - *con palabras específicas en el asunto*: `firma credencial`
   - *que tenga datos adjuntos*
4. Acciones:
   - *moverlo a la carpeta*: una carpeta de tu bandeja (p. ej. "Firmas").
   - (Opcional) *ejecutar un script* para guardar el adjunto en OneDrive.

⚠️ **Outlook no puede guardar adjuntos en OneDrive por sí solo** con una regla
estándar: la regla mueve el correo a una carpeta, pero extraer el adjunto a
OneDrive requiere un paso adicional. Dos opciones:

- **Power Automate** (recomendado): flujo con desencadenador
  *Cuando llega un nuevo correo (V3)* + filtro por asunto + acción
  *Crear archivo* en OneDrive. Los conectores de Outlook y OneDrive son
  estándar (sin licencia Premium). El flujo se ejecuta automáticamente.
- **Manual**: arrastrar el adjunto a la carpeta de OneDrive. Viable para
  119 firmas puntuales, pero no para un flujo continuo.

Si quieres, te describo el flujo de Power Automate paso a paso.

---

## Sobre la seguridad

- El listado de NIP **no viaja al navegador**: solo lo conoce el script.
- El endpoint es público (va en el JavaScript de la página). Cualquiera que
  lo encuentre puede enviar una firma con un NIP válido. Se puede añadir
  Turnstile o una palabra de paso.
- Todo el tráfico va por HTTPS.
- El correo y su adjunto quedan en tu buzón corporativo, bajo tu control y
  tus políticas de retención.
- La firma manuscrita digitalizada es un **dato biométrico**. La página
  incluye una cláusula informativa; conviene que la revise el responsable de
  protección de datos.
