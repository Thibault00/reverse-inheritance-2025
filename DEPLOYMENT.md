# 🚀 Railway Deployment Guide

## Overview

Deploy both frontend and backend as separate Railway services from the same repository.

## 📋 Prerequisites

1. Railway account (railway.app)
2. GitHub repository pushed
3. Railway CLI installed: `npm install -g @railway/cli`

## 🏗️ Deployment Steps

### 1. Create Railway Project

```bash
railway login
railway new
# Choose: "Deploy from GitHub repo"
# Select your repository
```

### 2. Add PostgreSQL Database

```bash
railway add postgresql
# This creates a $DATABASE_URL environment variable
```

### 3. Deploy Backend Service

```bash
# In Railway dashboard:
# 1. Click "New Service"
# 2. Choose "GitHub Repo"
# 3. Select your repo
# 4. Set service name: "backend"
# 5. Set root directory: "backend"
# 6. Environment variables:
#    - PYTHONPATH=/app/backend
#    - DATABASE_URL=${{Postgres.DATABASE_URL}}
```

### 4. Deploy Frontend Service

```bash
# In Railway dashboard:
# 1. Click "New Service"
# 2. Choose "GitHub Repo"
# 3. Select your repo
# 4. Set service name: "frontend"
# 5. Set root directory: "." (project root)
# 6. Environment variables:
#    - NODE_ENV=production
#    - NEXT_PUBLIC_API_URL=https://your-backend-url.railway.app
```

## 🔧 Service Configuration

### Backend Service:

- **Build Command**: `cd backend && pip install -r requirements.txt`
- **Start Command**: `cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Root Directory**: `backend`

### Frontend Service:

- **Build Command**: `npm run build` (automatic)
- **Start Command**: `npm start` (automatic)
- **Root Directory**: `.` (project root)

## 🌐 Environment Variables

### Backend:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
PYTHONPATH=/app/backend
```

### Frontend:

```
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://your-backend-domain.railway.app
```

## 📊 Database Setup

Railway will automatically run your database migrations. Make sure your `database/init.sql` is properly configured.

## 🔄 Auto-Deployment

Both services will auto-deploy when you push to your main branch.

## 🔗 URLs

- Frontend: `https://your-frontend-domain.railway.app`
- Backend API: `https://your-backend-domain.railway.app`
- Backend Docs: `https://your-backend-domain.railway.app/docs`

## 🐛 Troubleshooting

- Check Railway logs for each service
- Verify environment variables are set correctly
- Ensure database connection string is working
- Check that CORS allows your frontend domain
