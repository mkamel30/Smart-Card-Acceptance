# Card Settlement System (Cloud Version)

Ready for Vercel (Frontend) & Render (Backend).

## 1. Setup Database (Supabase)
Run this command from your local machine (in `backend` folder) to push the schema and seed branches:
```bash
cd backend
npm install
npx prisma db push
npx tsx prisma/seed.ts
```

## 2. Backend Deployment (Render.com)
1. Create a **Web Service**.
2. Connect your GitHub Repo.
3. Root Directory: `backend`.
4. Build Command: `npm install && npx prisma generate && npm run build`.
5. Start Command: `npm start`.
6. **Environment Variables** (CRITICAL - Set these properly):
   - `DATABASE_URL`: (Your Supabase Connection String)
   - `SUPA_PROJECT_URL`: https://nuaslolzzocyciuobyrd.supabase.co
   - `SUPA_SERVICE_KEY`: (Your Service Key)
   - `JWT_SECRET`: (Strong secret token for JWT - generate with `openssl rand -base64 32`)
   - `ADMIN_PASSWORD`: (Secure admin password - use a strong password)
   - `OCR_SPACE_API_KEY`: K82676068988957
   - `ALLOWED_ORIGINS`: (Comma-separated list of allowed frontend URLs)
   - `PORT`: 10000

## 3. Frontend Deployment (Vercel)
1. Import the same GitHub Repo.
2. Root Directory: `frontend`.
3. Framework: **Vite**.
4. **Environment Variables**:
   - `VITE_API_URL`: (Your Render Backend URL, e.g. https://my-app.onrender.com/api)

## 4. Security Configuration (IMPORTANT)

### 🔐 Authentication System
The system uses **JWT-based authentication** only. Legacy admin password system has been removed for security.

### 🛡️ Security Features
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS Protection**: Specific origins only (configure via ALLOWED_ORIGINS)
- **File Upload Validation**: Type and size restrictions
- **Security Headers**: Helmet.js middleware enabled

### 📋 Admin Access
- Admin users must be created via the authentication system
- Use the `/api/auth/login` endpoint with proper credentials
- Branch management requires admin authentication

## 5. Production Checklist
- [ ] Set strong JWT_SECRET (minimum 32 characters)
- [ ] Set strong ADMIN_PASSWORD
- [ ] Configure ALLOWED_ORIGINS with your frontend URL
- [ ] Verify DATABASE_URL is correct
- [ ] Test authentication flow
- [ ] Verify file upload functionality
- [ ] Test OCR functionality

## 6. Environment Variables Summary
```bash
# Required Security Variables
JWT_SECRET=your-strong-jwt-secret-here
ADMIN_PASSWORD=your-strong-admin-password-here
ALLOWED_ORIGINS=https://your-frontend-url.com,https://localhost:5173

# Database & Services
DATABASE_URL=your-supabase-connection-string
SUPA_PROJECT_URL=https://your-project.supabase.co
SUPA_SERVICE_KEY=your-service-key
OCR_SPACE_API_KEY=K82676068988957

# Optional
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=your-email@gmail.com
```

## 7. Troubleshooting
- **Database Connection**: Ensure DATABASE_URL is correct and Supabase is accessible
- **Authentication**: Verify JWT_SECRET and ADMIN_PASSWORD are set
- **CORS Issues**: Check ALLOWED_ORIGINS includes your frontend URL
- **Upload Issues**: Verify file size limits and OCR API key