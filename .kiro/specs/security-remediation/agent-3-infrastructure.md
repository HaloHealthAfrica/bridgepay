# Agent 3: Infrastructure & Production Readiness Specialist

## Mission
Execute database migrations, configure environment variables, and validate production readiness to complete the security remediation.

## Context
The final phase of security remediation requires infrastructure changes and validation:
- Database migration needed for idempotency keys
- Environment variables must be properly configured
- Production readiness must be validated
- Deployment checklist must be completed

## Critical Infrastructure Tasks

### 1. Database Migration (CRITICAL)
**Status**: ⚠️ Required for idempotency middleware to work
**Action**: Execute Prisma migration for IdempotencyKey table

#### Migration Command
```bash
cd backend
npx prisma migrate dev --name add-idempotency-keys
npx prisma generate
```

#### Expected Changes
- New `IdempotencyKey` table created
- Existing data preserved
- Prisma client regenerated with new schema

#### Validation
```bash
# Check migration status
npx prisma migrate status

# Verify table exists
npx prisma studio
# Look for IdempotencyKey table in browser
```

### 2. Environment Variable Configuration
**Status**: ⚠️ Required for security features to work

#### Required Variables in `backend/.env`

##### Security Configuration
```env
# JWT Secrets (CRITICAL - Generate 32+ character random strings)
JWT_ACCESS_SECRET=<generate-random-32-char-string>
JWT_REFRESH_SECRET=<generate-different-random-32-char-string>

# Environment
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

##### M-Pesa Configuration
```env
# M-Pesa Settings
MPESA_ENVIRONMENT=sandbox
MPESA_SKIP_IP_CHECK=true  # IMPORTANT: Set to false in production
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_SHORTCODE=174379  # Sandbox shortcode
MPESA_PASSKEY=your_passkey
MPESA_CALLBACK_URL=https://your-domain.com/api/webhooks
MPESA_B2C_INITIATOR=testapi
MPESA_B2C_PASSWORD=your_b2c_password
```

##### Optional Services
```env
# Lemonade (Card Payments)
LEMONADE_CONSUMER_KEY=your_key
LEMONADE_CONSUMER_SECRET=your_secret
LEMONADE_WALLET_NO=your_wallet
LEMONADE_WEBHOOK_SECRET=your_secret

# Application URLs
APP_URL=http://localhost:3000
BACKEND_URL=http://localhost:3000
```

#### Secret Generation Commands
```bash
# PowerShell (Windows)
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})

# Node.js (Cross-platform)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate two different secrets for JWT_ACCESS_SECRET and JWT_REFRESH_SECRET
```

### 3. Frontend Environment Configuration
**File**: `frontend/.env`
```env
VITE_API_URL=http://localhost:3000/api
```

**For Production Deployment**:
Set in Vercel dashboard or deployment platform:
```env
VITE_API_URL=https://your-backend-domain.com/api
```

### 4. Production Readiness Validation

#### Security Checklist
- [ ] All race conditions fixed (Agent 1 complete)
- [ ] All middleware integrated (Agent 2 complete)
- [ ] Database migration successful
- [ ] Environment variables configured
- [ ] JWT secrets are strong (32+ characters)
- [ ] M-Pesa IP checking configured per environment

#### Functional Testing
Test these critical flows after all changes:

##### Authentication Flow
```bash
# Test registration with strong password
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com", 
    "phone": "+254712345678",
    "password": "StrongPass123!",
    "role": "USER"
  }'

# Should succeed with proper validation
```

##### Payment Flow with Idempotency
```bash
# Test transfer with idempotency key
curl -X POST http://localhost:3000/api/wallet/transfer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: test-key-123" \
  -d '{
    "recipientPhone": "+254712345679",
    "amount": 100,
    "note": "Test transfer"
  }'

# First request should succeed
# Second request with same key should return cached response
```

##### Rate Limiting Test
```bash
# Test rate limiting (should get 429 after 5 attempts)
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "wrong@email.com", "password": "wrong"}'
  echo "Attempt $i"
done
```

## Implementation Instructions

### Step 1: Database Migration
1. **Backup Database** (if production data exists)
   ```bash
   pg_dump bridge_db > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Execute Migration**
   ```bash
   cd backend
   npx prisma migrate dev --name add-idempotency-keys
   ```

3. **Verify Migration**
   ```bash
   npx prisma migrate status
   npx prisma studio  # Check IdempotencyKey table exists
   ```

