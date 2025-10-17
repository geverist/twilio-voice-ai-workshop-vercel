# Pre-Deployment Checklist

## ✅ What's Already Done

- [x] **Repository structure created**
  - `public/` directory with workshop HTML
  - `api/` directory with serverless functions
  - Configuration files (package.json, vercel.json)

- [x] **Backend functions ported to Vercel**
  - `api/tutorial-proxy.js` - Twilio API proxy (12 actions)
  - `api/github-oauth-init.js` - OAuth initialization
  - `api/github-oauth-callback.js` - OAuth callback handler
  - `api/github-create-repo.js` - Repository creation

- [x] **Frontend updated**
  - API endpoints changed from `/tutorial-proxy` → `/api/tutorial-proxy`
  - All GitHub OAuth endpoints updated
  - HTML files copied and ready

- [x] **Configuration files**
  - `package.json` with dependencies (twilio)
  - `vercel.json` with routing and CORS
  - `.env.example` with required variables
  - `.gitignore` for clean commits

- [x] **Documentation**
  - `README.md` - Complete workshop documentation
  - `DEPLOYMENT.md` - Step-by-step deployment guide
  - `MIGRATION-NOTES.md` - What changed from Twilio Serverless
  - `GET-STARTED.md` - Quick start guide (this file!)
  - `CHECKLIST.md` - Pre-deployment checklist

## 📋 What You Need To Do

### 1. Git & GitHub Setup

```bash
# In terminal:
cd "/Users/geverist/Documents/Twilio Dev/twilio-voice-ai-workshop-vercel"

# Initialize git
git init
git add .
git commit -m "Initial commit: Twilio Voice AI Workshop for Vercel"

# Create GitHub repo at: https://github.com/new
# Name: twilio-voice-ai-workshop
# Public: Yes
# Then push:
git remote add origin https://github.com/geverist/twilio-voice-ai-workshop.git
git branch -M main
git push -u origin main
```

- [ ] Git initialized
- [ ] GitHub repository created
- [ ] Code pushed to GitHub

### 2. Vercel Deployment

```bash
# Deploy to Vercel (you already have account)
vercel

# Answer prompts:
# - Set up and deploy? Y
# - Scope? (your account)
# - Link to existing project? N
# - Project name? twilio-voice-ai-workshop
# - Directory? ./
# - Override settings? N
```

**Copy your Vercel URL:** `https://twilio-voice-ai-workshop-xxx.vercel.app`

- [ ] Deployed to Vercel
- [ ] URL copied

### 3. GitHub OAuth App Setup

1. Go to: https://github.com/settings/developers
2. Click **New OAuth App**
3. Fill in:
   - **Name**: Twilio Voice AI Workshop
   - **Homepage URL**: `https://twilio-voice-ai-workshop-xxx.vercel.app`
   - **Callback URL**: `https://twilio-voice-ai-workshop-xxx.vercel.app/api/github-oauth-callback`
4. Register app
5. **Copy Client ID**
6. **Generate and copy Client Secret**

- [ ] OAuth App created
- [ ] Client ID copied
- [ ] Client Secret generated and copied

### 4. Vercel Environment Variables

Go to: https://vercel.com/dashboard
→ Select "twilio-voice-ai-workshop"
→ Settings
→ Environment Variables

Add these 4 variables:

| Name | Value | Environment |
|------|-------|-------------|
| `GITHUB_CLIENT_ID` | (paste Client ID) | Production |
| `GITHUB_CLIENT_SECRET` | (paste Client Secret) | Production |
| `GITHUB_TEMPLATE_OWNER` | `geverist` | Production |
| `GITHUB_TEMPLATE_REPO` | `conversationrelay-starter-pack` | Production |

- [ ] GITHUB_CLIENT_ID added
- [ ] GITHUB_CLIENT_SECRET added
- [ ] GITHUB_TEMPLATE_OWNER added
- [ ] GITHUB_TEMPLATE_REPO added

### 5. Redeploy with Environment Variables

```bash
vercel --prod
```

Wait for deployment to complete (~30 seconds)

- [ ] Redeployed to production

### 6. Testing

Visit your Vercel URL and test:

**Basic Tests:**
- [ ] Homepage loads (`/`)
- [ ] Welcome page loads (`/welcome.html`)
- [ ] No console errors

**GitHub OAuth Flow:**
- [ ] Click "Continue with GitHub"
- [ ] Redirects to GitHub login
- [ ] After authorizing, redirects back to workshop
- [ ] URL contains `github_token` and `github_user` parameters

**Demo Mode:**
- [ ] Click "Start Demo Mode"
- [ ] Workshop loads without credentials
- [ ] Can navigate through steps
- [ ] Validation works
- [ ] Test calls simulate (don't actually call)

**Live Mode (with your Twilio credentials):**
- [ ] Enter Account SID and Auth Token
- [ ] Credentials validate
- [ ] Phone numbers load
- [ ] Can progress through steps

**Repository Creation:**
- [ ] After GitHub OAuth, repo section shows
- [ ] Click "Create Repository"
- [ ] Repository created in your GitHub account
- [ ] Confirmation message shows

### 7. Final Checks

- [ ] Vercel function logs show no errors
- [ ] CORS working (no browser console errors)
- [ ] All API endpoints responding
- [ ] GitHub OAuth flow complete
- [ ] Repository creation working

### 8. Share with Students!

Your workshop is ready! Share this URL:
`https://twilio-voice-ai-workshop-xxx.vercel.app`

- [ ] URL shared with students
- [ ] Instructions sent
- [ ] Ready for workshop!

## 🐛 Troubleshooting

### "Origin not allowed" Error
- Check `vercel.json` CORS configuration
- Redeploy: `vercel --prod`

### GitHub OAuth Fails
- Verify callback URL matches exactly in GitHub settings
- Check environment variables in Vercel
- View function logs: `vercel logs`

### API Calls Fail
- Check Twilio credentials are valid
- Verify function logs for specific errors
- Test endpoint directly: `curl https://your-url.vercel.app/api/tutorial-proxy`

### Template Repo Not Found
- Ensure `conversationrelay-starter-pack` exists and is public
- Check it's marked as a template repository
- Verify `GITHUB_TEMPLATE_OWNER` is correct

## 📊 Monitoring

View deployment info:
```bash
vercel logs                    # View function logs
vercel ls                      # List deployments
vercel inspect                 # Inspect current deployment
```

Vercel Dashboard:
- Analytics: https://vercel.com/dashboard/analytics
- Function logs: https://vercel.com/dashboard → Project → Functions
- Deployment history: https://vercel.com/dashboard → Project → Deployments

## 🎉 Success!

Once all checkboxes are checked, your workshop is LIVE!

Students can now:
1. Visit your Vercel URL
2. Authenticate with GitHub
3. Get their own repository
4. Complete the workshop
5. Deploy to their own Twilio account

---

**Questions?** Check the other documentation files:
- Quick start: `GET-STARTED.md`
- Full docs: `README.md`
- Deploy details: `DEPLOYMENT.md`
- Migration notes: `MIGRATION-NOTES.md`
