# Webhook Tools Documentation

## Overview

The workshop now supports connecting AI function tools to external web services via webhooks. When the AI decides to call a function, it can make an HTTP request to your webhook URL with the function arguments.

## How It Works

1. **Define a function tool** with OpenAI function calling schema
2. **Add a `webhook_url` field** to your tool configuration
3. **Deploy a webhook endpoint** that handles the function logic
4. **The AI assistant automatically calls your webhook** when the function is needed

## Tool Configuration Format

```javascript
{
  "type": "function",
  "function": {
    "name": "check_order_status",
    "description": "Check the status of a customer order",
    "webhook_url": "https://your-api.example.com/webhooks/check-order",  // ✅ NEW!
    "parameters": {
      "type": "object",
      "properties": {
        "order_id": {
          "type": "string",
          "description": "The order ID to check"
        }
      },
      "required": ["order_id"]
    }
  }
}
```

## Webhook Request Format

When the AI calls your function, your webhook will receive a POST request:

```json
{
  "tool": "check_order_status",
  "arguments": {
    "order_id": "ORD-12345"
  },
  "sessionToken": "student_session_token",
  "conversationSessionId": "conv_abc123"
}
```

## Webhook Response Format

Your webhook should return a JSON response:

```json
{
  "success": true,
  "order_id": "ORD-12345",
  "status": "shipped",
  "tracking_number": "TRACK123",
  "estimated_delivery": "2025-01-20"
}
```

The AI will receive this data and incorporate it into its response to the caller.

## Example: Complete Tool with Webhook

### 1. Tool Configuration (in workshop)

```json
{
  "type": "function",
  "function": {
    "name": "book_appointment",
    "description": "Book an appointment for a customer",
    "webhook_url": "https://your-service.com/api/appointments",
    "parameters": {
      "type": "object",
      "properties": {
        "customer_name": {
          "type": "string",
          "description": "Customer's full name"
        },
        "date": {
          "type": "string",
          "description": "Preferred date (YYYY-MM-DD)"
        },
        "time": {
          "type": "string",
          "description": "Preferred time (HH:MM)"
        },
        "phone": {
          "type": "string",
          "description": "Customer's phone number"
        }
      },
      "required": ["customer_name", "date", "time", "phone"]
    }
  }
}
```

### 2. Webhook Implementation (Node.js/Express)

```javascript
// Example webhook endpoint
app.post('/api/appointments', async (req, res) => {
  const { tool, arguments: args, sessionToken } = req.body;

  try {
    // Your business logic here
    const appointment = await bookAppointmentInDatabase({
      name: args.customer_name,
      date: args.date,
      time: args.time,
      phone: args.phone
    });

    // Return success response
    res.json({
      success: true,
      appointment_id: appointment.id,
      confirmation_code: appointment.code,
      message: `Appointment booked for ${args.customer_name} on ${args.date} at ${args.time}`
    });

  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});
```

### 3. Conversation Flow

**Caller:** "I'd like to book an appointment"

**AI:** "I'd be happy to help you book an appointment. What's your name?"

**Caller:** "John Smith"

**AI:** "Great! What date would work best for you?"

**Caller:** "January 20th at 2 PM"

**AI:** "And what's the best phone number to reach you?"

**Caller:** "555-0123"

**AI:** *[Calls webhook with collected information]*

**AI:** "Perfect! I've booked your appointment for January 20th at 2:00 PM. Your confirmation code is ABC123. You'll receive a text message reminder at 555-0123."

## Tools Without Webhooks

If you don't specify a `webhook_url`, the tool will still work but will return a simulated success message. This is useful for:
- Testing tool definitions
- Demonstrations
- Planning before implementing the webhook

## Security Best Practices

### 1. Authenticate Webhook Requests

Verify requests are coming from your workshop instance:

```javascript
app.post('/api/your-webhook', (req, res) => {
  const { sessionToken } = req.body;

  // Validate session token against your database
  if (!isValidSessionToken(sessionToken)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Process request...
});
```

### 2. Use HTTPS

