# Automated Testing Guide

This guide explains how to use the automated test suite for the Stock Control App.

## 🎯 Overview

We have two types of automated tests:

1. **Unit Tests** (Vitest) - Test individual functions and components
2. **E2E Tests** (Playwright) - Test complete user workflows in a real browser

## 📦 Installation

First, install all dependencies:

```bash
npm install
```

Then install Playwright browsers:

```bash
npx playwright install
```

## 🧪 Running Tests

### Run All Tests
```bash
npm test
```

### Run Only Unit Tests
```bash
npm run test:unit
```

### Run Unit Tests in Watch Mode (for development)
```bash
npm run test:unit:watch
```

### Run Only E2E Tests
```bash
npm run test:e2e
```

### Run E2E Tests with Browser Visible
```bash
npm run test:e2e:headed
```

### Run E2E Tests with UI Mode (interactive)
```bash
npm run test:e2e:ui
```

### Generate Test Coverage Report
```bash
npm run test:coverage
```

## 📁 Test Structure

```
tests/
├── e2e/                    # End-to-end tests (Playwright)
│   ├── home.spec.js        # Home page tests
│   ├── navigation.spec.js  # Navigation tests
│   ├── reconcile.spec.js   # Reconcile page tests
│   └── README.md           # E2E test documentation
├── unit/                   # Unit tests (Vitest)
│   ├── parser.test.js      # CSV parser tests
│   └── api.test.js         # API tests
├── test-data/              # Test CSV files
│   ├── sample-counts.csv
│   └── sample-journal.csv
└── setup.js                # Test setup and mocks
```

## ✍️ Writing New Tests

### Unit Test Example

```javascript
// tests/unit/my-feature.test.js
import { describe, it, expect } from 'vitest';
import { myFunction } from '../../frontend/src/lib/my-feature.js';

describe('myFunction', () => {
  it('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });
});
```

### E2E Test Example

```javascript
// tests/e2e/my-page.spec.js
import { test, expect } from '@playwright/test';

test('should display my page', async ({ page }) => {
  await page.goto('/my-page');
  await expect(page.locator('h1')).toContainText('My Page');
});
```

## 🎬 Test Scenarios Covered

### Unit Tests
- ✅ CSV parsing (counts and journal)
- ✅ Delimiter detection
- ✅ Special character handling
- ✅ Empty data handling
- ✅ Column detection

### E2E Tests
- ✅ Home page display
- ✅ Navigation links
- ✅ Removed routes redirect
- ✅ File upload UI
- ✅ Reconcile page functionality
- ✅ CSV textarea removal verification

## 🐛 Debugging Tests

### Debug Unit Tests
```bash
npm run test:unit:watch
# Then add debugger; statements in your code
```

### Debug E2E Tests
```bash
# Run with debug flag
npx playwright test --debug

# Or pause in test
await page.pause();
```

### View Test Reports
```bash
# E2E HTML report
npx playwright show-report

# Coverage report (after running coverage)
open coverage/index.html
```

## 🚀 CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx playwright install --with-deps
      - run: npm test
```

## 📊 Test Coverage Goals

- **Unit Tests**: Aim for 80%+ coverage on critical functions
- **E2E Tests**: Cover all critical user paths
- **Priority**: Focus on Excel refresh, file upload, and data parsing

## 🔧 Troubleshooting

### Tests fail with "Cannot find module"
- Run `npm install` in root directory
- Check that all dependencies are installed

### Playwright tests timeout
- Ensure server is running: `npm start`
- Check that port 5173 is available
- Increase timeout in `playwright.config.js`

### Unit tests fail with React errors
- Ensure `@testing-library/react` is installed
- Check `tests/setup.js` is configured correctly

## 📝 Best Practices

1. **Write tests before fixing bugs** - Reproduce the bug in a test first
2. **Keep tests independent** - Each test should work in isolation
3. **Use descriptive test names** - "should do X when Y" format
4. **Test edge cases** - Empty data, invalid input, etc.
5. **Mock external dependencies** - Don't rely on real Excel files in unit tests
6. **Keep E2E tests fast** - Use specific selectors, avoid unnecessary waits

## 🎯 Next Steps

1. Add more E2E tests for:
   - Excel refresh workflow
   - File upload with actual files
   - Summary page display
   - Error handling scenarios

2. Add more unit tests for:
   - Date parsing
   - Company/warehouse extraction
   - Error handling in parsers

3. Set up CI/CD pipeline
4. Add visual regression testing
5. Add performance benchmarks

## 📚 Resources

- [Playwright Documentation](https://playwright.dev/)
- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)

