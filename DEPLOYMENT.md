# VoucherVault - Render Deployment Guide

Complete step-by-step guide to deploy VoucherVault on Render (FREE hosting).

## 📋 Prerequisites

1. **GitHub Account** - [github.com](https://github.com)
2. **Render Account** - [render.com](https://render.com) (sign up free)
3. **MongoDB Atlas Account** - [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) (free tier)

---

## Step 1: Set Up MongoDB Atlas (Database)

### 1.1 Create Free Cluster
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up / Log in
3. Click **"Build a Database"**
4. Select **"M0 FREE"** tier
5. Choose cloud provider (AWS recommended)
6. Choose region closest to you
7. Name your cluster: `vouchervault-cluster`
8. Click **"Create"**

### 1.2 Configure Access
1. **Database Access**:
   - Click "Database Access" in left sidebar
   - Click "+ Add New Database User"
   - Choose "Password" authentication
   - Username: `vouchervault_user`
   - Password: Generate strong password (save it!)
   - Database User Privileges: "Read and write to any database"
   - Click "Add User"

2. **Network Access**:
   - Click "Network Access" in left sidebar
   - Click "+ Add IP Address"
   - Click "Allow Access from Anywhere"
   - IP Address: `0.0.0.0/0`
   - Click "Confirm"
   - ⚠️ **Note**: For production, restrict to specific IPs

### 1.3 Get Connection String
1. Click "Database" in left sidebar
2. Click "Connect" on your cluster
3. Choose "Connect your application"
4. Driver: **Python** | Version: **3.12 or later**
5. Copy connection string (looks like):
   ```
   mongodb+srv://vouchervault_user:<password>@vouchervault-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<password>` with your actual password
7. **Save this connection string** - you'll need it!

---

## Step 2: Push Code to GitHub

### Option A: Using Emergent's Save to GitHub
1. Click your **profile icon** in Emergent
2. Click **"Connect GitHub"** (if not already connected)
3. Authorize Emergent
4. Click **"Save to GitHub"** button in chat
5. Create new repository: `vouchervault`
6. Click **"PUSH TO GITHUB"**
7. ✅ Done!

### Option B: Manual Git Commands
```bash
cd /app
git init
git add .
git commit -m "Initial commit: VoucherVault app"
git remote add origin https://github.com/YOUR_USERNAME/vouchervault.git
git branch -M main
git push -u origin main
```

---

## Step 3: Deploy Backend on Render

### 3.1 Create Web Service
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Select **"vouchervault"** repo

### 3.2 Configure Backend Service
Fill in the form:

**Basic Settings:**
- **Name**: `vouchervault-backend`
- **Region**: Choose closest to you
- **Branch**: `main`
- **Root Directory**: `backend`
- **Runtime**: `Python 3`
- **Build Command**: 
  ```
  pip install -r requirements.txt
  ```
- **Start Command**:
  ```
  uvicorn server:app --host 0.0.0.0 --port $PORT
  ```

### 3.3 Set Environment Variables
Click **"Advanced"** → **"Add Environment Variable"**

Add these one by one:

| Key | Value |
|-----|-------|
| `MONGO_URL` | Your MongoDB Atlas connection string from Step 1.3 |
| `DB_NAME` | `vouchervault_db` |
| `CORS_ORIGINS` | `*` (will update after frontend deployed) |
| `EMERGENT_LLM_KEY` | `sk-emergent-b8036B80a4eD630352` |
| `GOOGLE_CLIENT_ID` | `your-client-id.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | `your-secret` (leave placeholder for now) |

### 3.4 Deploy Backend
1. **Plan**: Select **"Free"**
2. Click **"Create Web Service"**
3. Wait for deployment (3-5 minutes)
4. Once deployed, copy your backend URL:
   - Format: `https://vouchervault-backend.onrender.com`
   - **Save this URL!**

---

## Step 4: Deploy Frontend on Render

### 4.1 Create Static Site
1. In Render Dashboard, click **"New +"** → **"Static Site"**
2. Select same **"vouchervault"** repo

### 4.2 Configure Frontend Service
Fill in the form:

**Basic Settings:**
- **Name**: `vouchervault-frontend`
- **Branch**: `main`
- **Root Directory**: `frontend`
- **Build Command**:
  ```
  yarn install && yarn build
  ```
- **Publish Directory**: `build`

### 4.3 Set Environment Variable
Click **"Advanced"** → **"Add Environment Variable"**

| Key | Value |
|-----|-------|
| `REACT_APP_BACKEND_URL` | Your backend URL from Step 3.4 (e.g., `https://vouchervault-backend.onrender.com`) |

### 4.4 Deploy Frontend
1. **Plan**: Select **"Free"**
2. Click **"Create Static Site"**
3. Wait for deployment (5-7 minutes)
4. Once deployed, you'll get your frontend URL:
   - Format: `https://vouchervault-frontend.onrender.com`

---

## Step 5: Update CORS Settings

### 5.1 Update Backend Environment Variable
1. Go to your **backend service** in Render
2. Click **"Environment"** tab
3. Find `CORS_ORIGINS` variable
4. Update value to your frontend URL:
   ```
   https://vouchervault-frontend.onrender.com
   ```
5. Click **"Save Changes"**
6. Service will auto-redeploy

---

## Step 6: Test Your Deployment

### 6.1 Open Your App
1. Visit your frontend URL: `https://vouchervault-frontend.onrender.com`
2. App should load (may take 30-60 seconds on first load - free tier sleeps)

### 6.2 Test Core Features
1. ✅ **Add a voucher** manually
2. ✅ **View voucher list**
3. ✅ **Check statistics** are updating
4. ✅ **Open settings** and verify it loads
5. ✅ **Try scan feature** (upload an image)

### 6.3 Common Issues

**Problem**: Backend takes long to respond
- **Solution**: Free tier sleeps after 15 min inactivity. First request wakes it up (30-60 sec)

**Problem**: CORS errors in console
- **Solution**: Double-check `CORS_ORIGINS` has correct frontend URL

**Problem**: MongoDB connection error
- **Solution**: 
  - Verify connection string has correct password
  - Check Network Access allows `0.0.0.0/0`
  - Ensure Database User exists

**Problem**: Scan feature not working
- **Solution**: `EMERGENT_LLM_KEY` must be valid

---

## Step 7: Optional - Custom Domain

### 7.1 Add Custom Domain to Frontend
1. Go to your frontend service in Render
2. Click **"Settings"** → **"Custom Domain"**
3. Click **"Add Custom Domain"**
4. Enter your domain: `vouchervault.com`
5. Update DNS records as instructed by Render
6. Wait for SSL certificate (automatic)

### 7.2 Update Backend CORS
1. Update `CORS_ORIGINS` to include custom domain:
   ```
   https://vouchervault.com
   ```

---

## 🎉 Deployment Complete!

Your VoucherVault app is now live on Render!

### Your URLs:
- **Frontend**: `https://vouchervault-frontend.onrender.com`
- **Backend API**: `https://vouchervault-backend.onrender.com`
- **Database**: MongoDB Atlas (managed)

### Important Notes:

**Free Tier Limitations:**
- ⏰ Services sleep after 15 min inactivity
- 🔄 Wakes up on first request (~30-60 sec)
- 💾 750 hours/month free (enough for one service 24/7)
- 📦 MongoDB: 512MB storage (5,000+ vouchers)

**Upgrading:**
- Backend to Starter plan: $7/month (no sleep)
- Frontend always free on Render
- MongoDB: Free tier sufficient for most users

### Monitoring:
- Check logs in Render dashboard: **Services** → **Logs** tab
- View metrics: **Metrics** tab
- Database usage: MongoDB Atlas dashboard

---

## Troubleshooting

### Backend Logs
```bash
# View in Render Dashboard
Services → vouchervault-backend → Logs
```

### Frontend Logs
```bash
# View in Render Dashboard
Services → vouchervault-frontend → Deploy Logs
```

### Test Backend API Directly
```bash
curl https://vouchervault-backend.onrender.com/api/
# Should return: {"message": "Voucher Management API"}
```

### Database Connection Test
```bash
# In backend logs, look for:
"Database indexes created successfully"
"Reminder scheduler started"
```

---

## Next Steps

1. **Share your app**: Send URL to friends/family
2. **Get Google OAuth credentials** for Drive sync:
   - [Google Cloud Console](https://console.cloud.google.com)
   - Create project → Enable Drive API → Get credentials
   - Update `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
3. **Add custom domain** (optional)
4. **Monitor usage** and upgrade if needed

---

## Need Help?

- **Render Docs**: [render.com/docs](https://render.com/docs)
- **MongoDB Docs**: [docs.mongodb.com](https://docs.mongodb.com)
- **Support**: Open issue on GitHub

---

**Congratulations!** 🎊 Your voucher management app is now running on production-grade infrastructure for FREE!
