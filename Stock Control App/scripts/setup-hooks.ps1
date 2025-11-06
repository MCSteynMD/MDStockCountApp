# Setup Git hooks for automated testing (PowerShell version)
# This script sets up pre-commit hooks to run tests automatically

Write-Host "🔧 Setting up Git hooks for automated testing..." -ForegroundColor Cyan

# Check if husky is installed
$huskyInstalled = npm list husky 2>$null
if (-not $huskyInstalled) {
    Write-Host "📦 Installing husky..." -ForegroundColor Yellow
    npm install --save-dev husky
}

# Initialize husky
npx husky install

# Create pre-commit hook
if (-not (Test-Path .husky)) {
    New-Item -ItemType Directory -Path .husky | Out-Null
}

$preCommitContent = @'
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run unit tests before commit (fast)
npm run test:unit
'@

Set-Content -Path .husky/pre-commit -Value $preCommitContent

# Make executable (Unix-like systems)
if ($IsLinux -or $IsMacOS) {
    chmod +x .husky/pre-commit
}

Write-Host "✅ Git hooks setup complete!" -ForegroundColor Green
Write-Host "📝 Unit tests will now run automatically before each commit" -ForegroundColor Green
Write-Host "💡 To skip hooks, use: git commit --no-verify" -ForegroundColor Yellow