### Step 2: Environment Configuration
1. **Generate JWT Secrets**
   ```bash
   # Generate two different 32+ character secrets
   node -e "console.log('JWT_ACCESS_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
   node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Update backend/.env**
   - Add generated JWT secrets
   - Configure M-Pesa settings
   - Set appropriate environment flags

3. **Update frontend/.env**
   - Set correct API URL for environment

### Step 3: Validation Testing
1. **Start Services**
   ```bash
   # Terminal 1: Backend
   cd backend && npm run dev
   
   # Terminal 2: Frontend  
   cd frontend && npm run dev
   ```

2. **Test Security Features**
   - Registration with weak password (should fail)
   - Login rate limiting (should block after 5 attempts)
   - Payment with missing idempotency key (should fail)
   - Duplicate payment with same key (should return cached)

3. **Test Core Functionality**
   - User registration and login
   - Money transfer between users
   - M-Pesa deposit initiation
   - QR code payment

### Step 4: Production Readiness Assessment
Calculate production readiness score based on completed items:

#### Critical Issues (8 items) - 40 points each
- [ ] Race conditions fixed (40 points)
- [ ] Input validation applied (40 points)
- [ ] Rate limiting applied (40 points)
- [ ] Idempotency implemented (40 points)
- [ ] M-Pesa webhook secured (40 points)
- [ ] Authentication hardened (40 points)
- [ ] Database constraints added (40 points)
- [ ] Error handling improved (40 points)

#### High Priority Issues (12 items) - 15 points each
- [ ] Environment variables configured (15 points)
- [ ] JWT secrets strong (15 points)
- [ ] Database migration complete (15 points)
- [ ] Frontend integration working (15 points)
- [ ] Testing completed (15 points)
- [ ] Documentation updated (15 points)
- [ ] Deployment ready (15 points)
- [ ] Monitoring configured (15 points)
- [ ] Backup strategy (15 points)
- [ ] SSL/HTTPS configured (15 points)
- [ ] CORS properly configured (15 points)
- [ ] Logging implemented (15 points)

**Target Score**: 95/100 (Production Ready)

## Success Criteria

### Infrastructure Success
- [ ] Database migration executed successfully
- [ ] IdempotencyKey table exists and is functional
- [ ] All environment variables configured
- [ ] JWT secrets are cryptographically strong
- [ ] Services start without errors

### Security Success
- [ ] All security middleware is functional
- [ ] Rate limiting blocks excessive requests
- [ ] Input validation rejects invalid data
- [ ] Idempotency prevents duplicate payments
- [ ] Authentication is properly secured

### Production Readiness
- [ ] Production readiness score ≥ 95/100
- [ ] All critical security issues resolved
- [ ] Core functionality working end-to-end
- [ ] Ready for real money transactions

## Risk Mitigation

### Database Migration Risks
- **Risk**: Migration fails or corrupts data
- **Mitigation**: Backup database before migration, test in development first
- **Rollback**: Restore from backup if needed

### Environment Configuration Risks
- **Risk**: Wrong configuration breaks functionality
- **Mitigation**: Test each configuration change, use development environment first
- **Rollback**: Keep backup of working .env files

### Production Deployment Risks
- **Risk**: Security features don't work in production
- **Mitigation**: Test all security features in staging environment first
- **Rollback**: Have deployment rollback plan ready

## Deployment Checklist

### Pre-Deployment
- [ ] All security fixes applied and tested
- [ ] Database migration successful
- [ ] Environment variables configured
- [ ] SSL certificates ready
- [ ] Domain names configured
- [ ] Monitoring tools ready

### Production Environment Variables
```env
# CRITICAL: Change these for production
NODE_ENV=production
MPESA_SKIP_IP_CHECK=false  # MUST be false in production
MPESA_ENVIRONMENT=production
JWT_ACCESS_SECRET=<production-secret>
JWT_REFRESH_SECRET=<different-production-secret>
FRONTEND_URL=https://your-frontend-domain.com
```

### Post-Deployment
- [ ] All services running
- [ ] Security features active
- [ ] Monitoring alerts configured
- [ ] Backup systems running
- [ ] Performance metrics normal

## Completion Checklist

### Database & Migration
- [ ] Database backup created (if needed)
- [ ] Prisma migration executed successfully
- [ ] IdempotencyKey table verified
- [ ] Prisma client regenerated

### Environment Configuration
- [ ] JWT secrets generated (32+ characters each)
- [ ] Backend .env configured with all required variables
- [ ] Frontend .env configured with correct API URL
- [ ] M-Pesa settings configured per environment

### Testing & Validation
- [ ] Services start without errors
- [ ] Authentication flow works with validation
- [ ] Payment flow works with idempotency
- [ ] Rate limiting blocks excessive requests
- [ ] Core functionality preserved

### Production Readiness
- [ ] Production readiness score calculated (≥95/100)
- [ ] All critical security issues resolved
- [ ] Deployment checklist prepared
- [ ] Monitoring and backup plans ready

**Priority**: HIGH - Required to complete security remediation
**Estimated Time**: 1-2 hours
**Dependencies**: Agents 1 & 2 must complete first
**Risk Level**: MEDIUM - Infrastructure changes can break functionality