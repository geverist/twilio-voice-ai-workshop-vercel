# Session Logging System

## Overview

The session logging system captures detailed event data for every student session, enabling instructors to troubleshoot issues and understand student behavior throughout the workshop.

## Features

- **Automatic Event Tracking**: Logs navigation, errors, actions, API calls, and state changes
- **Searchable Logs**: Query by session token, student email, or event type
- **Detailed Context**: Every log includes step info, user agent, timestamps, and more
- **Non-Blocking**: Logs asynchronously without impacting user experience

## Event Types

### 1. Navigation Events
Logged when students move between workshop steps.

**Example:**
```json
{
  "eventType": "navigation",
  "eventData": {
    "from": 2,
    "to": 3,
    "fromStepName": "Choose Use Case",
    "toStepName": "Provision Services",
    "currentStep": 3,
    "stepName": "Provision Services",
    "demoMode": false,
    "userAgent": "Mozilla/5.0...",
    "timestamp": "2025-10-27T15:30:45.123Z"
  }
}
```

### 2. Error Events
Logged when errors occur (API failures, validation errors, exceptions).

**Example:**
```json
{
  "eventType": "error",
  "eventData": {
    "errorType": "openai_validation_failed",
    "errorMessage": "Incorrect API key provided",
    "statusCode": 401,
    "currentStep": 0,
    "stepName": "Connect Accounts"
  }
}
```

### 3. Action Events
Logged when students perform significant actions.

**Example:**
```json
{
  "eventType": "action",
  "eventData": {
    "actionName": "openai_connected",
    "validated": true,
    "currentStep": 0,
    "stepName": "Connect Accounts"
  }
}
```

### 4. API Call Events
Logged when the workshop makes external API calls.

**Example:**
```json
{
  "eventType": "api_call",
  "eventData": {
    "endpoint": "/v1/models",
    "method": "GET",
    "status": 200,
    "success": true,
    "currentStep": 0
  }
}
```

### 5. State Change Events
Logged when important state variables change (optional - can be added for specific states).

**Example:**
```json
{
  "eventType": "state_change",
  "eventData": {
    "stateName": "twilioConnected",
    "oldValue": false,
    "newValue": true
  }
}
```

## API Endpoints

### POST /api/session-log
Log a session event.

**Request:**
```json
{
  "sessionToken": "ws_1234567890",
  "studentEmail": "student@example.com", // optional
  "eventType": "navigation",
  "eventData": {
    "from": 1,
    "to": 2
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Event logged successfully"
}
```

### GET /api/session-log
Retrieve session logs.

**Query Parameters:**
- `sessionToken` - Session to retrieve logs for
- `studentEmail` - Student to retrieve logs for
- `eventType` - Filter by event type (optional)
- `limit` - Max number of events (default 100)

**Example Request:**
```
GET /api/session-log?sessionToken=ws_1234567890&limit=50
```

**Response:**
```json
{
  "success": true,
  "count": 15,
  "events": [
    {
      "event_id": 123,
      "session_token": "ws_1234567890",
      "event_type": "navigation",
      "event_data": { ... },
      "created_at": "2025-10-27T15:30:45.123Z",
      "student_email": "student@example.com",
      "student_name": "John Doe"
    },
    ...
  ]
}
```

## Client-Side Logging Functions

### logSessionEvent(eventType, eventData)
Low-level function to log any event.

```javascript
logSessionEvent('custom_event', {
  customField: 'value',
  anotherField: 123
});
```

### logNavigation(from, to)
Log step navigation.

```javascript
logNavigation(2, 3); // From step 2 to step 3
```

### logError(errorType, errorMessage, errorDetails)
Log an error.

```javascript
logError('deployment_failed', 'Function deployment timeout', {
  functionName: 'voice-handler',
  timeout: 30000
});
```

### logAction(actionName, actionDetails)
Log a user action.

```javascript
logAction('phone_number_selected', {
  phoneNumber: '+15555551234',
  provider: 'twilio'
});
```

### logApiCall(endpoint, method, status, details)
Log an external API call.

```javascript
logApiCall('/api/deploy-function', 'POST', 200, {
  functionName: 'voice-handler',
  deploymentTime: 1234
});
```

### logStateChange(stateName, oldValue, newValue)
Log a state variable change.

