# Test Framework Updates - Next-Action Flow Validation

## Summary

Updated the UI interaction test framework (`public/ui-interaction-tests.html`) to include comprehensive testing of the next-action flow, ensuring it matches the design documented in `NEXT_ACTION_FLOW.md`.

## New Test Suite: "Next-Action Flow"

Added **11 new tests** specifically for validating the next-action visual guidance system.

### Tests Added

#### 1. Core Validation Tests

**"should have only ONE element with next-action class at any time"**
- Verifies the fundamental rule: never more than 1 element with `next-action` class
- Critical for preventing multiple fingers/flashing effects

**"should clear all highlights before adding new next-action"**
- Simulates the bug by adding multiple next-action classes
- Verifies that `highlightNextAction()` properly clears all before adding one
- Ensures the fix is working correctly

#### 2. Step 1 Flow Tests

**"should add next-action to Connect OpenAI button after Twilio connected"**
- Tests transition: Twilio connected → OpenAI button gets highlight
- Validates NEXT_ACTION_FLOW.md section 1.2

**"should move next-action to Next button after both accounts connected"**
- Tests transition: Both connected → Next button gets highlight
- Validates NEXT_ACTION_FLOW.md section 1.3

**"should follow complete next-action flow for Step 1 (Connect Accounts)"**
- End-to-end test of entire Step 1 flow
- Tests all three stages: initial → Twilio → both connected

#### 3. Validation & Commit Flow Tests

**"should move next-action from Validate to Commit button after validation"**
- Tests code validation transition
- Verifies: Validate button → Commit button
- Validates the pattern used in steps 4, 5, 6, 8

**"should follow complete next-action flow for Step 4 (Deploy Basic Handler)"**
- End-to-end test of Step 4: Validate → Commit → Test → Next
- Tests the complete deployment workflow

#### 4. Special Case Tests

**"should remove next-action from test call button after test completes"**
- Verifies clearHighlights() is called at the right time
- Tests the fix for clearing highlights BEFORE adding new ones

**"should NOT have next-action on Save Prompt button initially in Step 7"**
- Verifies removal of static `next-action` class from HTML
- Ensures dynamic-only next-action management

**"should move next-action to Next button after saving prompt"**
- Tests Step 7 flow: Save Prompt → Next button
- Validates custom behavior in saveSystemPrompt()

#### 5. Consistency Tests

**"should have consistent next-action across step navigation"**
- Tests multiple steps to ensure consistency
- Verifies the pattern works across different step types

**"should NOT have static next-action classes in HTML templates"**
- Scans all steps for hardcoded next-action classes
- Ensures all static classes were removed
- Validates template cleanliness

## New Helper Functions

### `countNextActionElements()`
Returns detailed info about all elements with next-action class:
```javascript
{
  count: 1,
  elements: [
    { id: 'nextBtn1', tagName: 'BUTTON', className: '...', text: 'Next...' }
  ]
}
```

### `verifySingleNextAction(expectedSelector)`
Validates the "only one highlight" rule and optionally checks if it's on the correct element:
```javascript
const result = verifySingleNextAction('#nextBtn1');
// Returns: { pass: true, message: '...', elements: [...] }
```

## Test Coverage

The new tests validate:

✅ **Single highlight rule** - Never more than 1 next-action at a time
✅ **Step 1 flow** - Twilio → OpenAI → Next button transitions
✅ **Validation flow** - Validate → Commit button transitions (steps 4, 5, 6, 8)
✅ **Test flow** - Test completion → Next button transitions
✅ **Prompt flow** - Save Prompt → Next button transition (step 7)
✅ **Static class removal** - No hardcoded next-action in HTML
✅ **Clear before add** - All highlights cleared before new one added
✅ **Cross-step consistency** - Pattern works across all steps

## Running the Tests

1. Open the workshop in a browser
2. Navigate to `/ui-interaction-tests.html`
3. Click "Run All Tests"
4. The new "Next-Action Flow" test suite will run automatically

Expected results:
- **Total Tests**: 46 (35 existing + 11 new)
- All tests should pass with the fixes applied

## Integration with Design Doc

These tests directly validate the flows documented in:
- `NEXT_ACTION_FLOW.md` - Step-by-step next-action transitions
- Ensures implementation matches design specification
- Provides regression protection for future changes

## Benefits

1. **Prevents regression** - If someone adds a static next-action class, tests will catch it
2. **Validates fixes** - Confirms all the fixes we made are working
3. **Documentation** - Tests serve as executable documentation of expected behavior
4. **Confidence** - Provides automated verification that the flow works correctly