Always use HTTPS URLs for webhooks:
- ✅ `https://your-api.example.com/webhook`
- ❌ `http://your-api.example.com/webhook`

### 3. Implement Timeouts

Set reasonable timeouts on your webhook endpoints (recommended: 5-10 seconds)

### 4. Handle Errors Gracefully

```javascript
try {
  const result = await yourBusinessLogic();
  res.json({ success: true, ...result });
} catch (error) {
  res.json({
    success: false,
    error: 'An error occurred processing your request',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
}
```

## Deployment Options

### Option 1: Vercel Serverless Functions

```javascript
// /api/my-tool.js
export default async function handler(req, res) {
  const { tool, arguments: args } = req.body;

  // Your logic here

  res.json({ success: true, result: 'data' });
}
```

Deploy: `vercel --prod`

Webhook URL: `https://your-project.vercel.app/api/my-tool`

### Option 2: Railway

```javascript
// server.js
const express = require('express');
const app = express();

app.use(express.json());

app.post('/webhooks/my-tool', async (req, res) => {
  // Your logic
  res.json({ success: true });
});

app.listen(process.env.PORT || 3000);
```

Deploy to Railway, get webhook URL: `https://your-service.up.railway.app/webhooks/my-tool`

### Option 3: AWS Lambda + API Gateway

Create Lambda function, expose via API Gateway, use the API Gateway URL as webhook.

## Testing Your Webhooks

### 1. Use a Local Tunnel (ngrok)

```bash
# Start your local server
node server.js

# Expose it with ngrok
ngrok http 3000

# Use the ngrok URL as your webhook_url
# https://abc123.ngrok.io/webhooks/my-tool
```

### 2. Test with curl

```bash
curl -X POST https://your-webhook.example.com/api/tool \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "my_function",
    "arguments": {"key": "value"},
    "sessionToken": "test_token"
  }'
```

### 3. Log Webhook Calls

Add logging to see what the AI is sending:

```javascript
app.post('/webhook', (req, res) => {
  console.log('Webhook called:', {
    tool: req.body.tool,
    arguments: req.body.arguments,
    timestamp: new Date().toISOString()
  });

  // Your logic...
});
```

## Example Use Cases

### 1. Order Status Lookup
- Webhook queries your order database
- Returns real-time order status
- AI communicates status to caller

### 2. Appointment Booking
- Webhook checks availability calendar
- Books appointment slot
- Returns confirmation details

### 3. Account Balance Check
- Webhook authenticates customer
- Retrieves account information
- Returns balance securely

### 4. Ticket Creation
- Webhook creates support ticket
- Returns ticket number
- Sends confirmation email

### 5. Knowledge Base Search
- Webhook queries your documentation
- Returns relevant articles
- AI summarizes information for caller

## Troubleshooting

### Webhook Not Being Called

1. **Check tool configuration** - Ensure `webhook_url` is set
2. **Check webhook endpoint** - Test with curl or Postman
3. **Check logs** - Look for errors in Vercel logs or your server logs
4. **Verify HTTPS** - Make sure you're using HTTPS, not HTTP

### Webhook Times Out

1. **Optimize your endpoint** - Should respond within 5 seconds
2. **Use async processing** - Return immediately, process in background
3. **Check network connectivity** - Ensure webhook URL is accessible

### AI Doesn't Call Tool

1. **Improve tool description** - Make it clear when to use the tool
2. **Check system prompt** - Ensure it mentions the tool capabilities
3. **Test with direct prompts** - Try "Please check my order status for ID 12345"

## Advanced: Async Tool Processing

For long-running operations:

```javascript
app.post('/webhook', async (req, res) => {
  const { tool, arguments: args } = req.body;

  // Start async process
  processToolAsync(args).catch(console.error);

  // Return immediately
  res.json({
    success: true,
    status: 'processing',
    message: 'Your request is being processed'
  });
});
```

## Need Help?

- Check the Vercel logs: `vercel logs`
- Test webhooks with [webhook.site](https://webhook.site)
- Review OpenAI function calling docs: [https://platform.openai.com/docs/guides/function-calling](https://platform.openai.com/docs/guides/function-calling)
