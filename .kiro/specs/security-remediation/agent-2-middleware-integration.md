# Agent 2: Security Middleware Integration Specialist

## Mission
Integrate all security middleware (validation, rate limiting, idempotency) into API routes to protect endpoints from attacks and invalid inputs.

## Context
Phase 1 security fixes created comprehensive middleware but it's not yet applied to routes. Without integration:
- Endpoints accept invalid inputs (weak passwords, malformed emails)
- No rate limiting protection against brute force attacks
- Payment endpoints lack idempotency protection
- Missing input validation allows malicious requests

## Security Middleware Available

### 1. Validation Middleware (`backend/src/middleware/validation.ts`)
- **Zod schemas** for all endpoint inputs
- **Password validation**: 8+ chars, uppercase, lowercase, number
- **Phone validation**: Kenyan format (+254)
- **Amount validation**: Positive, max 1M KES, finite
- **Email validation**: Proper format

### 2. Rate Limiting (`backend/src/middleware/rateLimiter.ts`)
- **authRateLimiter**: 5 attempts per 15 minutes
- **paymentRateLimiter**: 10 requests per minute  
- **apiRateLimiter**: 100 requests per minute
- **webhookRateLimiter**: 100 requests per minute

### 3. Idempotency (`backend/src/middleware/idempotency.ts`)
- **idempotencyMiddleware**: Prevents duplicate payments
- **Requires**: `Idempotency-Key` header on payment requests
- **Returns**: Cached response for duplicate keys

## Routes Requiring Integration

### 1. Authentication Routes (`backend/src/routes/auth.routes.ts`)

#### Current State (Unprotected)
```typescript
router.post("/register", asyncHandler(authController.register));
router.post("/login", asyncHandler(authController.login));
```

#### Required Integration
```typescript
import { validate, authSchemas } from "../middleware/validation";
import { authRateLimiter } from "../middleware/rateLimiter";

router.post(
  "/register",
  authRateLimiter,
  validate(authSchemas.register),
  asyncHandler(authController.register)
);

router.post(
  "/login", 
  authRateLimiter,
  validate(authSchemas.login),
  asyncHandler(authController.login)
);
```

### 2. Wallet Routes (`backend/src/routes/wallet.routes.ts`)

#### Payment Endpoints Requiring Full Protection
```typescript
import { validate, walletSchemas } from "../middleware/validation";
import { paymentRateLimiter } from "../middleware/rateLimiter";
import { idempotencyMiddleware } from "../middleware/idempotency";

// M-Pesa Deposit
router.post(
  "/deposit/mpesa",
  requireAuth,
  paymentRateLimiter,
  idempotencyMiddleware,
  validate(walletSchemas.depositMpesa),
  asyncHandler(walletController.depositMpesa)
);

// Card Deposit  
router.post(
  "/deposit/card",
  requireAuth,
  paymentRateLimiter,
  idempotencyMiddleware,
  validate(walletSchemas.depositCard),
  asyncHandler(walletController.depositCard)
);

// Transfer Money
router.post(
  "/transfer",
  requireAuth,
  paymentRateLimiter,
  idempotencyMiddleware,
  validate(walletSchemas.transfer),
  asyncHandler(walletController.transfer)
);

// Withdraw to M-Pesa
router.post(
  "/withdraw/mpesa",
  requireAuth,
  paymentRateLimiter,
  idempotencyMiddleware,
  validate(walletSchemas.withdraw),
  asyncHandler(walletController.withdrawMpesa)
);
```

### 3. Merchant Routes (`backend/src/routes/merchant.routes.ts`)

#### QR and Card Payment Protection
```typescript
import { validate, merchantSchemas } from "../middleware/validation";
import { paymentRateLimiter } from "../middleware/rateLimiter";
import { idempotencyMiddleware } from "../middleware/idempotency";

// QR Code Payment
router.post(
  "/qr/pay",
  requireAuth,
  paymentRateLimiter,
  idempotencyMiddleware,
  validate(merchantSchemas.processQRPayment),
  asyncHandler(merchantController.processQRPayment)
);

// Card Payment to Merchant
router.post(
  "/:merchantId/pay/card",
  requireAuth,
  paymentRateLimiter,
  idempotencyMiddleware,
  validate(merchantSchemas.initiateCardPayment),
  asyncHandler(merchantController.initiateCardPaymentToMerchant)
);
```

### 4. Global Rate Limiting (`backend/src/app.ts`)

#### Add Global API Rate Limiting
```typescript
import { apiRateLimiter } from "./middleware/rateLimiter";

// Add after CORS, before routes
app.use(apiRateLimiter);
```

## Implementation Instructions

### Step 1: Read Current Route Files
Examine the current state of route files to understand existing middleware:
- `backend/src/routes/auth.routes.ts`
- `backend/src/routes/wallet.routes.ts`
- `backend/src/routes/merchant.routes.ts`
- `backend/src/app.ts`

### Step 2: Apply Authentication Route Security
Update `backend/src/routes/auth.routes.ts`:
1. Add imports for validation and rate limiting
2. Apply `authRateLimiter` to login/register routes
3. Apply validation schemas to both routes
4. Preserve existing middleware order

