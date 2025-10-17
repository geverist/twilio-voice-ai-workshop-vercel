# Deployment Guide for Twilio Voice AI Workshop on Vercel

## Quick Deploy (You Already Have Vercel Account!)

### Step 1: Initialize Git Repository

```bash
cd "/Users/geverist/Documents/Twilio Dev/twilio-voice-ai-workshop-vercel"

git init
git add .
git commit -m "Initial commit: Twilio Voice AI Workshop for Vercel"
```

### Step 2: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `twilio-voice-ai-workshop`
3. Description: "Interactive workshop for building AI voice assistants with Twilio"
4. **Public** (so students can see it)
5. Don't initialize with README (we already have one)
6. Click **Create repository**

### Step 3: Push to GitHub

```bash
git remote add origin https://github.com/geverist/twilio-voice-ai-workshop.git
git branch -M main
git push -u origin main
```

### Step 4: Deploy to Vercel

Since you already have a Vercel account, this is super easy:

```bash
# Install Vercel CLI if not installed
npm install -g vercel

# Deploy (from the project directory)
vercel

# Follow prompts:
# ? Set up and deploy? Y
# ? Which scope? (select your Vercel account)
# ? Link to existing project? N
# ? What's your project's name? twilio-voice-ai-workshop
# ? In which directory is your code located? ./
# ? Want to override the settings? N
```

Vercel will give you a URL like: `https://twilio-voice-ai-workshop-xxx.vercel.app`

### Step 5: Configure GitHub OAuth App

1. Go to https://github.com/settings/developers
2. Click **New OAuth App**
3. Fill in:
   - **Application name**: `Twilio Voice AI Workshop`
   - **Homepage URL**: `https://twilio-voice-ai-workshop-xxx.vercel.app` (your Vercel URL)
   - **Authorization callback URL**: `https://twilio-voice-ai-workshop-xxx.vercel.app/api/github-oauth-callback`
4. Click **Register application**
5. **Copy the Client ID**
6. Click **Generate a new client secret** and copy it

### Step 6: Add Environment Variables to Vercel

**Option A: Via Vercel Dashboard (Recommended)**

1. Go to https://vercel.com/dashboard
2. Select your `twilio-voice-ai-workshop` project
3. Go to **Settings** → **Environment Variables**
4. Add these variables:

```
GITHUB_CLIENT_ID = <paste your Client ID>
GITHUB_CLIENT_SECRET = <paste your Client Secret>
GITHUB_TEMPLATE_OWNER = geverist
GITHUB_TEMPLATE_REPO = conversationrelay-starter-pack
```

5. Click **Save**

**Option B: Via CLI**

```bash
vercel env add GITHUB_CLIENT_ID
# Paste your Client ID when prompted

vercel env add GITHUB_CLIENT_SECRET
# Paste your Client Secret when prompted

vercel env add GITHUB_TEMPLATE_OWNER
# Enter: geverist

vercel env add GITHUB_TEMPLATE_REPO
# Enter: conversationrelay-starter-pack
```

### Step 7: Redeploy with Environment Variables

```bash
vercel --prod
```

This will deploy to production with your environment variables.

### Step 8: Test Your Workshop!

1. Visit your Vercel URL: `https://twilio-voice-ai-workshop-xxx.vercel.app`
2. You should see the workshop welcome page
3. Click "Continue with GitHub" to test OAuth
4. You should be redirected to GitHub, then back to your workshop

## 🎉 Done!

Your workshop is now live at: `https://twilio-voice-ai-workshop-xxx.vercel.app`

### Next Steps

1. **Share with students**: Send them your Vercel URL
2. **Test demo mode**: Try the workshop in demo mode (no credentials needed)
3. **Test live mode**: Use your actual Twilio credentials to test API calls
4. **Monitor**: Check Vercel dashboard for function logs and analytics

## Updating the Workshop

Whenever you make changes:

```bash
git add .
git commit -m "Update workshop content"
git push

# Vercel will automatically redeploy!
# Or manually trigger:
vercel --prod
```

## Custom Domain (Optional)

Want a custom domain like `workshop.yourdomain.com`?

1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Add your custom domain
3. Follow Vercel's DNS configuration instructions
4. Update GitHub OAuth App callback URL to use new domain

## Troubleshooting

### "Origin not allowed" CORS error

- Check `vercel.json` has correct CORS headers
- Redeploy after making changes

### GitHub OAuth fails

- Verify callback URL in GitHub OAuth App matches your Vercel URL exactly
- Check environment variables are set correctly
- Look at Vercel function logs for errors

### API calls not working

- Check Vercel function logs: `vercel logs`
- Verify Twilio credentials are valid
- Test API endpoints directly: `curl https://your-app.vercel.app/api/tutorial-proxy`

### Template repo not found

- Ensure `conversationrelay-starter-pack` repo exists and is public
- Check that it's enabled as a template repository
- Verify `GITHUB_TEMPLATE_OWNER` and `GITHUB_TEMPLATE_REPO` are correct

## Performance Monitoring

Vercel provides built-in analytics:

1. Go to your project dashboard
2. Click **Analytics** tab
3. Monitor:
   - Page views
   - Function invocations
   - Errors
   - Performance

## Cost

**Vercel Free Tier includes:**
- Unlimited deployments
- 100GB bandwidth/month
- 100 serverless function invocations/day
- Custom domains

This should be more than enough for workshop use!

If you need more, Vercel Pro is $20/month.

---

Questions? Check the main README.md or open an issue on GitHub!
