# Configurar el acceso a OneDrive (Entra ID + Cloudflare)

Esta guía cubre lo que no se puede hacer desde GitHub: dar permiso al Worker
para escribir en tu OneDrive. Son 15 minutos, pero una parte necesita a un
administrador.

---

## Antes de empezar: dos conceptos

**Tenant ID** (o "identificador de inquilino") es el DNI de la instalación de
Microsoft 365 del Ayuntamiento. No es secreto. En tu caso ya está averiguado:

```
0e89bb39-2f74-470b-886d-a2d2375152e4
```

Se puede comprobar en `https://login.microsoftonline.com/aytosagunto.es/v2.0/.well-known/openid-configuration`
o en Entra ID › Información general › "Id. de inquilino".

**Consentimiento de administrador** es el permiso que solo un administrador de
Entra ID puede dar cuando una aplicación pide acceso a datos de la
organización. El permiso que necesitamos (`Files.ReadWrite.All` de aplicación)
**siempre** lo requiere: no hay forma de evitarlo escribiendo en un OneDrive
corporativo sin que un usuario inicie sesión.

---

## Paso 1 · Crear la aplicación

1. Entra en <https://entra.microsoft.com> con tu cuenta
   `paupuga@aytosagunto.es`.
2. Menú lateral: **Aplicaciones › Registros de aplicaciones › Nuevo registro**.
   (Si no lo ves, no eres administrador: pasa al Paso 5.)
3. Rellena:
   - **Nombre**: `Firma credenciales`
   - **Tipos de cuenta admitidos**: *Solo las cuentas de este directorio
     organizativo (inquilino único)*
   - **URI de redirección**: déjalo vacío.
4. **Registrar**.
5. En la pantalla de resumen, copia:
   - **Id. de aplicación (cliente)** → será `CLIENT_ID`.

## Paso 2 · Añadir el permiso

1. Dentro de la aplicación: **Permisos de API › Agregar un permiso**.
2. **Microsoft Graph › Permisos de aplicación** (¡de aplicación, no
   delegados!).
3. Busca `Files.ReadWrite.All`, marca la casilla y **Agregar permisos**.
4. Pulsa **Conceder consentimiento de administrador para <Ayuntamiento>** y
   acepta. Debe quedar en verde: *Concedido para Ayuntamiento de Sagunto*.

> Si el botón no aparece o da error, no tienes rol de administrador. Ve al
> Paso 5.

## Paso 3 · Crear el secreto

1. **Certificados y secretos › Secretos de cliente › Nuevo secreto de cliente**.
2. Descripción: `worker-firmas`. Caducidad: **24 meses** (o lo que permita tu
   política; anótalo en el calendario).
3. **Agregar** y copia **inmediatamente** el campo *Valor* (no el *Id. de
   secreto*). Ese valor será `CLIENT_SECRET` y **no se vuelve a mostrar**.

## Paso 4 · Comprobar que funciona

Sustituye los tres valores y ejecuta en PowerShell:

```powershell
$tenant = "0e89bb39-2f74-470b-886d-a2d2375152e4"
$client = "TU_CLIENT_ID"
$secret = "TU_CLIENT_SECRET"
$upn    = "paupuga@aytosagunto.es"

$token = (Invoke-RestMethod -Method Post `
  -Uri "https://login.microsoftonline.com/$tenant/oauth2/v2.0/token" `
  -Body @{
    client_id     = $client
    client_secret = $secret
    scope         = "https://graph.microsoft.com/.default"
    grant_type    = "client_credentials"
  }).access_token

Invoke-RestMethod -Headers @{ Authorization = "Bearer $token" } `
  -Uri "https://graph.microsoft.com/v1.0/users/$upn/drive/root`:/CREDENCIALES"
