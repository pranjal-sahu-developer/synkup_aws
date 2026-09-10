# Reports what is still needed before SynkUp can go live on AWS.
$ErrorActionPreference = "Continue"
$env:Path = "C:\Program Files\Amazon\AWSCLIV2;C:\Program Files\Docker\Docker\resources\bin;" + $env:Path

function Test-Key($path, $name) {
    if (-not (Test-Path $path)) { return $false }
    return (Get-Content $path | Where-Object { $_ -match "^$name=" }).Count -gt 0
}

Write-Host "SynkUp launch checklist"
Write-Host "======================="

$dockerCli = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCli) { Write-Host "[ok] Docker CLI" } else { Write-Host "[missing] Docker CLI — install Docker Desktop" }

$engine = $false
if ($dockerCli) {
    $job = Start-Job { $env:Path = "C:\Program Files\Docker\Docker\resources\bin;" + $env:Path; docker info --format "{{.ServerVersion}}" 2>$null }
    if (Wait-Job $job -Timeout 8) {
        $ver = Receive-Job $job
        if ($ver) { $engine = $true; Write-Host "[ok] Docker engine $ver" } else { Write-Host "[wait] Docker Desktop is installed but the engine is not ready. Open Docker Desktop and finish first-run setup." }
    } else {
        Stop-Job $job
        Write-Host "[wait] Docker Desktop is installed but the engine is not ready. Open Docker Desktop and finish first-run setup."
    }
    Remove-Job $job -Force -ErrorAction SilentlyContinue
}

$awsCli = Get-Command aws -ErrorAction SilentlyContinue
if ($awsCli) { Write-Host "[ok] AWS CLI" } else { Write-Host "[missing] AWS CLI" }

$awsId = $null
if ($awsCli) {
    $awsId = aws sts get-caller-identity --query Account --output text 2>$null
    if ($LASTEXITCODE -eq 0 -and $awsId) { Write-Host "[ok] AWS credentials (account $awsId)" }
    else { Write-Host "[missing] AWS credentials — create an IAM user, then run: aws configure" }
}

$backendOk = $true
foreach ($k in @("MONGO_URI", "JWT_SECRET_KEY", "STREAM_API_KEY", "STREAM_SECRET_KEY")) {
    if (Test-Key "backend\.env" $k) { Write-Host "[ok] backend/.env $k" } else { Write-Host "[missing] backend/.env $k"; $backendOk = $false }
}
if (Test-Key "frontend\.env" "VITE_STREAM_API_KEY") { Write-Host "[ok] frontend/.env VITE_STREAM_API_KEY" }
else { Write-Host "[missing] frontend/.env VITE_STREAM_API_KEY" }

Write-Host ""
if ($engine -and $awsId -and $backendOk) {
    Write-Host "Ready. From the repo root run:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File infra/bootstrap.ps1"
} else {
    Write-Host "Fix the [missing]/[wait] items, then re-run this script."
}
