# Card Settlement System

A comprehensive card settlement management system with OCR receipt processing, multi-branch support, and secure authentication.

## 🏗️ Architecture

- **Backend**: Node.js + TypeScript + Express + Prisma ORM + PostgreSQL (Supabase)
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + React Query
- **Authentication**: JWT-based authentication with role-based access control
- **OCR**: Dual-engine OCR system (OCR.space primary, Tesseract.js fallback)
- **Database**: PostgreSQL via Supabase Cloud

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database (or Supabase account)
- Git

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd card-settlement-cloud_19012026
```

2. **Backend setup**
```bash
cd backend
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration (see Security Configuration below)
```

4. **Database setup**
```bash
npx prisma db push
npx tsx prisma/seed.ts
```

5. **Start backend**
```bash
npm run dev
```

6. **Frontend setup**
```bash
cd frontend
npm install
```

7. **Start frontend**
```bash
npm run dev
```

## 🔐 Security Configuration

### Environment Variables

Create a `.env` file in the backend directory with the following variables:

```bash
# Required Security Variables (CRITICAL)
JWT_SECRET=your-strong-jwt-secret-minimum-32-characters
ADMIN_PASSWORD=your-strong-admin-password
ALLOWED_ORIGINS=https://yourdomain.com,https://localhost:5173

# Database & Services
DATABASE_URL=your-supabase-connection-string
SUPA_PROJECT_URL=https://your-project.supabase.co
SUPA_SERVICE_KEY=your-supabase-service-key

# OCR Configuration
OCR_SPACE_API_KEY=K82676068988957

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Server
PORT=5000
```

### Security Features Implemented

✅ **Authentication & Authorization**
- JWT-based authentication (no more legacy passwords)
- Role-based access control (ADMIN, BRANCH_MANAGER)
- Branch-specific data access for branch managers
- Token expiration handling

✅ **Rate Limiting**
- Global rate limiting: 100 requests per 15 minutes per IP
- Admin operations: 5 requests per 15 minutes per IP
- Automatic DDoS protection

✅ **CORS Protection**
- Specific origin whitelist (no wildcard access)
- Configurable allowed origins via environment variables
- Credential support for authenticated requests

✅ **File Upload Security**
- MIME type validation (JPEG, PNG, WebP, BMP, TIFF)
- File size limits (10MB maximum)
- Magic byte validation to prevent malicious uploads
- Automatic file cleanup on errors

✅ **Security Headers**
- Helmet.js middleware for security headers
- Content Security Policy (CSP)
- Cross-origin resource policy
- X-Frame-Options, X-Content-Type-Options

✅ **Input Validation**
- Zod schema validation for all API inputs
- SQL injection prevention
- XSS protection
- Data sanitization

### Security Best Practices

1. **Generate Strong Secrets**
```bash
# Generate JWT secret (32+ characters)
openssl rand -base64 32

# Generate strong admin password
openssl rand -base64 16
```

2. **Environment Variables**
- Never commit `.env` file to version control
- Use different secrets for development and production
- Rotate secrets regularly

3. **Database Security**
- Use connection pooling
- Enable SSL for database connections
- Regular database backups

4. **API Security**
- Use HTTPS in production
- Keep dependencies updated
- Monitor application logs

## 📊 OCR System

### Supported Engines

1. **OCR.space** (Primary)
   - High accuracy for receipt processing
   - Arabic and English language support
   - API key: `K82676068988957`

2. **Tesseract.js** (Fallback)
   - Local processing when OCR.space unavailable
   - Arabic + English character recognition
   - Enhanced character whitelist for receipts

### Enhanced Number Extraction

✅ **No Digit Limits**
- Approval codes: 4-8 digits (realistic Egyptian banking range)
- Merchant codes: 8-20 digits (flexible for all banks)
- Card BINs: 6 digits (standard IIN format)
- Amounts: Decimal support for all currencies

✅ **Egyptian Banking Support**
- Enhanced patterns for Egyptian bank receipts
- Arabic and English text processing
- Currency symbol recognition (EGP, ج.م)
- Phone number and date filtering

## 🏢 Multi-Tenant Architecture

### Branch Management
- Multi-branch support with data isolation
- Branch-specific user assignments
- Hierarchical permissions (Admin > Branch Manager)

### Data Access Control
- Branch managers can only access their assigned branches
- Admins have system-wide access
- Automatic branch filtering in all queries

## 📝 API Documentation

### Authentication Endpoints
```
POST /api/auth/login          - User login
GET  /api/auth/profile         - Get current user profile
POST /api/auth/refresh        - Refresh JWT token
POST /api/auth/users          - Create user (admin only)
```

### Settlement Endpoints
```
GET    /api/settlements         - List settlements (with filtering)
POST    /api/settlements         - Create settlement
GET    /api/settlements/:id     - Get settlement
PUT    /api/settlements/:id     - Update settlement (admin)
DELETE /api/settlements/:id     - Delete settlement (admin)
```

### Branch Endpoints
```
GET    /api/branches            - List branches
GET    /api/branches/:id        - Get branch
POST    /api/branches            - Create branch (admin)
PUT    /api/branches/:id        - Update branch (admin)
DELETE /api/branches/:id        - Delete branch (admin)
```

### OCR Endpoints
```
POST    /api/ocr/scan           - Scan receipt image
```

## 🚀 Deployment

### Backend (Render.com)
1. Connect your repository to Render
2. Set environment variables (see Security Configuration)
3. Build command: `npm install && npx prisma generate && npm run build`
4. Start command: `npm start`

### Frontend (Vercel)
1. Import repository to Vercel
2. Set `VITE_API_URL` environment variable
3. Deploy automatically on git push

### Production Checklist
- [ ] Set strong JWT_SECRET
- [ ] Set strong ADMIN_PASSWORD
- [ ] Configure ALLOWED_ORIGINS
- [ ] Verify DATABASE_URL
- [ ] Test authentication flow
- [ ] Verify OCR functionality
- [ ] Check rate limiting
- [ ] Monitor error logs

## 📈 Monitoring & Maintenance

### Health Checks
- `/health` - Basic health status
- `/api/info` - Request information (IP, User-Agent)

### Logging
- Authentication errors
- OCR processing failures
- Rate limiting violations
- Database connection issues

### Backup Strategy
- Daily database backups
- Application logs archiving
- Environment variables backup

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with proper validation
4. Test thoroughly
5. Submit pull request

## 📄 License

This project is proprietary software.

## 🆘 Support

For security issues, contact the development team directly.
For general issues, create a ticket in the project management system.