```

Debe devolver el objeto de la carpeta `CREDENCIALES`. Si responde
`Error 403 accessDenied`, falta el consentimiento del Paso 2. Si responde
`404 itemNotFound`, la ruta no existe todavía (se crearía sola al subir el
primer archivo, o créala a mano).

## Paso 5 · Si no eres administrador

Envía esto a quien gestione Microsoft 365 en el Ayuntamiento:

> Necesitamos una aplicación en Entra ID para guardar firmas de credenciales en
> la carpeta `CREDENCIALES/FIRMAS` del OneDrive de `paupuga@aytosagunto.es`,
> desde un servicio externo (Cloudflare Worker).
>
> - Registro de aplicación de inquilino único, sin URI de redirección
>   (flujo `client_credentials`).
> - Permiso **de aplicación** `Microsoft Graph › Files.ReadWrite.All` con
>   consentimiento de administrador concedido.
> - Necesitamos el **Id. de aplicación** y el **valor de un secreto**.
>
> Alternativa más restrictiva: conceder `Sites.Selected` y autorizar solo la
> biblioteca de documentos correspondiente (requiere un paso extra con
> PowerShell, `Grant-PnPAzureADAppSitePermission`).

Si IT lo deniega, la alternativa es un flujo de **Power Automate** con
desencadenador HTTP, que usa permisos del propio conector de SharePoint. El
Worker ya está separado del resto, así que solo habría que cambiar la función
`subirArchivo`.

---

## Paso 6 · Desplegar el Worker

1. <https://dash.cloudflare.com> › **Workers & Pages** › **Create application**
   › **Create Worker** › nombre `firmacredenciales` › **Deploy**.
2. **Edit code**, borra el contenido y pega `worker/src/index.js`. **Deploy**.
3. **Settings › Variables and Secrets**, añade:

| Nombre | Valor | Tipo |
|---|---|---|
| `UPN` | `paupuga@aytosagunto.es` | Texto |
| `CARPETA` | `CREDENCIALES/FIRMAS` | Texto |
| `TENANT_ID` | `0e89bb39-2f74-470b-886d-a2d2375152e4` | Texto |
| `ALLOWED_ORIGIN` | `https://pauplsua.github.io` | Texto |
| `SIMULADO` | `true` | Texto |
| `CLIENT_ID` | *(Paso 1)* | Secreto |
| `CLIENT_SECRET` | *(Paso 3)* | Secreto |
| `NIPS` | *(lista separada por comas)* | Secreto |

La lista de NIP actual está en `worker/nips.local.txt`. Cópiala de ahí al
campo `NIPS`. Ese archivo no se sube a GitHub.

4. Vuelve a **Deploy** para aplicar los cambios.
5. Abre `https://<tu-worker>.workers.dev/api/salud`. Debe mostrar
   `{"ok":true,"simulado":true,"nipsCargados":119,...}`.
6. Prueba la web con `SIMULADO=true`. Cuando todo funcione, cambia
   `SIMULADO` a `false` y guarda. A partir de ahí los archivos se escriben de
   verdad.

> Cloudflare renueva certificados y despliegues solo; no hay mantenimiento
> salvo renovar el `CLIENT_SECRET` cada dos años.

---

## Problemas frecuentes

| Síntoma | Causa habitual | Solución |
|---|---|---|
| La web dice "No se ha podido guardar" y la consola muestra CORS | `ALLOWED_ORIGIN` no coincide exactamente con el dominio | Debe ser `https://pauplsua.github.io`, sin barra final |
| `/api/salud` responde 404 | El Worker no está desplegado o la ruta cambió | Revisa la URL en `assets/app.js` |
| `Token 400 invalid_client` | `CLIENT_SECRET` caducado o mal copiado | Genera un secreto nuevo |
| `Graph (subida) 403 accessDenied` | Falta consentimiento de administrador | Paso 2 |
| `Graph (subida) 404 itemNotFound` | `UPN` incorrecto o el usuario no tiene OneDrive | Comprueba en Graph Explorer `/users/<upn>/drive` |
| El archivo no aparece | `SIMULADO` sigue en `true` | Cámbialo y redespliega |
| "El número de agente no figura en el listado" | `NIPS` desactualizado | Actualiza el secreto |
