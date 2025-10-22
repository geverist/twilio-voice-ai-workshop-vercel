# Comprehensive State Management System

## Core Principle
**Single source of truth** → localStorage → Database → UI updates automatically

## State Structure

```javascript
const workshopState = {
  // Student Identity
  student: {
    email: '',
    name: '',
    sessionToken: '',
    demoMode: false
  },
  
  // Step Completion Tracking
  steps: {
    0: { completed: false, started: false },  // Setup
    1: { completed: false, started: false },  // Use Case
    2: { completed: false, started: false },  // Services
    3: { completed: false, started: false },  // Basic TwiML
    4: { completed: false, started: false },  // WebSocket
    5: { completed: false, started: false },  // ConversationRelay
    6: { completed: false, started: false },  // Prompt Engineering
    7: { completed: false, started: false },  // Tools & Functions
    8: { completed: false, started: false }   // Deploy
  },
  
  // Step-specific Data
  stepData: {
    // Step 0-1
    twilioConnected: false,
    openaiConnected: false,
    callDirection: null,
    useCaseDescription: '',
    
    // Step 2-3
    selectedPhoneNumber: null,
    messagingServiceSid: null,
    servicesReady: false,
    
    // Step 3-4
    step4CodeValidated: false,
    step4Committed: false,
    step4Deployed: false,
    
    // Step 4-5
    codespaceUrl: '',
    step5CodeValidated: false,
    step5Committed: false,
    step5Deployed: false,
    
    // Step 5-6
    step6CodeValidated: false,
    step6Committed: false,
    step6Deployed: false,
    ttsProvider: 'google',
    conversationRelayVoice: 'en-US-Journey-D',
    
    // Step 6-7
    systemPromptSaved: false,
    
    // Step 7-8
    toolsConfigured: false,
    step8CodeValidated: false,
    step8Deployed: false,
    
    // Step 8-9
    projectDeployed: false
  },
  
  // UI State
  ui: {
    currentStep: 0,
    nextActionTarget: null  // Which element should have next-action
  }
}
```

## Completion Conditions

```javascript
const STEP_CONDITIONS = {
  0: () => state.stepData.twilioConnected && state.stepData.openaiConnected,
  1: () => state.stepData.callDirection && state.stepData.useCaseDescription?.trim(),
  2: () => state.stepData.selectedPhoneNumber && state.stepData.servicesReady,
  3: () => state.stepData.step4CodeValidated && state.stepData.step4Deployed,
  4: () => state.stepData.step5CodeValidated && state.stepData.step5Deployed,
  5: () => state.stepData.step6CodeValidated && state.stepData.step6Deployed,
  6: () => state.stepData.systemPromptSaved,
  7: () => state.stepData.toolsConfigured && state.stepData.step8Deployed,
  8: () => state.stepData.projectDeployed
}
```

## Next-Action Targets

```javascript
const NEXT_ACTION_TARGETS = {
  0: {
    check: () => !state.stepData.twilioConnected,
    target: '[onclick="connectTwilio()"]',
    fallback: {
      check: () => !state.stepData.openaiConnected,
      target: '[onclick="connectOpenAI()"]',
      fallback: {
        target: '#nextBtn1'
      }
    }
  },
  1: {
    check: () => !state.stepData.callDirection,
    target: '.direction-card:first-child',
    fallback: {
      check: () => !state.stepData.useCaseDescription,
      target: '#useCaseDescription',
      fallback: {
        target: '#nextBtn2'
      }
    }
  },
  3: {
    check: () => !state.stepData.step4CodeValidated,
    target: '[onclick="validateCode4()"]',
    fallback: {
      check: () => !state.stepData.step4Committed,
      target: '#commitBtn4',
      fallback: {
        target: '#nextBtn4'
      }
    }
  }
  // ... etc for all steps
}
```

## Core Functions

### 1. State Management
```javascript
// Get state
function getState(path) {
  // Return value from workshopState using dot notation
  // e.g., getState('stepData.twilioConnected')
}

// Set state
function setState(path, value) {
  // 1. Update workshopState
  // 2. Save to localStorage
  // 3. Trigger state change listeners
  // 4. Queue database sync
}

// Watch state
function watchState(path, callback) {
  // Register callback for when path changes
}
```

### 2. Condition Checking
```javascript
function checkStepComplete(stepNum) {
  const condition = STEP_CONDITIONS[stepNum];
  const isComplete = condition();
  
  if (isComplete && !state.steps[stepNum].completed) {
    setState(`steps.${stepNum}.completed`, true);
    updateNextButton(stepNum);
  }
  
  return isComplete;
}

function checkAllConditions() {
  // Check current step completion
  checkStepComplete(state.ui.currentStep);
  
  // Update next-action target
  updateNextActionTarget();
}
```

### 3. Next-Action Management
```javascript
function updateNextActionTarget() {
  const stepNum = state.ui.currentStep;
  const config = NEXT_ACTION_TARGETS[stepNum];
  
  if (!config) return;
  
  // Remove all existing next-actions
  document.querySelectorAll('.next-action').forEach(el => {
    el.classList.remove('next-action');
  });
  
  // Find the right target
  let target = findNextActionTarget(config);
  
  if (target) {
    const element = document.querySelector(target);
    if (element) {
      element.classList.add('next-action');
      setState('ui.nextActionTarget', target);
    }
  }
}

function findNextActionTarget(config) {
  if (!config) return null;
  
  if (config.check && config.check()) {
    return config.target;
  }
  
  if (config.fallback) {
    return findNextActionTarget(config.fallback);
  }
  
  return config.target;
}
```

### 4. Database Sync
```javascript
let syncTimer = null;

function queueDatabaseSync() {
  // Debounce: only sync after 2 seconds of no changes
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncToDatabase();
  }, 2000);
}

async function syncToDatabase() {
  if (!sessionToken) return;
  
  const payload = {
    sessionToken,
    studentEmail: state.student.email,
    studentName: state.student.name,
    stepData: state.stepData,
    steps: state.steps,
    currentStep: state.ui.currentStep
  };
  
  await fetch('/api/student-config-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
```

### 5. Initialization
```javascript
function initStateManagement() {
  // 1. Load from localStorage
  const saved = localStorage.getItem('workshopState');
  if (saved) {
    Object.assign(workshopState, JSON.parse(saved));
  }
  
  // 2. Set up watchers
  watchState('stepData', () => {
    checkAllConditions();
    queueDatabaseSync();
  });
  
  // 3. Initial check
  checkAllConditions();
  
  // 4. Render UI
  renderStepContent();
}
```

## Migration Plan

1. Create state management module
2. Replace all direct variable assignments with setState()
3. Replace all condition checks with centralized checker
4. Update all event handlers to use state system
5. Test thoroughly
6. Deploy

## Benefits

- ✅ Single source of truth
- ✅ Automatic localStorage sync
- ✅ Automatic database sync
- ✅ Automatic next-action management
- ✅ Easy to debug (one state object)
- ✅ Predictable behavior
- ✅ No scattered if/else conditions
