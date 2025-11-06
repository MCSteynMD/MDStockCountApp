# Quick Start - Running Tests

## 🚀 First Time Setup

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers
npx playwright install
```

## ✅ Quick Test Run

```bash
# Run all tests
npm test

# Or run separately:
npm run test:unit      # Unit tests only
npm run test:e2e       # E2E tests only
```

## 📋 What Gets Tested

### Unit Tests (Fast - ~5 seconds)
- CSV parsing functions
- Data validation
- Edge cases

### E2E Tests (Slower - ~30 seconds)
- Page navigation
- UI elements visibility
- File upload UI
- Route redirects

## 🎯 Before Running E2E Tests

Make sure your app is running:
```bash
npm start
```

Or the tests will start it automatically (may take longer).

## 🐛 Troubleshooting

**"Cannot find module" errors:**
```bash
npm install
```

**Playwright browser not found:**
```bash
npx playwright install
```

**Port already in use:**
- Change port in `playwright.config.js` or stop other servers

## 📊 View Results

After running tests:
- Unit test results appear in terminal
- E2E test report: `npx playwright show-report`
- Coverage report: `npm run test:coverage` then open `coverage/index.html`

