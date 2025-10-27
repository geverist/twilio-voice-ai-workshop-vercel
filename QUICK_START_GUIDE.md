# Quick Start Guide: New Workshop Features

## 🎯 Use Cases (Pre-built AI Templates)

**What it does:** Instantly deploy pre-configured AI assistants for common scenarios.

**How to use:**
1. Click **🎯 Use Cases** button in the toolbar
2. Browse 5 available templates:
   - 📞 **Customer Support Assistant** - Help desk with knowledge base
   - 📅 **Appointment Booking Agent** - Schedule meetings automatically
   - 📋 **Survey & Feedback Collector** - Gather customer feedback
   - 🍽️ **Restaurant Reservation System** - Book tables and check availability
   - 💬 **General Purpose Assistant** - Flexible conversational AI
3. Click any template to see details
4. Customize the prompt, greeting, and voice (optional)
5. Click **Activate This Use Case**
6. Your workshop is now using the template!

**Benefits:**
- ✅ Start in seconds instead of writing prompts from scratch
- ✅ Proven templates with best practices
- ✅ Easily customize for your specific needs
- ✅ Switch between use cases anytime

---

## 💬 Conversation History (Call Transcripts & Analytics)

**What it does:** View all your AI phone conversations with full transcripts.

**How to use:**
1. Click **💬 History** button in the toolbar
2. See your dashboard:
   - Total calls made
   - Average call duration
   - Average conversation turns
3. Click **View Transcript** on any call to see full conversation
4. Review what users asked and how your AI responded

**Use it for:**
- 🔍 Debugging - See exactly what went wrong in a call
- 📊 Analysis - Understand user behavior patterns
- ✏️ Improvement - Identify where your prompt needs work
- 📈 Metrics - Track conversation quality over time

**Pro tip:** If a caller reports an issue, check the transcript to see the exact conversation flow!

---

## 🔄 VXML Converter (Legacy IVR Migration)

**What it does:** Convert old VoiceXML IVR systems to modern AI prompts using GPT-4.

**How to use:**
1. Click **🔄 VXML** button in the toolbar
2. Upload your VXML file (drag & drop) OR paste VXML code
3. Click **Load Sample VXML** to try with example
4. Click **Convert to AI Prompt**
5. AI analyzes your IVR and generates:
   - 📝 System prompt that replicates the IVR behavior
   - 👋 Greeting message
   - 🔧 Suggested function tools (if needed)
   - 📊 Analysis of menu options and logic
6. Click **Copy System Prompt** to use in Step 2
7. OR click **Apply to Workshop** to automatically update

**Perfect for:**
- 🏢 Companies with existing IVR systems
- ⏰ Quickly modernizing legacy phone trees
- 🎓 Learning AI prompt design from IVR examples
- 🔄 Comparing traditional vs AI approaches

**Example transformation:**
```
❌ OLD: "Press 1 for sales, press 2 for support, press 3 for billing"
✅ NEW: "How can I help you today? I can help with sales, support, or billing questions."
```

---

## 🔗 Webhook Tools (Connect to External Services)

**What it does:** Let your AI call external APIs to perform real actions (check orders, book appointments, query databases, etc.)

**How to use:**

### Step 1: Define Your Tool (in Step 2: Customize Prompts)
Add a function tool with a `webhook_url`:

```json
{
  "type": "function",
  "function": {
    "name": "check_order_status",
    "description": "Check the status of a customer order",
    "webhook_url": "https://your-api.example.com/webhooks/check-order",
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

### Step 2: Deploy Your Webhook Endpoint

**Option A - Vercel Serverless (Easiest):**
```javascript
// /api/check-order.js
export default async function handler(req, res) {
  const { tool, arguments: args } = req.body;

  // Your business logic here
  const orderStatus = await lookupOrder(args.order_id);

  res.json({
    success: true,
    order_id: args.order_id,
    status: orderStatus
  });
}
```

Deploy: `vercel --prod`

**Option B - Railway (Node.js server):**
```javascript
const express = require('express');
const app = express();
app.use(express.json());

app.post('/webhooks/check-order', async (req, res) => {
  const { tool, arguments: args } = req.body;

  // Your logic
  res.json({ success: true, status: 'shipped' });
});

app.listen(process.env.PORT || 3000);
```

Deploy to Railway, get URL like: `https://your-service.up.railway.app`

### Step 3: Test It!
1. Make a test call to your workshop number
2. Say: "Can you check my order status for order 12345?"
3. AI automatically calls your webhook
4. AI speaks the result back to the caller

