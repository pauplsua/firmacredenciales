# Servidor estático mínimo para previsualizar la web sin instalar nada.
# Uso:  powershell -ExecutionPolicy Bypass -File herramientas\servir-local.ps1
# Luego abrir http://localhost:8765/

param(
  [int]$Puerto = 8765
)

$raiz = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$tipos = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".json" = "application/json; charset=utf-8"
  ".txt"  = "text/plain; charset=utf-8"
  ".md"   = "text/plain; charset=utf-8"
  ".jpg"  = "image/jpeg"
  ".png"  = "image/png"
  ".ico"  = "image/x-icon"
}

$escucha = New-Object System.Net.HttpListener
$escucha.Prefixes.Add("http://localhost:$Puerto/")
$escucha.Start()
Write-Host "Sirviendo $raiz en http://localhost:$Puerto/ (Ctrl+C para parar)" -ForegroundColor Cyan

try {
  while ($escucha.IsListening) {
    $contexto = $escucha.GetContext()
    $ruta = [System.Uri]::UnescapeDataString($contexto.Request.Url.AbsolutePath)
    if ([string]::IsNullOrWhiteSpace($ruta) -or $ruta -eq "/") { $ruta = "/index.html" }

    $archivo = Join-Path $raiz ($ruta.TrimStart("/") -replace "/", "\")
    $completo = [System.IO.Path]::GetFullPath($archivo)

    if (-not $completo.StartsWith([System.IO.Path]::GetFullPath($raiz))) {
      $contexto.Response.StatusCode = 403
      $contexto.Response.Close()
      continue
    }

    if (Test-Path $completo -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($completo)
      $ext = [System.IO.Path]::GetExtension($completo).ToLower()
      $contexto.Response.ContentType = if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { "application/octet-stream" }
      $contexto.Response.Headers.Add("Cache-Control", "no-store")
      $contexto.Response.ContentLength64 = $bytes.Length
      $contexto.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    }
    else {
      $contexto.Response.StatusCode = 404
      $texto = [System.Text.Encoding]::UTF8.GetBytes("404 - No encontrado: $ruta")
      $contexto.Response.ContentType = "text/plain; charset=utf-8"
      $contexto.Response.OutputStream.Write($texto, 0, $texto.Length)
    }

    $contexto.Response.Close()
  }
}
finally {
  $escucha.Stop()
  $escucha.Close()
}
