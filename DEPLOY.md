# Deployment Guide

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Vercel    │────▶│   Railway   │────▶│ PostgreSQL  │
│  (Frontend) │     │  (Backend)  │     │  (Railway)  │
└─────────────┘     └─────────────┘     └─────────────┘
```

## Project Structure (Monorepo)

```
milestone-tracker/
├── client/              # Frontend (React + Vite)
│   ├── api/
│   ├── components/
│   ├── contexts/
│   ├── hooks/
│   ├── App.tsx
│   ├── index.tsx
│   ├── package.json
│   └── vite.config.ts
├── server/              # Backend (Express + Prisma)
│   ├── prisma/
│   ├── src/
│   ├── package.json
│   └── railway.json
└── .github/workflows/
```

## 1. GitHub Repository Setup

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/milestone-tracker.git
git push -u origin main
```

## 2. Backend - Railway

### 2.1 Create Railway Project

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will auto-detect the `server/` folder

### 2.2 Add PostgreSQL

1. In your Railway project, click "New" → "Database" → "PostgreSQL"
2. Railway automatically sets `DATABASE_URL`

### 2.3 Configure Environment Variables

In Railway dashboard → Variables, add:

```
SESSION_SECRET=<generate-random-string>
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GITHUB_CLIENT_ID=<your-github-client-id>
GITHUB_CLIENT_SECRET=<your-github-client-secret>
CLIENT_URL=https://your-app.vercel.app
NODE_ENV=production
```

### 2.4 Set Root Directory

In Railway Settings → Set "Root Directory" to `server`

### 2.5 Get Backend URL

After deployment, copy your Railway URL (e.g., `https://your-app.up.railway.app`)

## 3. Frontend - Vercel

### 3.1 Import Project

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "Add New" → "Project"
3. Import your GitHub repository

### 3.2 Configure Build Settings

- **Framework Preset**: Vite
- **Root Directory**: `client`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

### 3.3 Environment Variables

Add in Vercel dashboard:

```
VITE_API_URL=https://your-app.up.railway.app
```

### 3.4 Deploy

Click "Deploy" - Vercel will build and deploy automatically.

## 4. OAuth Callback URLs

Update your OAuth apps with production URLs:

### Google Cloud Console

- Authorized redirect URIs:
  - `https://your-app.up.railway.app/auth/google/callback`

### GitHub Developer Settings

- Authorization callback URL:
  - `https://your-app.up.railway.app/auth/github/callback`

## 5. CI/CD - Automatic Deployments

Both Vercel and Railway auto-deploy on push to `main`:

```
git push origin main
  │
  ├─▶ GitHub Actions (lint, type-check)
  │
  ├─▶ Vercel (frontend build & deploy)
  │
  └─▶ Railway (backend build & deploy)
```

## Troubleshooting

### CORS Errors

Ensure `CLIENT_URL` in Railway matches your Vercel URL exactly.

### OAuth Redirect Issues

1. Check callback URLs in Google/GitHub OAuth settings
2. Ensure URLs use HTTPS in production

### Database Connection

Railway provides `DATABASE_URL` automatically. If issues persist:

```bash
# In Railway shell
npx prisma db push
```

## Local Development

```bash
# Terminal 1 - Frontend
cd client && npm run dev

# Terminal 2 - Backend
cd server && npm run dev
```

## Costs

- **Vercel**: Free (Hobby tier)
- **Railway**: $5 free credit/month (usually enough for small projects)
- **Total**: $0/month for personal use
