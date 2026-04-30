# prepare-python-embed.ps1
# Downloads and prepares embedded Python for packaging
# Run this script before `npm run build:win`

$ErrorActionPreference = "Stop"

$PYTHON_VERSION = "3.11.9"
$PYTHON_EMBED_URL = "https://www.python.org/ftp/python/$PYTHON_VERSION/python-$PYTHON_VERSION-embed-amd64.zip"
$EMBED_DIR = "resources\python-embed"
$TEMP_ZIP = "python-embed.zip"

Write-Host "=== Preparing Embedded Python $PYTHON_VERSION ===" -ForegroundColor Cyan

# Clean previous embed directory
if (Test-Path $EMBED_DIR) {
    Write-Host "Removing existing $EMBED_DIR..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $EMBED_DIR
}

# Create embed directory
New-Item -ItemType Directory -Path $EMBED_DIR -Force | Out-Null

# Download embedded Python
Write-Host "Downloading embedded Python from $PYTHON_EMBED_URL..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri $PYTHON_EMBED_URL -OutFile $TEMP_ZIP -UseBasicParsing
} catch {
    Write-Host "Failed to download Python. Please download manually from:" -ForegroundColor Red
    Write-Host "  $PYTHON_EMBED_URL" -ForegroundColor Red
    Write-Host "And extract to $EMBED_DIR" -ForegroundColor Red
    exit 1
}

# Extract
Write-Host "Extracting to $EMBED_DIR..." -ForegroundColor Yellow
Expand-Archive -Path $TEMP_ZIP -DestinationPath $EMBED_DIR -Force
Remove-Item $TEMP_ZIP

# Enable site-packages in python311._pth
# By default, embedded Python doesn't look for site-packages
$pthFile = Join-Path $EMBED_DIR "python311._pth"
if (Test-Path $pthFile) {
    Write-Host "Configuring python311._pth to enable site-packages..." -ForegroundColor Yellow
    $content = Get-Content $pthFile -Raw
    $content = $content -replace "#import site", "import site"
    Set-Content -Path $pthFile -Value $content
}

# Download get-pip.py and install pip
Write-Host "Installing pip..." -ForegroundColor Yellow
$getPipUrl = "https://bootstrap.pypa.io/get-pip.py"
$getPipPath = Join-Path $EMBED_DIR "get-pip.py"
try {
    Invoke-WebRequest -Uri $getPipUrl -OutFile $getPipPath -UseBasicParsing
    $pythonExe = Join-Path $EMBED_DIR "python.exe"
    & $pythonExe $getPipPath --no-warn-script-location
    Remove-Item $getPipPath
} catch {
    Write-Host "Warning: Failed to install pip. You may need to install dependencies manually." -ForegroundColor Yellow
}

# Install required packages
Write-Host "Installing Python dependencies..." -ForegroundColor Yellow
$pythonExe = Join-Path $EMBED_DIR "python.exe"
& $pythonExe -m pip install --no-warn-script-location --target (Join-Path $EMBED_DIR "Lib\site-packages") `
    "demoparser2>=0.41.0" `
    "fastapi>=0.100.0" `
    "uvicorn>=0.20.0" `
    "pandas>=2.0.0" `
    "pydantic>=2.0.0" `
    "starlette>=0.27.0" `
    "h11>=0.14.0"

# Update _pth file to include site-packages
$pthContent = @"
python311.zip
.
Lib\site-packages
import site
"@
Set-Content -Path $pthFile -Value $pthContent

Write-Host "=== Embedded Python prepared successfully! ===" -ForegroundColor Green
Write-Host "Location: $EMBED_DIR" -ForegroundColor Green
Write-Host ""
Write-Host "You can now run: npm run build:win" -ForegroundColor Cyan
