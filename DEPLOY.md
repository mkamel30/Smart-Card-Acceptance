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
6. **Environment Variables**:
   - `DATABASE_URL`: (Your Supabase Connection String)
   - `SUPA_PROJECT_URL`: https://nuaslolzzocyciuobyrd.supabase.co
   - `SUPA_SERVICE_KEY`: (Your Service Key)
   - `PORT`: 10000

## 3. Frontend Deployment (Vercel)
1. Import the same GitHub Repo.
2. Root Directory: `frontend`.
3. Framework: **Vite**.
4. **Environment Variables**:
   - `VITE_API_URL`: (Your Render Backend URL, e.g. https://my-app.onrender.com/api)

## 4. Admin Access
- To add new branches, click "Admin" on the branch selection screen.
- Password: `351762`
