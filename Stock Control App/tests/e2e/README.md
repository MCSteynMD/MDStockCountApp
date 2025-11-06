# E2E Tests with Playwright

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

## Running Tests

### Run all E2E tests:
```bash
npm run test:e2e
```

### Run tests in headed mode (see browser):
```bash
npm run test:e2e:headed
```

### Run specific test file:
```bash
npx playwright test tests/e2e/home.spec.js
```

### Run tests in specific browser:
```bash
npx playwright test --project=chromium
```

## Test Structure

- `home.spec.js` - Home page functionality
- `navigation.spec.js` - Navigation and routing
- `reconcile.spec.js` - Reconcile page functionality
- `summary.spec.js` - Summary page functionality (to be added)

## Writing New Tests

```javascript
import { test, expect } from '@playwright/test';

test('my test', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Stock Control');
});
```

## Debugging

- Use `await page.pause()` to pause execution
- Run with `--debug` flag: `npx playwright test --debug`
- View test report: `npx playwright show-report`

