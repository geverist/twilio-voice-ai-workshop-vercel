# Next-Action Effect Flow Documentation

This document maps the complete flow of the `next-action` visual effect (pulsing glow + animated pointer finger) throughout the Twilio Voice AI Workshop.

## CSS Implementation

**Location:** `public/index.html` lines 136-156

```css
.next-action {
  animation: pulse 2s infinite, glow 2s infinite;
  position: relative;
  z-index: 1;
}

.next-action::before {
  content: '👉';
  position: absolute;
  left: -45px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1.5rem;
  animation: bounce 1s infinite;
  z-index: 2;
}

.button-group .next-action {
  margin-left: 60px;
}
```

## Step-by-Step Flow

### Step 0: Welcome Modal
**Initial State:** Modal shows on first visit

No next-action effects in modal itself.

---

### Step 1: Connect Accounts

#### 1.1 Initial State
- **Effect on:** "Connect Twilio Account" button
- **Location:** Line 14162
- **Trigger:** Page load if Twilio not connected

#### 1.2 After Twilio Connected
- **Effect moves to:** "Connect OpenAI Account" button
- **Location:** Line 2955
- **Trigger:** `checkStep1Complete()` after Twilio connection
- **Code:** Line 2953-2956

#### 1.3 After Both Accounts Connected
- **Effect moves to:** "Next: Select Use Case →" button
- **Location:** Line 2964
- **Trigger:** `checkStep1Complete()` when both accounts connected
- **Code:** Line 2962-2965

---

### Step 2: Define Your Use Case

#### 2.1 Initial State (No Direction Chosen)
- **Effect on:** First direction option card
- **Location:** Line 2109
- **Trigger:** Page render if no direction selected
- **Code:** Line 2108-2109

#### 2.2 After Direction Chosen (No Use Case Description)
- Effect stays on direction options until use case description entered

#### 2.3 After Both Direction AND Use Case Description
- **Effect moves to:** "Next: Provision Services →" button
- **Location:** Line 3207
- **Trigger:** `selectCallDirection()` when both criteria met
- **Code:** Line 3205-3208

---

### Step 3: Provision Twilio Services

#### 3.1 Phone Number Selection
- **Effect on:** First phone option
- **Location:** Line 2117
- **Trigger:** Render if no phone selected
- **Code:** Line 2116-2117

#### 3.2 After Services Provisioned
- **Effect moves to:** "Next: Deploy Basic Handler →" button
- **Location:** Line 3499 or 3530
- **Trigger:** Service provisioning complete
- **Code:** Line 3497-3500 (or 3528-3531)

---

### Step 4: Deploy Basic TwiML Handler

#### 4.1 Initial State
- **Effect on:** "✓ Validate" button (validateCode4)
- **Location:** Line 4045
- **Static:** Added in HTML template

#### 4.2 After Validation Success
- **Effect moves to:** "💾 Commit Step 4" button
- **Location:** Line 4392
- **Trigger:** `validateCode4()` success
- **Code:** Line 4388-4392
- **Removes from:** Validate button (line 4389)

#### 4.3 After Commit/Deploy Success
- **Effect moves to:** "📞 Make Live Test Call" button
- **Location:** Line 8533
- **Trigger:** `commitStep()` for step 4
- **Code:** Line 8530-8533

#### 4.4 After Test Call Complete
- **Effect moves to:** "Next: Add WebSocket Handler →" button
- **Location:** Lines 4553, 4613, 4667, 4737
- **Trigger:** Test call completion (various paths)
- **Code:** Multiple completion handlers

---

### Step 5: WebSocket Handler (Media Streams)

#### 5.1 Initial State
- **Effect on:** "✓ Validate" button (validateCode7)
- **Location:** Line 9883
- **Static:** Added in HTML template

#### 5.2 After Validation Success
- **Effect moves to:** "💾 Deploy WebSocket Handler" button (deployCodespaceBtn5)
- **Location:** Line 10884
- **Trigger:** `validateCode7()` success
- **Code:** Line 10880-10884
- **Removes from:** Validate button (line 10881)

