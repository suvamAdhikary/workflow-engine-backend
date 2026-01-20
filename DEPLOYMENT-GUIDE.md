# 🚀 Workflow Engine Deployment Guide

This guide will help you deploy the Workflow Engine to production using Render (backend) and Vercel (frontend).

## 📋 Prerequisites

- GitHub account with your repositories
- Render account (free tier available)
- Vercel account (free tier available)

## 🔧 Backend Deployment (Render)

### Step 1: Prepare Your Repository

1. Ensure your backend code is pushed to GitHub
2. The `render.yaml` file is already configured in your repository

### Step 2: Deploy to Render

1. **Go to [Render Dashboard](https://dashboard.render.com/)**
2. **Click "New +" → "Blueprint"**
3. **Connect your GitHub repository**: `workflow-engine-backend`
4. **Render will automatically detect the `render.yaml` file**
5. **Review the configuration and click "Apply"**

### Step 3: Configure Environment Variables

Render will automatically create most environment variables, but you may need to update:

- `CORS_ORIGINS`: Update with your frontend domain once deployed
- `APP_URL`: Should be `https://your-app-name.onrender.com`

### Step 4: Database Setup

Render will automatically:
- Create a PostgreSQL database
- Create a Redis instance
- Set up the connection strings

## 🎨 Frontend Deployment (Vercel)

### Step 1: Deploy to Vercel

1. **Go to [Vercel Dashboard](https://vercel.com/dashboard)**
2. **Click "New Project"**
3. **Import your GitHub repository**: `workflow-engine-frontend`
4. **Configure the project**:
   - Framework Preset: `Vite`
   - Build Command: `yarn build`
   - Output Directory: `dist`
   - Install Command: `yarn install`

### Step 2: Environment Variables

Add these environment variables in Vercel:

```
VITE_API_BASE_URL=https://your-backend-app.onrender.com/api
VITE_API_TIMEOUT=30000
VITE_TOKEN_STORAGE_KEY=workflow_engine_token
VITE_REFRESH_TOKEN_STORAGE_KEY=workflow_engine_refresh_token
```

### Step 3: Deploy

Click "Deploy" and Vercel will build and deploy your frontend.

## 🔄 Update CORS Configuration

After both deployments are complete:

1. **Get your frontend URL** from Vercel (e.g., `https://workflow-engine.vercel.app`)
2. **Update the backend CORS configuration** in Render:
   - Go to your backend service in Render
   - Environment → Edit `CORS_ORIGINS`
   - Add your frontend URL: `https://your-frontend.vercel.app`
   - Save and redeploy

## 🧪 Testing Your Deployment

### Backend Health Check
```bash
curl https://your-backend.onrender.com/api/health
```

### Frontend Access
Visit your frontend URL and test:
1. User registration/login
2. Workflow creation
3. Workflow execution
4. Run history viewing

## 📊 Monitoring

### Backend Logs
- View logs in Render Dashboard → Your Service → Logs
- Structured logging is enabled for production

### Frontend Analytics
- Vercel provides built-in analytics
- Monitor performance and errors in Vercel Dashboard

## 🔒 Security Considerations

### Production Checklist
- ✅ HTTPS enabled (automatic with Render/Vercel)
- ✅ CORS properly configured
- ✅ Rate limiting enabled
- ✅ Input validation and sanitization
- ✅ JWT tokens with proper expiration
- ✅ Environment variables secured
- ✅ Database credentials managed by platform

### Additional Security
- Consider adding a custom domain
- Set up monitoring and alerting
- Regular security updates
- Backup strategy for database

## 🚀 Custom Domains (Optional)

### Backend (Render)
1. Go to Settings → Custom Domains
2. Add your domain (e.g., `api.yourworkflow.com`)
3. Update DNS records as instructed

### Frontend (Vercel)
1. Go to Settings → Domains
2. Add your domain (e.g., `yourworkflow.com`)
3. Update DNS records as instructed

## 📈 Scaling

### Backend Scaling
- Render free tier: 1 instance, 512MB RAM
- Paid tiers: Multiple instances, more RAM/CPU
- Database: Automatic backups, scaling available

### Frontend Scaling
- Vercel: Global CDN, automatic scaling
- No configuration needed for traffic spikes

## 🛠 Troubleshooting

### Common Issues

1. **Build Failures**
   - Check build logs in deployment platform
   - Verify all dependencies are in package.json
   - Ensure environment variables are set

2. **Database Connection Issues**
   - Verify DATABASE_URL is set correctly
   - Check if database is running
   - Review connection limits

3. **CORS Errors**
   - Ensure frontend URL is in CORS_ORIGINS
   - Check protocol (http vs https)
   - Verify environment variables

4. **Authentication Issues**
   - Check JWT secrets are set
   - Verify token storage keys match
   - Review API base URL configuration

### Getting Help
- Check platform documentation (Render, Vercel)
- Review application logs
- Test API endpoints individually
- Verify environment variable configuration

## 📝 Deployment Checklist

### Pre-deployment
- [ ] Code pushed to GitHub
- [ ] Environment variables documented
- [ ] Database schema ready
- [ ] Tests passing
- [ ] Security review completed

### Backend Deployment
- [ ] Render service created
- [ ] Database connected
- [ ] Redis connected
- [ ] Environment variables set
- [ ] Health check passing
- [ ] Logs accessible

### Frontend Deployment
- [ ] Vercel project created
- [ ] Build successful
- [ ] Environment variables set
- [ ] API connection working
- [ ] Authentication flow tested

### Post-deployment
- [ ] CORS updated with frontend URL
- [ ] End-to-end testing completed
- [ ] Monitoring set up
- [ ] Documentation updated
- [ ] Team notified

## 🎉 Success!

Your Workflow Engine is now deployed and ready for production use!

- **Backend**: `https://your-backend.onrender.com`
- **Frontend**: `https://your-frontend.vercel.app`
- **API Docs**: `https://your-backend.onrender.com/api/docs`

Happy automating! 🤖✨