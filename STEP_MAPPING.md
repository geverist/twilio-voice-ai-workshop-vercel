# Workshop Step Mapping - DO NOT CHANGE

This maps the case numbers to what they ACTUALLY render.

## The CORRECT Mapping:

```
case 0  → renderStep1_Setup()              → Step 1: Connect Accounts
case 1  → renderStep2_Direction()          → Step 2: Choose Use Case
case 2  → renderStep3_Services()           → Step 3: Provision Services
case 3  → renderStep4_BasicTwiML()         → Step 4: Basic TwiML Handler
case 4  → renderStep_WebSocket()           → Step 5: WebSocket Handler (Media Streams)
case 5  → renderStep_ConversationRelay()   → Step 6: ConversationRelay (Upgrade to AI)
case 6  → renderStep_PromptEngineering()   → Step 7: Custom AI Prompt
case 7  → renderStep_Tooling()             → Step 8: Tools & Functions
case 8  → renderStep_Deploy()              → Step 9: Deploy Your System
```

## Navigation Button Labels (MUST MATCH):

Step 1 → "Next: Choose Use Case →"
Step 2 → "Next: Provision Services →"
Step 3 → "Next: Create Basic TwiML →"
Step 4 → "Next: WebSocket Streaming →"
Step 5 → "Next: ConversationRelay →"
Step 6 → "Next: Prompt Engineering →"
Step 7 → "Next: Tools & Functions →"
Step 8 → "Next: Deploy Your System →"

## Why case numbers don't match step numbers:

currentStep starts at 0, not 1.
- currentStep = 0 is actually Step 1 (Setup)
- currentStep = 4 is actually Step 5 (WebSocket)
- etc.

## DO NOT RENAME ANYTHING TO MATCH CASE NUMBERS

The render function names describe WHAT they render, not their case number.
