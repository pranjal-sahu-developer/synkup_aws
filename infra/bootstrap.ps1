# First-time AWS deploy: ECR + App Runner (one container: API + frontend).
# Prerequisites: Docker Desktop running, AWS CLI configured (`aws configure`).
#
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File infra/bootstrap.ps1

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
Set-Location (Split-Path -Parent $PSScriptRoot)

function Assert-Command($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "$name is not installed or not on PATH."
    }
}

function Read-DotEnv($path) {
    $map = @{}
    if (-not (Test-Path $path)) { return $map }
    Get-Content $path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
        $parts = $line.Split("=", 2)
        $map[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
    }
    return $map
}

Assert-Command aws
Assert-Command docker

$region = if ($env:AWS_REGION) { $env:AWS_REGION } else { "ap-south-1" }
$repo = if ($env:ECR_REPOSITORY) { $env:ECR_REPOSITORY } else { "synkup" }
$appName = if ($env:APP_NAME) { $env:APP_NAME } else { "synkup" }
$roleName = "AppRunnerECRAccessRole"

$backendEnv = Read-DotEnv "backend\.env"
$frontendEnv = Read-DotEnv "frontend\.env"

$required = @("MONGO_URI", "JWT_SECRET_KEY", "STREAM_API_KEY", "STREAM_SECRET_KEY")
foreach ($key in $required) {
    if (-not $backendEnv[$key]) {
        throw "backend\.env is missing $key"
    }
}

$streamPublicKey = $frontendEnv["VITE_STREAM_API_KEY"]
if (-not $streamPublicKey) { $streamPublicKey = $backendEnv["STREAM_API_KEY"] }

Write-Host "Using region $region"
$identity = aws sts get-caller-identity --output json | ConvertFrom-Json
$account = $identity.Account
$imageUri = "$account.dkr.ecr.$region.amazonaws.com/$repo"

Write-Host "Ensuring ECR repository $repo..."
aws ecr describe-repositories --repository-names $repo --region $region 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    aws ecr create-repository --repository-name $repo --region $region --image-scanning-configuration scanOnPush=true | Out-Null
}

Write-Host "Ensuring IAM role $roleName..."
aws iam get-role --role-name $roleName 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    aws iam create-role `
        --role-name $roleName `
        --assume-role-policy-document file://infra/apprunner-ecr-trust.json | Out-Null
    aws iam attach-role-policy `
        --role-name $roleName `
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess | Out-Null
    Write-Host "Waiting 10s for IAM role to propagate..."
    Start-Sleep -Seconds 10
}
$roleArn = (aws iam get-role --role-name $roleName --query Role.Arn --output text)

Write-Host "Logging into ECR..."
$password = aws ecr get-login-password --region $region
$password | docker login --username AWS --password-stdin "$account.dkr.ecr.$region.amazonaws.com"
if ($LASTEXITCODE -ne 0) { throw "Docker login to ECR failed. Is Docker Desktop running?" }

Write-Host "Building image..."
docker build `
    --build-arg VITE_API_URL=/api `
    --build-arg "VITE_STREAM_API_KEY=$streamPublicKey" `
    -t "${repo}:latest" `
    -t "${imageUri}:latest" `
    .
if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

Write-Host "Pushing ${imageUri}:latest..."
docker push "${imageUri}:latest"
if ($LASTEXITCODE -ne 0) { throw "docker push failed" }

$runtimeEnv = @{
    NODE_ENV          = "production"
    PORT              = "5001"
    MONGO_URI         = $backendEnv["MONGO_URI"]
    JWT_SECRET_KEY    = $backendEnv["JWT_SECRET_KEY"]
    STREAM_API_KEY    = $backendEnv["STREAM_API_KEY"]
    STREAM_SECRET_KEY = $backendEnv["STREAM_SECRET_KEY"]
}

$createPayload = @{
    ServiceName         = $appName
    SourceConfiguration = @{
        AuthenticationConfiguration = @{ AccessRoleArn = $roleArn }
        AutoDeploymentsEnabled      = $true
        ImageRepository             = @{
            ImageIdentifier      = "${imageUri}:latest"
            ImageRepositoryType  = "ECR"
            ImageConfiguration   = @{
                Port                          = "5001"
                RuntimeEnvironmentVariables   = $runtimeEnv
            }
        }
    }
    InstanceConfiguration     = @{ Cpu = "0.25 vCPU"; Memory = "0.5 GB" }
    HealthCheckConfiguration  = @{
        Protocol           = "HTTP"
        Path               = "/api/health"
        Interval           = 10
        Timeout            = 5
        HealthyThreshold   = 1
        UnhealthyThreshold = 5
    }
}

$existingArn = aws apprunner list-services --region $region --query "ServiceSummaryList[?ServiceName=='$appName'].ServiceArn | [0]" --output text
if (-not $existingArn -or $existingArn -eq "None") {
    Write-Host "Creating App Runner service $appName (this takes a few minutes)..."
    $tmp = Join-Path $env:TEMP "synkup-apprunner.json"
    $createPayload | ConvertTo-Json -Depth 12 -Compress | Set-Content -Path $tmp -Encoding utf8NoBOM
    $created = aws apprunner create-service --cli-input-json "file://$tmp" --region $region | ConvertFrom-Json
    $serviceArn = $created.Service.ServiceArn
} else {
    Write-Host "Service exists; starting a new deployment..."
    $serviceArn = $existingArn
    aws apprunner start-deployment --service-arn $serviceArn --region $region | Out-Null
}

Write-Host "Waiting for App Runner to become RUNNING..."
$serviceUrl = $null
for ($i = 0; $i -lt 60; $i++) {
    $svc = aws apprunner describe-service --service-arn $serviceArn --region $region | ConvertFrom-Json
    $status = $svc.Service.Status
    $serviceUrl = $svc.Service.ServiceUrl
    Write-Host "  status=$status"
    if ($status -eq "RUNNING") { break }
    if ($status -eq "CREATE_FAILED" -or $status -eq "DELETED") {
        throw "App Runner ended in $status"
    }
    Start-Sleep -Seconds 15
}

if ($serviceUrl) {
    $origin = "https://$serviceUrl"
    Write-Host ""
    Write-Host "Live URL: $origin"
    Write-Host "Health:   $origin/api/health"
    Write-Host ""
    Write-Host "Save this App Runner ARN for GitHub Actions secret APP_RUNNER_SERVICE_ARN:"
    Write-Host "  $serviceArn"
}
