#!/bin/bash

# Setup Git hooks for automated testing
# This script sets up pre-commit hooks to run tests automatically

echo "🔧 Setting up Git hooks for automated testing..."

# Check if husky is installed
if ! command -v husky &> /dev/null; then
  echo "📦 Installing husky..."
  npm install --save-dev husky
fi

# Initialize husky
npx husky install

# Create pre-commit hook
mkdir -p .husky
cat > .husky/pre-commit << 'EOF'
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run unit tests before commit (fast)
npm run test:unit
EOF

chmod +x .husky/pre-commit

echo "✅ Git hooks setup complete!"
echo "📝 Unit tests will now run automatically before each commit"
echo "💡 To skip hooks, use: git commit --no-verify"

