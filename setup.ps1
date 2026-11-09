# video-kit setup (Windows). Safe to run again: each step skips what is already in place.
#
#   powershell -ExecutionPolicy Bypass -File setup.ps1 -Check
#       read-only: what is installed, what is missing, GPU, disk. Changes nothing.
#   powershell -ExecutionPolicy Bypass -File setup.ps1 -Voice synthetic -Music generate
#       -Voice synthetic   Kokoro voices only (works right away)
#       -Voice clone       also Qwen3-TTS, to narrate with your own voice (needs a few recorded samples;
#                          ~4.5 GB of weights on the first narration)
#       -Music generate    ACE-Step soundtrack generation (~10 GB of weights on first use)
#       -Music files       bring your own tracks (user/music/)
#
# Windows 10/11 only. Needs: Python 3.12 (found with the py launcher, or pass -Python), Node.js 20+, uv, git.
# An NVIDIA GPU for music generation; voice cloning runs without one, slowly.
param(
    [string]$Python = "",
    [ValidateSet("synthetic", "clone")][string]$Voice = "synthetic",
    [ValidateSet("generate", "files")][string]$Music = "generate",
    [switch]$Check
)
$ErrorActionPreference = "Stop"
$Kit = $PSScriptRoot
if (-not $Python) {
    # python.org installs to %LOCALAPPDATA%\Programs\Python\Python312; the py launcher knows where it is.
    $Python = "C:\Python312\python.exe"
    if (Get-Command py -ErrorAction SilentlyContinue) {
        $found = & py -3.12 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $found) { $Python = "$found".Trim() }
    }
}
$env:UV_CACHE_DIR = "$Kit\.uv-cache"
# AVG (and similar) set SSLKEYLOGFILE to a device path that crashes standalone Pythons.
Remove-Item Env:SSLKEYLOGFILE -ErrorAction SilentlyContinue

# Pinned versions (update deliberately, then note it in CHANGELOG.md)
$AceCommit = "ca1e85fe9430179831e6bc6be790c332190a3866"   # ace-step/ACE-Step-1.5, 2026-08-29
$Fonts = @{
    "Inter.ttf"         = "ofl/inter/Inter%5Bopsz,wght%5D.ttf"
    "Montserrat.ttf"    = "ofl/montserrat/Montserrat%5Bwght%5D.ttf"
    "JetBrainsMono.ttf" = "ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf"
}

# Native tools write progress to stderr; with "Stop", Windows PowerShell 5.1 would treat that as an error.
function Native([scriptblock]$cmd) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    try { & $cmd 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $prev }
    if ($LASTEXITCODE) { throw "command failed ($LASTEXITCODE): $cmd" }
}
function NodeMajor { if (Have node) { [int]((node --version) -replace '^v(\d+).*', '$1') } else { 0 } }
function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Mark($ok, $what, $hint = "") {
    if ($ok) { Write-Host "  [ok]      $what" -ForegroundColor Green } else { Write-Host "  [missing] $what  $hint" -ForegroundColor Yellow }
}

if ($Check) {
    Step "video-kit check (read-only)"
    Mark (Test-Path $Python) "Python 3.12 at $Python" "-> python.org, or pass -Python"
    Mark ((NodeMajor) -ge 20) "Node.js 20+" "-> nodejs.org (LTS)"
    Mark (Have uv) "uv" "-> docs.astral.sh/uv"
    Mark (Have git) "git" "-> git-scm.com"
    $gpu = if (Have nvidia-smi) { (nvidia-smi "--query-gpu=name,memory.total" "--format=csv,noheader") -join "; " } else { "" }
    Mark ([bool]$gpu) "NVIDIA GPU $gpu" "-> without one, only synthetic voice and file music are practical"
    Mark (Test-Path "$Kit\tools\ffmpeg\bin\ffmpeg.exe") "ffmpeg"
    Mark ((Test-Path "$Kit\remotion\node_modules\remotion") -and (Test-Path "$Kit\remotion\node_modules\@remotion\three")) "Remotion (with 3D)" "-> run setup again (npm install)"
    Mark (@($Fonts.Keys | Where-Object { -not (Test-Path "$Kit\tools\fonts\$_") }).Count -eq 0) "fonts (tools/fonts)"
    Mark (Test-Path "$Kit\tools\playwright") "browser for vk capture (Playwright Chromium)"
    Mark (Test-Path "$Kit\py\main\.venv") "main Python env (Kokoro, Whisper, Manim)"
    Mark (Test-Path "$Kit\py\qwen\.venv") "voice cloning env (Qwen3-TTS)  [only for -Voice clone]"
    if (Test-Path "$Kit\py\chatterbox\.venv") {
        Write-Host "  [note]    py\chatterbox is no longer used (replaced by Qwen3-TTS in 0.5); you can delete it" -ForegroundColor DarkGray
    }
    Mark (Test-Path "$Kit\tools\ACE-Step-1.5\.venv") "music generation (ACE-Step)  [only for -Music generate]"
    Mark (Test-Path "$Kit\user\profile.json") "your profile (user/profile.json)"
    $free = [math]::Round((Get-PSDrive ($Kit.Substring(0, 1))).Free / 1GB)
    Mark ($free -gt 40) "free disk: $free GB" "-> a full install with models needs about 40 GB"
    exit 0
}

