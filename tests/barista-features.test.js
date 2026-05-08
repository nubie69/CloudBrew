#!/usr/bin/env node

/**
 * Cloud Brew - Barista Analytics & Real-Time Queue Test Suite
 * 
 * This script validates that all new features are properly integrated.
 * Run with: node tests/barista-features.test.js
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test 1: Backend endpoint exists
test('Backend: Barista analytics endpoint registered', () => {
  const serverCode = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
  assert(serverCode.includes("app.get('/api/analytics/barista-dashboard'"), 'Endpoint not found');
  assert(serverCode.includes("requireRole('barista', 'admin')"), 'Role guard not found');
});

// Test 2: Analytics service exists and exports functions
test('Frontend: baristaAnalytics service exports all functions', () => {
  const analyticsCode = fs.readFileSync(path.join(__dirname, '../src/services/baristaAnalytics.js'), 'utf8');
  
  assert(analyticsCode.includes('export async function fetchBaristaAnalytics'), 'fetchBaristaAnalytics not exported');
  assert(analyticsCode.includes('export function formatPrepTime'), 'formatPrepTime not exported');
  assert(analyticsCode.includes('export function getPerformanceTier'), 'getPerformanceTier not exported');
  assert(analyticsCode.includes('export function calculateMetricChanges'), 'calculateMetricChanges not exported');
});

// Test 3: Socket.io service exists and exports functions
test('Frontend: queueSocket service exports all functions', () => {
  const socketCode = fs.readFileSync(path.join(__dirname, '../src/services/queueSocket.js'), 'utf8');
  
  assert(socketCode.includes('export function connectQueueSocket'), 'connectQueueSocket not exported');
  assert(socketCode.includes('export function disconnectQueueSocket'), 'disconnectQueueSocket not exported');
  assert(socketCode.includes('export function subscribeToQueueEvents'), 'subscribeToQueueEvents not exported');
  assert(socketCode.includes('export function isQueueConnected'), 'isQueueConnected not exported');
});

// Test 4: HTTP service has getApiUrl export
test('Frontend: HTTP service exports getApiUrl', () => {
  const httpCode = fs.readFileSync(path.join(__dirname, '../src/services/http.js'), 'utf8');
  assert(httpCode.includes('export function getApiUrl'), 'getApiUrl not exported');
});

// Test 5: BaristaScreen imports all required services
test('Frontend: BaristaScreen imports new services', () => {
  const baristaCode = fs.readFileSync(path.join(__dirname, '../src/screens/BaristaScreen.js'), 'utf8');
  
  assert(baristaCode.includes('import { fetchBaristaAnalytics'), 'baristaAnalytics not imported');
  assert(baristaCode.includes('import { connectQueueSocket'), 'queueSocket not imported');
  assert(baristaCode.includes('import { getApiUrl }'), 'getApiUrl not imported');
});

// Test 6: BaristaScreen has analytics view
test('Frontend: BaristaScreen has analytics view tab', () => {
  const baristaCode = fs.readFileSync(path.join(__dirname, '../src/screens/BaristaScreen.js'), 'utf8');
  
  assert(baristaCode.includes('{ key: \'analytics\', label: \'Analytics\' }'), 'Analytics tab not found');
  assert(baristaCode.includes('const showAnalyticsPanel = activeView === \'analytics\''), 'showAnalyticsPanel not found');
  assert(baristaCode.includes('showAnalyticsPanel &&'), 'Analytics panel render not found');
});

// Test 7: BaristaScreen initializes socket connection
test('Frontend: BaristaScreen initializes socket connection', () => {
  const baristaCode = fs.readFileSync(path.join(__dirname, '../src/screens/BaristaScreen.js'), 'utf8');
  
  assert(baristaCode.includes('connectQueueSocket'), 'Socket connection not initialized');
  assert(baristaCode.includes('subscribeToQueueEvents'), 'Queue event subscription not found');
  assert(baristaCode.includes('disconnectQueueSocket'), 'Socket disconnection not found');
});

// Test 8: Analytics styles added
test('Frontend: BaristaScreen has analytics styles', () => {
  const baristaCode = fs.readFileSync(path.join(__dirname, '../src/screens/BaristaScreen.js'), 'utf8');
  
  assert(baristaCode.includes('analyticCard:'), 'analyticCard style not found');
  assert(baristaCode.includes('analyticStatsGrid:'), 'analyticStatsGrid style not found');
  assert(baristaCode.includes('performanceTierBadge:'), 'performanceTierBadge style not found');
  assert(baristaCode.includes('waitTimeContainer:'), 'waitTimeContainer style not found');
});

// Test 9: Socket.io runs on same port as Express
test('Backend: Socket.io configured on HTTP server', () => {
  const serverCode = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
  
  assert(serverCode.includes("const { Server } = require('socket.io')"), 'socket.io not imported');
  assert(serverCode.includes('configureRealtimeQueue'), 'configureRealtimeQueue not found');
  assert(serverCode.includes('realtimeQueueServer.to(`role:${role}`).emit'), 'Role-based broadcast not found');
});

// Test 10: Broadcasting on order events
test('Backend: Order events broadcast to socket.io', () => {
  const serverCode = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
  
  assert(serverCode.includes('broadcastQueueEvent'), 'broadcastQueueEvent not found');
  assert(serverCode.includes("'queue.order.created'"), 'order created event not found');
  assert(serverCode.includes("'queue.order.updated'"), 'order updated event not found');
});

// Run all tests
async function runTests() {
  log('blue', '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('blue', '  Cloud Brew - Barista Features Test Suite');
  log('blue', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const testCase of tests) {
    try {
      testCase.fn();
      log('green', `  ✓ ${testCase.name}`);
      passed++;
    } catch (error) {
      log('red', `  ✗ ${testCase.name}`);
      log('yellow', `    ${error.message}`);
      failed++;
    }
  }

  log('blue', '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('blue', `  Tests: ${passed + failed} | ${colors.green}Passed: ${passed}${colors.reset} | ${colors.red}Failed: ${failed}${colors.reset}`);
  log('blue', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