### Step 3: Apply Wallet Route Security
Update `backend/src/routes/wallet.routes.ts`:
1. Add imports for all three middleware types
2. Apply full protection to payment endpoints:
   - Rate limiting (prevent abuse)
   - Idempotency (prevent duplicates)
   - Validation (prevent invalid inputs)
3. Maintain proper middleware order: auth → rate limit → idempotency → validation → handler

### Step 4: Apply Merchant Route Security
Update `backend/src/routes/merchant.routes.ts`:
1. Add imports for payment protection middleware
2. Apply full protection to payment endpoints
3. Ensure QR and card payments are fully protected

### Step 5: Add Global Rate Limiting
Update `backend/src/app.ts`:
1. Import global rate limiter
2. Add after CORS middleware
3. Ensure it applies to all routes

### Step 6: Verify Middleware Order
Ensure correct middleware order for all protected routes:
```
requireAuth → rateLimiter → idempotencyMiddleware → validate → asyncHandler → controller
```

## Validation Schemas Available

### Authentication Schemas (`authSchemas`)
- `register`: name, email, phone, password, role
- `login`: email, password

### Wallet Schemas (`walletSchemas`)
- `depositMpesa`: amount, phone
- `depositCard`: amount
- `transfer`: recipientPhone, amount, note (optional)
- `withdraw`: amount, phone

### Merchant Schemas (`merchantSchemas`)
- `processQRPayment`: merchantId, amount, note (optional)
- `initiateCardPayment`: merchantId, amount, note (optional)

## Success Criteria

### Security Requirements
- [ ] All authentication endpoints have rate limiting (5 attempts/15min)
- [ ] All payment endpoints have rate limiting (10 requests/min)
- [ ] All payment endpoints require idempotency keys
- [ ] All endpoints validate inputs with Zod schemas
- [ ] Global API rate limiting applied (100 requests/min)

### Functional Requirements
- [ ] All routes compile without TypeScript errors
- [ ] Middleware order is correct for all routes
- [ ] Existing functionality preserved
- [ ] Error handling works properly

### Integration Requirements
- [ ] Validation errors return proper HTTP 400 responses
- [ ] Rate limiting returns HTTP 429 responses
- [ ] Idempotency returns cached responses for duplicates
- [ ] All middleware imports resolve correctly

## Testing Strategy

### Manual Testing
After integration, test these scenarios:

#### Authentication Testing
1. **Weak Password**: Try registering with "123" - should fail validation
2. **Invalid Email**: Try "notanemail" - should fail validation
3. **Rate Limiting**: Try 6 login attempts rapidly - should get rate limited
4. **Valid Registration**: Proper inputs should work

#### Payment Testing
1. **Missing Idempotency Key**: Payment without header - should fail
2. **Duplicate Key**: Same key twice - should return cached response
3. **Invalid Amount**: Negative amount - should fail validation
4. **Rate Limiting**: 11 payments rapidly - should get rate limited

### Expected Responses

#### Validation Errors (400)
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "password",
      "message": "Password must be at least 8 characters"
    }
  ]
}
```

#### Rate Limiting (429)
```json
{
  "error": "Too many requests, please try again later."
}
```

#### Missing Idempotency Key (400)
```json
{
  "success": false,
  "error": "Idempotency-Key header is required"
}
```

## Risk Mitigation

### Backup Strategy
Before making changes:
```bash
cp backend/src/routes/auth.routes.ts backend/src/routes/auth.routes.ts.backup
cp backend/src/routes/wallet.routes.ts backend/src/routes/wallet.routes.ts.backup
cp backend/src/routes/merchant.routes.ts backend/src/routes/merchant.routes.ts.backup
cp backend/src/app.ts backend/src/app.ts.backup
```

### Testing Strategy
1. Apply changes incrementally (one route file at a time)
2. Test each route file after changes
3. Verify existing functionality still works
4. Check that new security controls are active

### Rollback Plan
If issues occur:
1. Restore from backup files
2. Restart backend service
3. Investigate and fix issues
4. Reapply changes carefully

## Environment Variables Required

Ensure these are set in `backend/.env`:
```env
# JWT Secrets (32+ characters each)
JWT_ACCESS_SECRET=<random-string-min-32-chars>
JWT_REFRESH_SECRET=<different-random-string-min-32-chars>

# Frontend URL for CORS
FRONTEND_URL=http://localhost:5173

# M-Pesa Settings
MPESA_SKIP_IP_CHECK=true  # Development only
```

## Completion Checklist

### Route Integration
- [ ] Read current state of all route files
- [ ] Apply security to auth routes (rate limiting + validation)
- [ ] Apply security to wallet routes (full protection)
- [ ] Apply security to merchant routes (payment protection)
- [ ] Add global rate limiting to app.ts

### Verification
- [ ] All TypeScript compilation passes
- [ ] All imports resolve correctly
- [ ] Middleware order is correct
- [ ] Existing routes still work
- [ ] New security controls are active

### Testing
- [ ] Test validation with invalid inputs
- [ ] Test rate limiting with rapid requests
- [ ] Test idempotency with duplicate keys
- [ ] Test that valid requests still work
- [ ] Verify error responses are proper

**Priority**: HIGH - Required for production security
**Estimated Time**: 1-2 hours  
**Dependencies**: Agent 1 (race conditions) should complete first
**Risk Level**: MEDIUM - Breaks functionality if done incorrectly