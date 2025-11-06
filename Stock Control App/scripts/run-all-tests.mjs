#!/usr/bin/env node

/**
 * Comprehensive Test Runner
 * Runs all tests in sequence with proper error handling and reporting
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    log(`\n${'='.repeat(60)}`, 'cyan');
    log(`Running: ${command} ${args.join(' ')}`, 'bright');
    log('='.repeat(60), 'cyan');

    const proc = spawn(command, args, {
      ...options,
      shell: true,
      stdio: 'inherit',
      cwd: rootDir,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

async function checkServerRunning() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:5173', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(maxAttempts = 30) {
  log('\n⏳ Checking if server is running...', 'yellow');
  
  for (let i = 0; i < maxAttempts; i++) {
    if (await checkServerRunning()) {
      log('✅ Server is running!', 'green');
      return true;
    }
    process.stdout.write(`Waiting for server... (${i + 1}/${maxAttempts})\r`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  log('\n❌ Server is not running. Starting server...', 'yellow');
  return false;
}

async function startServer() {
  log('\n🚀 Starting development server...', 'blue');
  
  const server = spawn('npm', ['start'], {
    shell: true,
    stdio: 'pipe',
    cwd: rootDir,
  });

  // Wait for server to be ready
  for (let i = 0; i < 60; i++) {
    if (await checkServerRunning()) {
      log('✅ Server started successfully!', 'green');
      return server;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error('Server failed to start within timeout');
}

async function main() {
  const startTime = Date.now();
  let serverProcess = null;

  try {
    log('\n🧪 Starting Comprehensive Test Suite', 'bright');
    log('='.repeat(60), 'cyan');

    // Step 1: Run unit tests
    log('\n📦 Step 1: Running Unit Tests', 'blue');
    try {
      await runCommand('npm', ['run', 'test:unit']);
      log('\n✅ Unit tests passed!', 'green');
    } catch (error) {
      log('\n❌ Unit tests failed!', 'red');
      throw error;
    }

    // Step 2: Check/Start server for E2E tests
    log('\n🌐 Step 2: Preparing for E2E Tests', 'blue');
    const serverRunning = await waitForServer(5);
    
    if (!serverRunning) {
      serverProcess = await startServer();
    }

    // Step 3: Run E2E tests
    log('\n🎭 Step 3: Running E2E Tests', 'blue');
    try {
      await runCommand('npm', ['run', 'test:e2e']);
      log('\n✅ E2E tests passed!', 'green');
    } catch (error) {
      log('\n❌ E2E tests failed!', 'red');
      throw error;
    }

    // Step 4: Generate coverage report
    log('\n📊 Step 4: Generating Coverage Report', 'blue');
    try {
      await runCommand('npm', ['run', 'test:coverage']);
      log('\n✅ Coverage report generated!', 'green');
    } catch (error) {
      log('\n⚠️  Coverage report generation failed (non-critical)', 'yellow');
    }

    // Success summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    log('\n' + '='.repeat(60), 'green');
    log('🎉 ALL TESTS PASSED!', 'green');
    log(`⏱️  Total time: ${duration}s`, 'green');
    log('='.repeat(60), 'green');
    process.exit(0);

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    log('\n' + '='.repeat(60), 'red');
    log('❌ TEST SUITE FAILED', 'red');
    log(`⏱️  Total time: ${duration}s`, 'red');
    log(`Error: ${error.message}`, 'red');
    log('='.repeat(60), 'red');
    process.exit(1);
  } finally {
    // Cleanup: Kill server if we started it
    if (serverProcess) {
      log('\n🛑 Stopping development server...', 'yellow');
      serverProcess.kill();
    }
  }
}

// Handle process termination
process.on('SIGINT', () => {
  log('\n\n⚠️  Test run interrupted by user', 'yellow');
  process.exit(130);
});

process.on('SIGTERM', () => {
  log('\n\n⚠️  Test run terminated', 'yellow');
  process.exit(143);
});

main();

