# Automated Testing Setup Guide

This guide explains how to set up and use the fully automated testing system.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
npx playwright install
```

### 2. Run All Tests
```bash
npm test
```

This will:
- ✅ Run unit tests
- ✅ Start server (if needed)
- ✅ Run E2E tests
- ✅ Generate coverage report
- ✅ Provide detailed summary

## 📋 Available Test Commands

### Main Commands
- `npm test` - Run complete test suite (unit + E2E)
- `npm run test:quick` - Run only unit tests (fast, ~1 second)
- `npm run test:ci` - Run tests in CI mode (no server auto-start)

### Unit Tests
- `npm run test:unit` - Run unit tests once
- `npm run test:unit:watch` - Run unit tests in watch mode
- `npm run test:coverage` - Generate coverage report

### E2E Tests
- `npm run test:e2e` - Run E2E tests
- `npm run test:e2e:headed` - Run with browser visible
- `npm run test:e2e:ui` - Run with Playwright UI mode

## 🔧 Setup Git Hooks (Optional)

Automatically run tests before each commit:

### Windows (PowerShell)
```powershell
.\scripts\setup-hooks.ps1
```

### Linux/Mac
```bash
chmod +x scripts/setup-hooks.sh
./scripts/setup-hooks.sh
```

After setup, unit tests will run automatically before each commit. If tests fail, the commit will be blocked.

To skip hooks: `git commit --no-verify`

## 🤖 CI/CD Integration

### GitHub Actions

The repository includes a GitHub Actions workflow (`.github/workflows/tests.yml`) that:

1. **Runs on every push** to master/main/develop
2. **Runs on pull requests**
3. **Can be triggered manually**

The workflow:
- ✅ Runs unit tests
- ✅ Generates coverage reports
- ✅ Runs E2E tests
- ✅ Uploads test artifacts
- ✅ Provides test summaries

### Local CI Simulation

To simulate CI environment locally:
```bash
npm run test:ci
```

## 📊 Test Coverage

### Current Coverage
- **Unit Tests**: Parser functions, edge cases, performance
- **E2E Tests**: Navigation, UI elements, error handling

### View Coverage Report
```bash
npm run test:coverage
# Then open: coverage/index.html
```

## 🎯 Test Structure

```
tests/
├── unit/                    # Unit tests (Vitest)
│   ├── parser.test.js       # Basic parser tests
│   └── parser-extended.test.js  # Extended edge cases
├── e2e/                     # E2E tests (Playwright)
│   ├── home.spec.js         # Home page
│   ├── navigation.spec.js   # Navigation
│   ├── reconcile.spec.js    # Reconcile page
│   ├── summary.spec.js      # Summary page
│   └── error-handling.spec.js  # Error scenarios
└── test-data/               # Test CSV files
```

## 🔍 What Gets Tested

### Unit Tests
- ✅ CSV parsing (valid, empty, malformed)
- ✅ Delimiter detection (comma, tab, semicolon)
- ✅ Special characters handling
- ✅ Unicode support
- ✅ Large file performance
- ✅ Edge cases (missing values, whitespace, etc.)

### E2E Tests
- ✅ Page navigation
- ✅ UI element visibility
- ✅ File upload functionality
- ✅ Error handling
- ✅ Route redirects
- ✅ CSV textarea removal verification

## 🐛 Troubleshooting

### Tests Fail with "Cannot find module"
```bash
npm install
```

### Playwright browsers not found
```bash
npx playwright install
```

### Server won't start for E2E tests
- Check if port 5173 is available
- Stop other instances of the app
- Check firewall settings

### Git hooks not working
```bash
# Re-run setup
.\scripts\setup-hooks.ps1  # Windows
./scripts/setup-hooks.sh   # Linux/Mac
```

## 📈 Continuous Improvement

### Adding New Tests

1. **Unit Test**: Add to `tests/unit/`
2. **E2E Test**: Add to `tests/e2e/`
3. **Run**: `npm test` to verify

### Test Best Practices

1. **Write tests first** (TDD) when fixing bugs
2. **Keep tests independent** - each test should work alone
3. **Use descriptive names** - "should do X when Y"
4. **Test edge cases** - empty data, invalid input, etc.
5. **Keep E2E tests fast** - use specific selectors

## 🎉 Benefits

- ✅ **Catch bugs early** - Before users see them
- ✅ **Confidence in changes** - Know if you broke something
- ✅ **Documentation** - Tests show how code should work
- ✅ **Refactoring safety** - Change code with confidence
- ✅ **CI/CD ready** - Automatic testing on every push

## 📚 Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

## 🆘 Need Help?

- Check test output for specific error messages
- Review test files for examples
- Check GitHub Actions logs for CI failures
- Run tests individually to isolate issues

