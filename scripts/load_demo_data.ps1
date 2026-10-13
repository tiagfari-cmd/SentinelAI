param(
    [string]$ApiBaseUrl = "http://127.0.0.1:8001"
)

$ErrorActionPreference = "Stop"
$baseUrl = $ApiBaseUrl.TrimEnd("/")
$headers = @{}
if ($env:SENTINELAI_API_TOKEN) {
    $headers["Authorization"] = "Bearer $env:SENTINELAI_API_TOKEN"
}

Invoke-RestMethod -Method Get -Uri "$baseUrl/health" | Out-Null
$existingEvents = Invoke-RestMethod -Method Get -Uri "$baseUrl/events" -Headers $headers
if ($existingEvents -and @($existingEvents).Count -gt 0) {
    throw "A base de dados já contém eventos. O script não altera dados existentes."
}

$samplePath = Join-Path $PSScriptRoot "..\data\sample_logs.json"
$sampleEvents = Get-Content -Raw -LiteralPath $samplePath | ConvertFrom-Json
$postedCount = 0

foreach ($event in $sampleEvents) {
    try {
        [DateTimeOffset]::Parse([string]$event.timestamp) | Out-Null
    }
    catch {
        Write-Host "A ignorar evento de exemplo com timestamp inválido."
        continue
    }

    $body = $event | ConvertTo-Json -Depth 5 -Compress
    Invoke-RestMethod `
        -Method Post `
        -Uri "$baseUrl/events" `
        -ContentType "application/json" `
        -Headers $headers `
        -Body $body | Out-Null
    $postedCount++
}

Write-Host "Foram carregados $postedCount eventos fictícios em $baseUrl."
