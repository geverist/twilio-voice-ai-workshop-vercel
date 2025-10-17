# Twilio Voice AI Workshop

An interactive, hands-on workshop for building AI-powered voice assistants with Twilio ConversationRelay and OpenAI.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- A Vercel account (free tier works!)
- GitHub account (for OAuth integration)
- Basic knowledge of JavaScript

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/twilio-voice-ai-workshop)

**Or deploy manually:**

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/twilio-voice-ai-workshop.git
cd twilio-voice-ai-workshop

# 2. Install dependencies
npm install

# 3. Install Vercel CLI (if not already installed)
npm install -g vercel

# 4. Deploy to Vercel
vercel

# Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? (select your account)
# - Link to existing project? No
# - What's your project's name? twilio-voice-ai-workshop
# - In which directory is your code located? ./
# - Want to override settings? No
```

### Configure Environment Variables

After deploying, add these environment variables in your Vercel project settings:

1. Go to your project dashboard on Vercel
2. Navigate to **Settings → Environment Variables**
3. Add the following:

```bash
# Required: GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Optional: Template Repository (defaults shown)
GITHUB_TEMPLATE_OWNER=geverist
GITHUB_TEMPLATE_REPO=conversationrelay-starter-pack
```

### Setting up GitHub OAuth App

1. Go to https://github.com/settings/developers
2. Click **New OAuth App**
3. Fill in the details:
   - **Application name**: Twilio Voice AI Workshop
   - **Homepage URL**: `https://your-project.vercel.app`
   - **Authorization callback URL**: `https://your-project.vercel.app/api/github-oauth-callback`
4. Click **Register application**
5. Copy the **Client ID** and generate a new **Client Secret**
6. Add them to your Vercel environment variables

### Local Development

```bash
# 1. Copy environment variables
cp .env.example .env

# 2. Add your GitHub OAuth credentials to .env

# 3. Start the development server
vercel dev

# Or use npm
npm run dev

# 4. Open http://localhost:3000
```

## 📚 What You'll Build

This workshop teaches you to build AI-powered voice assistants through 9 progressive exercises:

1. **Choose Your Path** - Inbound vs Outbound calling
2. **Connect Services** - Twilio + OpenAI setup
3. **Choose Call Direction** - IVR or Outbound campaigns
4. **Create TwiML Handler** - Basic call routing
5. **Deploy Functions** - Push code to your Twilio account
6. **Test Basic Call** - Make your first call
7. **Build WebSocket Handler** - Real-time AI conversation
8. **Add Tools & Knowledge** - Function calling (optional)
9. **Final Test** - Complete AI assistant

## 🏗️ Project Structure

```
twilio-voice-ai-workshop/
├── public/
│   ├── index.html              # Main workshop interface
│   └── welcome.html            # Welcome/GitHub login page
├── api/                        # Vercel Serverless Functions
│   ├── tutorial-proxy.js       # Proxies Twilio API calls
│   ├── github-oauth-init.js    # Initiates GitHub OAuth
│   ├── github-oauth-callback.js # Handles OAuth callback
│   └── github-create-repo.js   # Creates student repos
├── package.json
├── vercel.json                 # Vercel configuration
├── .env.example               # Example environment variables
└── README.md
```

## 🔧 How It Works

### Student Flow

1. **GitHub Authentication** - Students log in with GitHub OAuth
2. **Repository Creation** - Each student gets their own repo from template
3. **Interactive Learning** - 9 guided exercises with live validation
4. **Real Testing** - Students make actual Twilio API calls
5. **Deploy & Test** - Deploy to their own Twilio account

### Security Model

- **No hardcoded credentials** - Students use their own Twilio accounts
- **API Proxy** - Backend proxies Twilio API calls for validation
- **Session Management** - GitHub tokens passed securely
- **CORS Protection** - Configured for your domain only

## 🎯 Features

### For Students

- ✅ Interactive code editor with syntax validation
- ✅ Real-time progress tracking
- ✅ Live API testing with actual Twilio calls
- ✅ Automatic GitHub repository creation
- ✅ **Demo Mode** - Try the workshop without credentials
- ✅ Resume from where you left off

### For Instructors

- ✅ No manual setup required for students
- ✅ Track student progress
- ✅ Students keep their own repository
- ✅ Easy to update and deploy
- ✅ Free hosting on Vercel

## 🔌 API Endpoints

### `/api/tutorial-proxy`

Proxies Twilio API calls using student credentials.

**Supported actions:**
- `validateCredentials` - Verify Twilio Account SID/Auth Token
- `listPhoneNumbers` - Get student's phone numbers
- `makeCall` - Initiate outbound call
- `getCall` - Retrieve call status
- `provisionPhoneNumber` - Purchase new number
- `createMessagingService` - Set up messaging
- `createSyncService` - Create Sync service
- `setupComplete` - Verify all services ready

### `/api/github-oauth-init`

Initiates GitHub OAuth flow for repository creation.

### `/api/github-oauth-callback`

Handles GitHub OAuth redirect and token exchange.

### `/api/github-create-repo`

Creates a new repository in student's GitHub account from template.

## 🔐 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_CLIENT_ID` | ✅ | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | ✅ | GitHub OAuth App Client Secret |
| `GITHUB_TEMPLATE_OWNER` | ⚠️ | GitHub username of template repo owner (default: geverist) |
| `GITHUB_TEMPLATE_REPO` | ⚠️ | Template repository name (default: conversationrelay-starter-pack) |

## 🚢 Deployment Options

### Option 1: Vercel (Recommended)

- **Pros**: Free, fast, easy, built-in serverless functions
- **Cons**: None for this use case

```bash
vercel --prod
```

### Option 2: Netlify

Update functions to Netlify format and deploy:

```bash
netlify deploy --prod
```

### Option 3: Self-Hosted

Run on any Node.js server with a reverse proxy (Nginx/Apache).

## 🔄 Updating the Workshop

1. Make changes to `public/index.html` or API functions
2. Commit and push to GitHub
3. Vercel will automatically redeploy

Or deploy manually:

```bash
git add .
git commit -m "Update workshop content"
git push origin main
vercel --prod
```

## 🐛 Troubleshooting

### GitHub OAuth Not Working

- Verify callback URL matches exactly in GitHub OAuth App settings
- Check that `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set in Vercel
- Ensure OAuth App is not suspended

### API Calls Failing

- Verify CORS headers are configured in `vercel.json`
- Check browser console for specific error messages
- Test API endpoints directly using curl or Postman

### Template Repository Not Found

- Ensure `GITHUB_TEMPLATE_OWNER` and `GITHUB_TEMPLATE_REPO` are correct
- Verify the template repository exists and is public
- Check that the template has "Template repository" enabled in GitHub settings

## 📖 Documentation

- [Twilio ConversationRelay](https://www.twilio.com/docs/voice/conversation-relay)
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [GitHub OAuth Apps](https://docs.github.com/en/apps/oauth-apps)

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - feel free to use this workshop for your own training sessions!

## 💬 Support

- Issues: [GitHub Issues](https://github.com/YOUR_USERNAME/twilio-voice-ai-workshop/issues)
- Documentation: [Workshop Guide](https://github.com/YOUR_USERNAME/twilio-voice-ai-workshop/wiki)

---

Built with ❤️ for the Twilio community