**Your webhook receives:**
```json
{
  "tool": "check_order_status",
  "arguments": {
    "order_id": "12345"
  },
  "sessionToken": "your_session_token",
  "conversationSessionId": "conv_abc123"
}
```

**Your webhook should return:**
```json
{
  "success": true,
  "order_id": "12345",
  "status": "shipped",
  "tracking_number": "TRACK123",
  "estimated_delivery": "2025-01-25"
}
```

### Common Use Cases:
- 🔍 **Order lookup** - Check order status from your database
- 📅 **Booking** - Reserve appointments in your calendar
- 💳 **Account info** - Retrieve customer account details
- 🎫 **Ticket creation** - Create support tickets in your system
- 📧 **Email/SMS** - Send notifications via external services
- 🔐 **Authentication** - Verify customer identity
- 📊 **Data queries** - Search your knowledge base or docs

**Testing without deploying:**
Use [ngrok](https://ngrok.com) to expose your local server:
```bash
ngrok http 3000
# Use the ngrok URL as your webhook_url
```

**Full documentation:** See [WEBHOOK_TOOLS.md](WEBHOOK_TOOLS.md) for complete guide with security best practices.

---

## 🎓 Pro Tips

### Tip 1: Combine Features
1. Start with a **Use Case template** (saves time)
2. Customize it with **VXML converter** (migrate existing logic)
3. Add **Webhook tools** (connect to your systems)
4. Review **Conversation History** (debug and improve)

### Tip 2: Iterate Based on Transcripts
- Make test calls
- Review conversation history
- Identify where AI gets confused
- Update your system prompt
- Test again

### Tip 3: Start Simple with Tools
- First: Define tools WITHOUT webhooks (simulated mode)
- Test that AI calls them correctly
- Then: Add webhook_url and implement the actual logic

### Tip 4: Security for Webhooks
- ✅ Always use HTTPS
- ✅ Validate the sessionToken from request body
- ✅ Set timeouts (5-10 seconds max)
- ✅ Handle errors gracefully
- ✅ Never expose sensitive data in tool descriptions

### Tip 5: Optimize Your Prompts for Voice
```
❌ BAD: "Thank you for contacting our customer service department.
         I'm an AI assistant powered by advanced language models..."

✅ GOOD: "Hi! I'm here to help. What can I do for you today?"
```

Keep it:
- **Brief** - People speak faster than they read
- **Conversational** - Natural language, not formal text
- **Clear** - Simple words, no jargon
- **Actionable** - Guide users on what to do next

---

## 🆘 Troubleshooting

### "Use Cases button does nothing"
- Complete Step 1 (Connect Accounts) first
- Make sure you have a valid session token

### "No conversations showing in History"
- Make at least one test call first
- Conversations only save when using your session token (not demo mode)

### "VXML conversion failed"
- Check that your OpenAI API key is configured in Step 1
- Verify your VXML is valid XML
- Try the sample VXML to test if conversion works

### "Webhook not being called"
- Check tool definition has `webhook_url` field
- Verify webhook URL is accessible (test with curl)
- Check Vercel logs: `vercel logs`
- Make sure webhook returns valid JSON
- Review WEBHOOK_TOOLS.md troubleshooting section

### "AI doesn't use my tool"
- Improve the tool description to be more specific
- Mention the tool capabilities in your system prompt
- Test with direct phrases like "check my order status for 12345"

---

## 📚 Additional Resources

- **Workshop Help**: Click ❓ Help button in toolbar
- **Webhook Guide**: [WEBHOOK_TOOLS.md](WEBHOOK_TOOLS.md)
- **Implementation Details**: [STATEFUL_PROMPTING_IMPLEMENTATION.md](STATEFUL_PROMPTING_IMPLEMENTATION.md)
- **Twilio ConversationRelay Docs**: https://www.twilio.com/docs/voice/conversationrelay
- **OpenAI Function Calling**: https://platform.openai.com/docs/guides/function-calling

---

## 🚀 Next Steps

1. ✅ **Try a Use Case** - Click 🎯 and activate a template
2. ✅ **Make a Test Call** - Call your workshop number
3. ✅ **Check the Transcript** - Click 💬 to review
4. ✅ **Add a Webhook Tool** - Connect to a real service
5. ✅ **Convert a VXML** - Try the converter with sample IVR

**Happy building! 🎉**

---

*Questions? Check the Help panel or review the documentation files in your workshop directory.*
