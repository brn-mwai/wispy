$sourceDir = "C:\Users\Windows\Downloads\moltbot\src\agents"
$destDir = "C:\Users\Windows\Downloads\wispy\src\agents"

# Get all test files recursively
$testFiles = Get-ChildItem -Path $sourceDir -Filter "*.test.ts" -Recurse

$totalCopied = 0

foreach ($file in $testFiles) {
    # Get relative path from source dir
    $relativePath = $file.FullName.Substring($sourceDir.Length)
    $destPath = Join-Path $destDir $relativePath

    # Ensure destination directory exists
    $destFolder = Split-Path $destPath -Parent
    if (-not (Test-Path $destFolder)) {
        New-Item -ItemType Directory -Force -Path $destFolder | Out-Null
    }

    # Read the file content
    $content = Get-Content $file.FullName -Raw -Encoding UTF8

    # Apply transformations in order
    # 1. Replace moltbot -> wispy (lowercase)
    $content = $content -replace "moltbot", "wispy"
    # 2. Replace clawdbot -> wispy (lowercase)
    $content = $content -replace "clawdbot", "wispy"
    # 3. Replace Moltbot -> Wispy (capitalized)
    $content = $content -replace "Moltbot", "Wispy"
    # 4. Replace Clawdbot -> Wispy (capitalized)
    $content = $content -replace "Clawdbot", "Wispy"

    # 5-6. Update model references: claude- and gpt- to gemini-2.0-flash
    $content = $content -replace '"claude-[^"]*"', '"gemini-2.0-flash"'
    $content = $content -replace "'claude-[^']*'", "'gemini-2.0-flash'"
    $content = $content -replace '"gpt-[^"]*"', '"gemini-2.0-flash"'
    $content = $content -replace "'gpt-[^']*'", "'gemini-2.0-flash'"

    # 7. Update provider references: anthropic or openai to google
    $content = $content -replace 'provider:\s*"anthropic"', 'provider: "google"'
    $content = $content -replace "provider:\s*'anthropic'", "provider: 'google'"
    $content = $content -replace 'provider:\s*"openai"', 'provider: "google"'
    $content = $content -replace "provider:\s*'openai'", "provider: 'google'"

    # 8. Update DEFAULT_MODEL constant
    $content = $content -replace 'DEFAULT_MODEL\s*=\s*"[^"]*"', 'DEFAULT_MODEL = "gemini-2.0-flash"'
    $content = $content -replace "DEFAULT_MODEL\s*=\s*'[^']*'", "DEFAULT_MODEL = 'gemini-2.0-flash'"

    # 9. Update context window references to 1_000_000 (1M tokens)
    $content = $content -replace 'contextWindow:\s*\d+[\d_]*', 'contextWindow: 1_000_000'
    $content = $content -replace 'defaultTokens:\s*\d+[\d_]*', 'defaultTokens: 1_000_000'

    # Write the transformed content
    Set-Content -Path $destPath -Value $content -Encoding UTF8 -NoNewline

    $totalCopied++

    # Output progress every 50 files
    if ($totalCopied % 50 -eq 0) {
        Write-Host "Processed $totalCopied files..."
    }
}

Write-Host ""
Write-Host "========================================="
Write-Host "TOTAL FILES COPIED: $totalCopied"
Write-Host "========================================="

# List subdirectories that contain test files
Write-Host ""
Write-Host "Subdirectories with test files:"
$testFiles | ForEach-Object { Split-Path $_.DirectoryName -Leaf } | Sort-Object -Unique | ForEach-Object { Write-Host "  - $_" }