Step "Checking prerequisites"
if (-not (Test-Path $Python)) { throw "Python 3.12 not found at $Python (install from python.org or pass -Python)" }
foreach ($c in "node", "uv", "git") { if (-not (Have $c)) { throw "$c not found. Run setup.ps1 -Check for links." } }
if ((NodeMajor) -lt 20) { throw "Node.js 20 or newer is needed (found $(node --version))" }
& $Python --version; node --version; uv --version

Step "Your profile (user/)"
if (-not (Test-Path "$Kit\user\profile.json")) {
    New-Item -ItemType Directory -Force "$Kit\user\voices", "$Kit\user\music", "$Kit\user\brand" | Out-Null
    $p = Get-Content "$Kit\user.example\profile.json" -Raw | ConvertFrom-Json
    $p.music = $Music
    if ($Voice -eq "clone") { $p.voice = [pscustomobject]@{ engine = "qwen"; tone = "narracao" } }
    # UTF-8 without a BOM (Windows PowerShell 5.1's -Encoding utf8 would add one)
    [IO.File]::WriteAllText("$Kit\user\profile.json", ($p | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding $false))
    Copy-Item "$Kit\user.example\voices\tones.json" "$Kit\user\voices\tones.json"
    "created user/profile.json (edit name, brand and voice there)"
} else { "user/profile.json already exists, left as is" }

Step "ffmpeg (BtbN build from GitHub)"
if (-not (Test-Path "$Kit\tools\ffmpeg\bin\ffmpeg.exe")) {
    New-Item -ItemType Directory -Force "$Kit\tools" | Out-Null
    $zip = "$Kit\tools\ffmpeg.zip"
    curl.exe -L --fail -sS -o $zip "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
    Expand-Archive $zip -DestinationPath "$Kit\tools\_ff" -Force
    Move-Item (Get-ChildItem "$Kit\tools\_ff" -Directory | Select-Object -First 1).FullName "$Kit\tools\ffmpeg"
    Remove-Item "$Kit\tools\_ff", $zip -Recurse -Force
} else { "already installed" }

Step "Fonts (Google Fonts, OFL)"
New-Item -ItemType Directory -Force "$Kit\tools\fonts" | Out-Null
foreach ($f in $Fonts.Keys) {
    if (-not (Test-Path "$Kit\tools\fonts\$f")) { curl.exe -sSL --fail -o "$Kit\tools\fonts\$f" "https://github.com/google/fonts/raw/main/$($Fonts[$f])" }
}

Step "Remotion (npm)"
Push-Location "$Kit\remotion"; npm install --no-fund --no-audit; Pop-Location

Step "Python: synthetic voice (Kokoro), captions (Whisper), diagrams (Manim), QA"
Push-Location "$Kit\py\main"; uv sync --system-certs --python $Python; Pop-Location

Step "Browser for vk capture (Playwright Chromium, into tools/playwright)"
if (-not (Test-Path "$Kit\tools\playwright")) {
    $env:PLAYWRIGHT_BROWSERS_PATH = "$Kit\tools\playwright"
    Native { & "$Kit\py\main\.venv\Scripts\python.exe" -m playwright install chromium }
} else { "already installed" }

if ($Voice -eq "clone") {
    Step "Python: voice cloning (Qwen3-TTS)"
    Push-Location "$Kit\py\qwen"; uv sync --system-certs --python $Python; Pop-Location
    & "$Kit\py\qwen\.venv\Scripts\python.exe" -c "import torch, qwen_tts; print('voice cloning env ok, cuda =', torch.cuda.is_available())"
    "Next: record your samples (docs/voice.md), then vk voice-setup. Weights (~4.5 GB) download on the first narration."
}

if ($Music -eq "generate") {
    Step "Music: ACE-Step 1.5 at $($AceCommit.Substring(0,7))"
    $ace = "$Kit\tools\ACE-Step-1.5"
    if (-not (Test-Path "$ace\.git")) { Native { git clone https://github.com/ace-step/ACE-Step-1.5.git $ace } }
    Native { git -C $ace fetch --depth 1 origin $AceCommit }
    Native { git -C $ace checkout --quiet $AceCommit }
    Push-Location $ace
    if (-not (Test-Path ".venv")) { uv venv --python $Python }
    uv sync --system-certs --python $Python
    Pop-Location
    "Model weights download on the first music generation (~10 GB into tools/ACE-Step-1.5/checkpoints)."
}

Step "Smoke test"
& "$Kit\py\main\.venv\Scripts\python.exe" -c "import torch, kokoro, whisper, manim; print('main env ok, cuda =', torch.cuda.is_available())"
Write-Host "`nDone. Try it: .\vk build example --preview   (then .\vk sheet example --preview)" -ForegroundColor Green
if ($Music -ne "generate") { Write-Host "Without music generation the examples render without a soundtrack (put your own in user/music/)." }
