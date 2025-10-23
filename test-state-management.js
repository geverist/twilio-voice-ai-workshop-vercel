/**
 * State Management Unit Tests (Node.js)
 *
 * Run with: node test-state-management.js
 */

// =========================================================================
// MINIMAL STATE MANAGEMENT IMPLEMENTATION FOR TESTING
// =========================================================================

const stateListeners = {};
let syncTimer = null;
let syncCallCount = 0;
let syncCallHistory = [];

// Mock global state
const globalState = {
  sessionToken: null,
  studentEmail: null,
  studentName: null,
  twilioConnected: false,
  openaiConnected: false,
  callDirectionChosen: false,
  useCaseDescription: '',
  selectedPhoneNumber: null,
  servicesReady: false,
  step4CodeValidated: false,
  step4Committed: false,
  step4Deployed: false,
  step5CodeValidated: false,
  step5Committed: false,
  step5Deployed: false,
  step6CodeValidated: false,
  step6Committed: false,
  step6Deployed: false,
  systemPromptSaved: false,
  step7Committed: false,
  step7Deployed: false,
  toolsConfigured: false,
  step8CodeValidated: false,
  step8Committed: false,
  step8Deployed: false,
  projectDeployed: false,
  currentStep: 0
};

// Mock localStorage
const mockLocalStorage = {};
const localStorage = {
  setItem: (key, value) => { mockLocalStorage[key] = value; },
  getItem: (key) => mockLocalStorage[key] || null,
  clear: () => { Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]); }
};

function setState(path, value) {
  const varName = path.split('.').pop();
  const oldValue = globalState[varName];

  globalState[varName] = value;

  // Save to localStorage
  try {
    localStorage.setItem(varName, JSON.stringify(value));
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }

  // Queue database sync (debounced)
  queueDatabaseSync();

  // Trigger listeners
  if (stateListeners[path]) {
    stateListeners[path].forEach(callback => callback(value, oldValue));
  }

  return value;
}

function getState(path) {
  const varName = path.split('.').pop();
  return globalState[varName];
}

function watchState(path, callback) {
  if (!stateListeners[path]) {
    stateListeners[path] = [];
  }
  stateListeners[path].push(callback);
}

function queueDatabaseSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncToDatabase();
  }, 2000);
}

async function syncToDatabase() {
  if (!globalState.sessionToken) {
    return;
  }

  syncCallCount++;
  syncCallHistory.push({
    timestamp: Date.now(),
    sessionToken: globalState.sessionToken,
    twilioConnected: globalState.twilioConnected,
    openaiConnected: globalState.openaiConnected,
    step4Deployed: globalState.step4Deployed
  });

  // Mock API call
  return Promise.resolve({ success: true });
}

const STEP_CONDITIONS = {
  0: () => globalState.twilioConnected && globalState.openaiConnected,
  1: () => globalState.callDirectionChosen && globalState.useCaseDescription?.trim(),
  2: () => globalState.selectedPhoneNumber && globalState.servicesReady,
  3: () => globalState.step4CodeValidated && globalState.step4Deployed,
  4: () => globalState.step5CodeValidated && globalState.step5Deployed,
  5: () => globalState.step6CodeValidated && globalState.step6Deployed,
  6: () => globalState.systemPromptSaved,
  7: () => globalState.toolsConfigured && globalState.step8Deployed,
  8: () => globalState.projectDeployed
};

function checkStepComplete(stepNum) {
  const condition = STEP_CONDITIONS[stepNum];
  if (!condition) return false;
  return condition();
}

function resetState() {
  Object.keys(globalState).forEach(key => {
    if (typeof globalState[key] === 'boolean') {
      globalState[key] = false;
    } else if (typeof globalState[key] === 'number') {
      globalState[key] = 0;
    } else {
      globalState[key] = null;
    }
  });
  globalState.useCaseDescription = '';
  syncCallCount = 0;
  syncCallHistory = [];
  Object.keys(stateListeners).forEach(key => {
    stateListeners[key] = [];
  });
  localStorage.clear();
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =========================================================================
// TEST FRAMEWORK
// =========================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failedTestDetails = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message || 'Deep equality failed'}: Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function assertGreaterThan(actual, expected, message) {
  if (actual <= expected) {
    throw new Error(`${message || 'Assertion failed'}: Expected ${actual} to be greater than ${expected}`);
  }
}