```javascript
logStateChange('servicesReady', false, true);
```

## Instructor Dashboard - View Logs

### Via Admin API
Instructors can query session logs using the `/api/session-log` endpoint with appropriate credentials.

### Example: Troubleshooting a Student Issue

**Scenario:** Student reports they're stuck on Step 3 with a deployment error.

**Steps:**
1. Get the student's session token from the instructor dashboard
2. Query their logs:
   ```
   GET /api/session-log?sessionToken=ws_abc123&eventType=error
   ```
3. Review the error events to see exactly what failed:
   ```json
   {
     "event_type": "error",
     "event_data": {
       "errorType": "twilio_function_deploy_failed",
       "errorMessage": "Twilio account not authorized for Functions",
       "statusCode": 403
     }
   }
   ```
4. Provide targeted help based on the exact error

## Database Schema

Logs are stored in the `events` table:

```sql
CREATE TABLE events (
  event_id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(student_id),
  session_token TEXT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_events_session ON events(session_token);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_created ON events(created_at DESC);
```

## Performance Considerations

- **Asynchronous**: All logging is non-blocking - failures don't impact the user
- **Silent Failures**: Logging errors are only console.warn'd, never shown to user
- **Indexed Queries**: Database indexes on session_token and event_type for fast retrieval
- **Automatic Cleanup**: (Optional) Set up cron job to delete logs older than 90 days

## Privacy & Security

- **Session Tokens**: Use secure, non-guessable session tokens
- **Optional Email**: Email is optional - anonymous sessions are supported
- **User Agent**: Logged for debugging, not for tracking
- **GDPR Compliance**: Logs can be deleted via standard student data deletion APIs

## Common Use Cases

### 1. Debug Step Navigation Issues
Query navigation events to see exactly which steps a student completed:
```
GET /api/session-log?sessionToken=ws_123&eventType=navigation
```

### 2. Track API Failures
Find all API call errors across all students:
```
GET /api/session-log?eventType=api_call&limit=200
```

Filter for status >= 400 in your application logic.

### 3. Monitor OpenAI Key Issues
Track OpenAI validation failures:
```
GET /api/session-log?eventType=error
```

Filter for `errorType: "openai_validation_failed"`.

### 4. Analyze Student Flow
Get full timeline of a student session:
```
GET /api/session-log?sessionToken=ws_123&limit=500
```

## Adding Custom Logging

To log custom events in your workshop code:

```javascript
// Simple action log
logAction('custom_tool_configured', {
  toolName: 'weather_lookup',
  webhookUrl: 'https://api.example.com'
});

// Error with detailed context
logError('database_connection_failed', 'Connection timeout', {
  host: 'db.example.com',
  port: 5432,
  timeout: 5000
});

// API call tracking
const response = await fetch('/api/some-endpoint');
logApiCall('/api/some-endpoint', 'POST', response.status, {
  dataSize: payload.length,
  duration: Date.now() - startTime
});
```

## Querying Logs Programmatically

### JavaScript Example

```javascript
async function getStudentErrors(sessionToken) {
  const response = await fetch(
    `/api/session-log?sessionToken=${sessionToken}&eventType=error`
  );
  const data = await response.json();
  return data.events;
}

async function analyzeNavigationPattern(sessionToken) {
  const response = await fetch(
    `/api/session-log?sessionToken=${sessionToken}&eventType=navigation`
  );
  const data = await response.json();

  // Calculate average time between steps
  const events = data.events.sort((a, b) =>
    new Date(a.created_at) - new Date(b.created_at)
  );

  // Your analysis logic here
}
```

## Future Enhancements

Potential improvements to the logging system:

1. **Real-time Monitoring**: WebSocket-based live log streaming for instructors
2. **Aggregate Analytics**: Dashboard showing common error patterns across all students
3. **Alert System**: Notify instructors when students encounter critical errors
4. **Log Visualization**: Timeline view of student session progression
5. **Export Functionality**: Download logs as CSV or JSON for offline analysis

---

**Implementation Date:** October 27, 2025
**Status:** ✅ Complete and deployed
**Related Files:**
- `api/session-log.js` - API endpoint
- `public/index.html` - Client-side logging functions (lines 1326-1407)