#### 5.3 After Deploy Success
- **Effect moves to:** "Next: Upgrade to ConversationRelay →" button
- **Location:** Step render checks deployment status
- **Trigger:** Deploy completion

---

### Step 6: Upgrade to ConversationRelay

#### 6.1 Initial State
- **Effect on:** "✓ Validate" button (validateCode8)
- **Location:** Line 9227
- **Static:** Added in HTML template

#### 6.2 After Validation Success
- **Effect moves to:** "💾 Commit Step 6 - Deploy ConversationRelay" button
- **Location:** Line 9561
- **Trigger:** `validateCode8()` success
- **Code:** Line 9557-9561
- **Removes from:** Validate button (line 9558)

#### 6.3 After Deploy Success
- **Effect moves to:** Test section appears (optional test)
- **Location:** Lines 8582-8586
- **Trigger:** `commitStep(6)` success
- **Note:** Test section only shows after `step6Committed = true`

---

### Step 7: Custom AI Prompt (Prompt Engineering)
No code validation in this step - just form inputs and explanatory content.

---

### Step 8: Tools & Functions
No specific next-action flow - uses commit button at end.

---

### Step 9: Deploy Your Voice AI System
Final step - no next-action needed.

---

## Key Functions That Manage Next-Action Flow

### `checkStep1Complete()`
**Location:** Lines 2945-2967
**Purpose:** Manages Step 1 account connection flow
- Checks Twilio + OpenAI connection status
- Adds next-action to OpenAI button if only Twilio connected
- Adds next-action to Next button if both connected

### `selectCallDirection(direction)`
**Location:** Lines 3193-3224
**Purpose:** Handles direction selection and enables Next button
- Saves call direction
- Checks for use case description
- Enables Next button only when both criteria met

### `validateCode4()`, `validateCode7()`, `validateCode8()`
**Purpose:** Code validation handlers
- Remove next-action from Validate button
- Add next-action to Commit/Deploy button
- Enable Next step button

### `commitStep(stepNumber)`
**Location:** Lines 7875-8640
**Purpose:** Handles code deployment
- Manages next-action transitions after deployment
- Shows test sections after successful commits

---

## Implementation Pattern

All next-action transitions follow this pattern:

```javascript
// 1. Remove from current button
const currentBtn = document.querySelector('[onclick="currentAction()"]');
if (currentBtn) currentBtn.classList.remove('next-action');

// 2. Add to next button
const nextBtn = document.getElementById('nextActionBtn');
if (nextBtn) nextBtn.classList.add('next-action');

// 3. Optional: Scroll to reveal
setTimeout(() => {
  if (nextSection) {
    nextSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}, 300);
```

---

## Testing Checklist

To verify next-action flow works correctly:

- [ ] Step 1: Connect Twilio → Effect moves to OpenAI button
- [ ] Step 1: Connect OpenAI → Effect moves to Next button
- [ ] Step 2: Select direction → Effect stays until use case entered
- [ ] Step 2: Enter use case → Effect moves to Next button
- [ ] Step 3: Provision services → Effect moves to Next button
- [ ] Step 4: Validate code → Effect moves to Commit button
- [ ] Step 4: Commit code → Effect moves to Test Call button
- [ ] Step 4: Test call → Effect moves to Next button
- [ ] Step 5: Validate code → Effect moves to Deploy button
- [ ] Step 5: Deploy → Effect moves to Next button
- [ ] Step 6: Validate code → Effect moves to Commit button
- [ ] Step 6: Commit → Test section appears

---

## Notes

- The finger pointer is positioned at `left: -45px` to appear between Back and Next buttons
- Buttons with next-action in button-groups get `margin-left: 60px` to make room
- Effect should only be on ONE element at a time to guide user attention
- Demo mode follows the same flow as live mode for consistency