async function runTest(suiteName, testName, testFn) {
  totalTests++;
  try {
    await testFn();
    passedTests++;
    console.log(`  ✅ ${testName}`);
  } catch (error) {
    failedTests++;
    console.log(`  ❌ ${testName}`);
    console.log(`     Error: ${error.message}`);
    failedTestDetails.push({
      suite: suiteName,
      test: testName,
      error: error.message
    });
  }
}

// =========================================================================
// TEST SUITES
// =========================================================================

async function runAllTests() {
  console.log('\n🧪 State Management Unit Tests\n');
  console.log('='.repeat(60));

  const startTime = Date.now();

  // Test Suite 1: setState() Function
  console.log('\n📦 setState() Function');
  console.log('-'.repeat(60));

  await runTest('setState()', 'should update variable value', () => {
    resetState();
    setState('twilioConnected', true);
    assertEqual(globalState.twilioConnected, true);
  });

  await runTest('setState()', 'should save to localStorage', () => {
    resetState();
    setState('studentEmail', 'test@example.com');
    const saved = JSON.parse(localStorage.getItem('studentEmail'));
    assertEqual(saved, 'test@example.com');
  });

  await runTest('setState()', 'should queue database sync', async () => {
    resetState();
    setState('sessionToken', 'test123');
    setState('twilioConnected', true);
    await wait(2100); // Wait for debounce
    assertGreaterThan(syncCallCount, 0, 'Sync should have been called');
  });

  await runTest('setState()', 'should trigger state listeners', () => {
    resetState();
    let listenerCalled = false;
    let receivedValue = null;

    watchState('openaiConnected', (newVal) => {
      listenerCalled = true;
      receivedValue = newVal;
    });

    setState('openaiConnected', true);
    assert(listenerCalled, 'Listener should have been called');
    assertEqual(receivedValue, true);
  });

  // Test Suite 2: getState() Function
  console.log('\n📦 getState() Function');
  console.log('-'.repeat(60));

  await runTest('getState()', 'should retrieve current state value', () => {
    resetState();
    setState('studentName', 'John Doe');
    const value = getState('studentName');
    assertEqual(value, 'John Doe');
  });

  await runTest('getState()', 'should return undefined for unset values', () => {
    resetState();
    const value = getState('nonexistentValue');
    assertEqual(value, undefined);
  });

  // Test Suite 3: watchState() Function
  console.log('\n📦 watchState() Function');
  console.log('-'.repeat(60));

  await runTest('watchState()', 'should register listener for state changes', () => {
    resetState();
    let callCount = 0;

    watchState('step4Deployed', () => {
      callCount++;
    });

    setState('step4Deployed', true);
    assertEqual(callCount, 1);
  });

  await runTest('watchState()', 'should support multiple listeners', () => {
    resetState();
    let call1 = false;
    let call2 = false;

    watchState('servicesReady', () => { call1 = true; });
    watchState('servicesReady', () => { call2 = true; });

    setState('servicesReady', true);
    assert(call1, 'First listener should be called');
    assert(call2, 'Second listener should be called');
  });

  await runTest('watchState()', 'should pass new and old values to listener', () => {
    resetState();
    let oldVal = null;
    let newVal = null;

    setState('currentStep', 0);

    watchState('currentStep', (n, o) => {
      newVal = n;
      oldVal = o;
    });

    setState('currentStep', 1);
    assertEqual(newVal, 1);
    assertEqual(oldVal, 0);
  });

  // Test Suite 4: Database Sync (Debouncing)
  console.log('\n📦 Database Sync (Debouncing)');
  console.log('-'.repeat(60));

  await runTest('Database Sync', 'should debounce multiple rapid setState calls', async () => {
    resetState();
    setState('sessionToken', 'test123');

    syncCallCount = 0;
    setState('twilioConnected', true);
    setState('openaiConnected', true);
    setState('step4CodeValidated', true);

    await wait(2100);

    // Should only sync once despite 3 setState calls
    assertEqual(syncCallCount, 1, 'Should sync only once');
  });

  await runTest('Database Sync', 'should sync after 2 seconds of inactivity', async () => {
    resetState();
    setState('sessionToken', 'test123');

    syncCallCount = 0;
    setState('projectDeployed', true);

    await wait(2100);
    assertEqual(syncCallCount, 1);
  });

  await runTest('Database Sync', 'should not sync without sessionToken', async () => {
    resetState();
    // Don't set sessionToken

    syncCallCount = 0;
    setState('twilioConnected', true);

    await wait(2100);
    assertEqual(syncCallCount, 0, 'Should not sync without sessionToken');
  });

  // Test Suite 5: Step Completion Conditions
  console.log('\n📦 Step Completion Conditions');
  console.log('-'.repeat(60));

  await runTest('Step Conditions', 'should check Step 0 completion (Twilio + OpenAI)', () => {
    resetState();
    assertEqual(checkStepComplete(0), false);

    setState('twilioConnected', true);
    assertEqual(checkStepComplete(0), false);

    setState('openaiConnected', true);
    assertEqual(checkStepComplete(0), true);
  });

  await runTest('Step Conditions', 'should check Step 1 completion (direction + description)', () => {
    resetState();
    assertEqual(checkStepComplete(1), false);

    setState('callDirectionChosen', true);
    assertEqual(checkStepComplete(1), false);

    setState('useCaseDescription', 'Test use case');
    assertEqual(checkStepComplete(1), true);
  });

  await runTest('Step Conditions', 'should check Step 3 completion (validation + deployment)', () => {
    resetState();
    assertEqual(checkStepComplete(3), false);

    setState('step4CodeValidated', true);
    assertEqual(checkStepComplete(3), false);

    setState('step4Deployed', true);
    assertEqual(checkStepComplete(3), true);
  });

  await runTest('Step Conditions', 'should check Step 6 completion (system prompt saved)', () => {
    resetState();
    assertEqual(checkStepComplete(6), false);

    setState('systemPromptSaved', true);
    assertEqual(checkStepComplete(6), true);
  });

  // Test Suite 6: localStorage Integration
  console.log('\n📦 localStorage Integration');
  console.log('-'.repeat(60));

  await runTest('localStorage', 'should persist state values to localStorage', () => {
    resetState();
    setState('selectedPhoneNumber', '+15551234567');

    const stored = localStorage.getItem('selectedPhoneNumber');
    assertEqual(JSON.parse(stored), '+15551234567');
  });

  await runTest('localStorage', 'should persist boolean values correctly', () => {
    resetState();
    setState('step5Deployed', true);

    const stored = localStorage.getItem('step5Deployed');
    assertEqual(JSON.parse(stored), true);
  });

  await runTest('localStorage', 'should persist object values correctly', () => {
    resetState();
    const testObj = { test: 'value', nested: { key: 123 } };

    globalState.testObject = testObj;
    localStorage.setItem('testObject', JSON.stringify(testObj));

    const stored = JSON.parse(localStorage.getItem('testObject'));
    assertDeepEqual(stored, testObj);
  });

  // Summary
  const endTime = Date.now();
  const elapsed = endTime - startTime;

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary\n');
  console.log(`  Total Tests:  ${totalTests}`);
  console.log(`  Passed:       ${passedTests} ✅`);
  console.log(`  Failed:       ${failedTests} ❌`);
  console.log(`  Time:         ${elapsed}ms`);
  console.log('\n' + '='.repeat(60));

  if (failedTests > 0) {
    console.log('\n❌ Failed Tests:\n');
    failedTestDetails.forEach(({ suite, test, error }) => {
      console.log(`  ${suite} → ${test}`);
      console.log(`    ${error}\n`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!\n');
    process.exit(0);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('\n❌ Test runner error:', error);
  process.exit(1);
});
