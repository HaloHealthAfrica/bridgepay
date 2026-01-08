# Agent 1: Race Condition Specialist

## Mission
Eliminate all race conditions in financial operations to prevent double-spending and money theft exploits.

## Context
The Bridge MVP has critical race conditions where balance checks happen OUTSIDE database transactions. This allows concurrent requests to bypass balance validation, potentially leading to:
- Users transferring more money than they have
- M-Pesa callbacks crediting money multiple times
- QR payments succeeding with insufficient balance

## Critical Files to Fix

### 1. `backend/src/controllers/wallet.controller.ts`

#### Function: `transfer()` (lines 221-276)
**Current Problem**: Balance check happens before transaction
```typescript
// VULNERABLE CODE:
const senderWallet = await prisma.wallet.findUnique({ where: { userId: req.user!.userId } });
if (!senderWallet || Number(senderWallet.balance) < Number(amount)) throw new AppError("Insufficient balance", 400);

const result = await prisma.$transaction(async (tx) => {
  // Balance already checked outside - RACE CONDITION!
});
```

**Required Fix**: Move balance check inside transaction
```typescript
// SECURE CODE:
const result = await prisma.$transaction(async (tx) => {
  // Check balance INSIDE transaction
  const senderWallet = await tx.wallet.findUnique({ where: { userId: req.user!.userId } });
  if (!senderWallet || Number(senderWallet.balance) < Number(amount)) {
    throw new AppError("Insufficient balance", 400);
  }
  // ... rest of transaction
});
```

#### Function: `withdrawMpesa()` (lines 277-308)
**Same Pattern**: Balance check outside transaction, needs same fix

### 2. `backend/src/controllers/merchant.controller.ts`

#### Function: `processQRPayment()` (around line 105)
**Same Pattern**: Balance check outside transaction for QR payments

### 3. `backend/src/services/mpesa.service.ts`

#### Function: `handleCallback()` (line 62)
**Current Problem**: Transaction can be processed multiple times
```typescript
// VULNERABLE CODE:
const transaction = await prisma.transaction.findFirst({
  where: {
    metadata: { path: ["merchantRequestID"], equals: merchantRequestID },
  },
});
// No status check - can process SUCCESS transactions again!
```

**Required Fix**: Only process PENDING transactions
```typescript
// SECURE CODE:
const transaction = await prisma.transaction.findFirst({
  where: {
    metadata: { path: ["merchantRequestID"], equals: merchantRequestID },
    status: "PENDING", // Only process pending transactions
  },
});

// Use updateMany with status check to prevent race conditions
const updated = await tx.transaction.updateMany({
  where: { id: transaction.id, status: "PENDING" },
  data: { status: "SUCCESS", ... },
});

if (updated.count === 0) {
  console.warn(`Race condition prevented for transaction: ${transaction.id}`);
  return;
}
```

## Implementation Instructions

### Step 1: Read Current Implementation
Read the three critical files to understand current race condition vulnerabilities:
- `backend/src/controllers/wallet.controller.ts`
- `backend/src/controllers/merchant.controller.ts`  
- `backend/src/services/mpesa.service.ts`

### Step 2: Apply Race Condition Fixes
Use the exact patterns from `RACE_CONDITION_FIXES.md` to fix:

1. **wallet.controller.ts**:
   - Fix `transfer()` function (move balance check inside transaction)
   - Fix `withdrawMpesa()` function (same pattern)

2. **merchant.controller.ts**:
   - Fix `processQRPayment()` function (move balance check inside transaction)

3. **mpesa.service.ts**:
   - Fix `handleCallback()` function (only process PENDING, use updateMany)

### Step 3: Apply Consistent Patterns
Ensure all fixes follow these security patterns:
- Balance checks INSIDE `$transaction()` blocks
- Use `updateMany()` with status checks for state transitions
- Check `updated.count` to detect race conditions
- Use `Serializable` isolation level for financial operations
- Add proper error handling and logging

### Step 4: Validate Fixes
After applying fixes:
- Ensure all functions compile without errors
- Verify transaction isolation levels are set
- Confirm error handling is preserved
- Check that logging is appropriate

## Success Criteria

### Functional Requirements
- [ ] All balance checks happen inside database transactions
- [ ] All status updates use `updateMany()` with status checks
- [ ] Race condition detection and logging implemented
- [ ] Transaction isolation levels properly set

### Security Requirements
- [ ] No possibility of double-spending under concurrent requests
- [ ] M-Pesa callbacks are idempotent (can be called multiple times safely)
- [ ] QR payments cannot succeed with insufficient balance
- [ ] Wallet transfers cannot exceed available balance

### Code Quality Requirements
- [ ] All TypeScript compilation errors resolved
- [ ] Error handling preserved and improved
- [ ] Logging added for race condition detection
- [ ] Code follows existing patterns and style

## Testing Strategy

### Manual Testing
After fixes are applied, test these scenarios:
1. **Concurrent Transfers**: Multiple transfer requests with same user
2. **Duplicate Callbacks**: Send same M-Pesa callback multiple times
3. **Insufficient Balance**: Try to transfer more than wallet balance
4. **QR Payment Race**: Multiple QR payment attempts simultaneously

### Expected Behavior
- Only one transfer should succeed per available balance
- Duplicate callbacks should be ignored (logged but not processed)
- Insufficient balance should always be rejected
- QR payments should be atomic and consistent

## Risk Mitigation

### Backup Strategy
Before making any changes:
```bash
cp backend/src/controllers/wallet.controller.ts backend/src/controllers/wallet.controller.ts.backup
cp backend/src/controllers/merchant.controller.ts backend/src/controllers/merchant.controller.ts.backup
cp backend/src/services/mpesa.service.ts backend/src/services/mpesa.service.ts.backup
```

### Rollback Plan
If any issues occur:
1. Restore from backup files
2. Restart backend service
3. Report issues for investigation

## Reference Materials

### Key Documentation
- `RACE_CONDITION_FIXES.md` - Contains exact code fixes to apply
- `SECURITY_FIXES_PHASE1.md` - Context on security vulnerabilities
- `IMPLEMENTATION_CHECKLIST.md` - Overall implementation status

### Code Patterns to Follow
All race condition fixes should follow this pattern:
```typescript
// BEFORE (vulnerable):
const wallet = await prisma.wallet.findUnique({ where: { userId } });
if (wallet.balance < amount) throw new Error("Insufficient balance");
await prisma.$transaction(async (tx) => {
  // Transaction logic here
});

// AFTER (secure):
await prisma.$transaction(async (tx) => {
  const wallet = await tx.wallet.findUnique({ where: { userId } });
  if (wallet.balance < amount) throw new Error("Insufficient balance");
  // Transaction logic here
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
```

## Completion Checklist

- [ ] Read and understand all three vulnerable files
- [ ] Apply race condition fix to `wallet.controller.ts` `transfer()` function
- [ ] Apply race condition fix to `wallet.controller.ts` `withdrawMpesa()` function  
- [ ] Apply race condition fix to `merchant.controller.ts` `processQRPayment()` function
- [ ] Apply race condition fix to `mpesa.service.ts` `handleCallback()` function
- [ ] Verify all TypeScript compilation passes
- [ ] Confirm transaction isolation levels are set
- [ ] Test basic functionality still works
- [ ] Document any issues or concerns

**Priority**: CRITICAL - This must be completed before any other security work
**Estimated Time**: 1-2 hours
**Risk Level**: HIGH - Financial security depends on these fixes