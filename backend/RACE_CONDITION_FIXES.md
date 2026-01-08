# Race Condition Fixes Reference

## Summary
This document shows the exact fixes needed for all race conditions in the payment controllers.

## Files Modified
1. `src/controllers/wallet.controller.ts` - 4 functions fixed
2. `src/controllers/merchant.controller.ts` - 1 function fixed
3. `src/controllers/project.controller.ts` - 1 function fixed

---

## wallet.controller.ts Fixes

### Already Added: crypto import
```typescript
import crypto from "crypto";  // Added at line 3
```

### Fix 1: transfer() function (lines 223-279)

**BEFORE:**
```typescript
const senderWallet = await prisma.wallet.findUnique({ where: { userId: req.user!.userId } });
if (!senderWallet || Number(senderWallet.balance) < Number(amount)) throw new AppError("Insufficient balance", 400);

const result = await prisma.$transaction(async (tx) => {
  await tx.wallet.update({
    where: { userId: req.user!.userId },
    data: { balance: { decrement: new Prisma.Decimal(amount) } },
  });
  // ... rest
  reference: `TRF-${Date.now()}`,
});
```

**AFTER:**
```typescript
// Remove balance check from outside transaction

const result = await prisma.$transaction(
  async (tx) => {
    // Check balance INSIDE transaction
    const senderWallet = await tx.wallet.findUnique({ where: { userId: req.user!.userId } });
    if (!senderWallet || Number(senderWallet.balance) < Number(amount)) {
      throw new AppError("Insufficient balance", 400);
    }

    await tx.wallet.update({
      where: { userId: req.user!.userId },
      data: { balance: { decrement: new Prisma.Decimal(amount) } },
    });
    // ... rest
    reference: crypto.randomUUID(),  // Fixed
  },
  {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 10000,
  }
);
```

### Fix 2: depositMpesa() - Line 66
**BEFORE:** `reference = \`MPESA-DEP-${Date.now()}\`;`
**AFTER:** `reference = crypto.randomUUID();`

### Fix 3: depositCard() - Line 120
**BEFORE:** `reference = \`CARD-DEP-${Date.now()}\`;`
**AFTER:** `reference = crypto.randomUUID();`

### Fix 4: withdrawMpesa() function (lines 280-340)

**Key Changes:**
1. Move balance check (lines 288-289) INSIDE the transaction
2. Add isolation level
3. Replace reference generation

```typescript
// AFTER:
const created = await prisma.$transaction(
  async (tx) => {
    // Check balance INSIDE transaction
    const wallet = await tx.wallet.findUnique({ where: { userId: req.user!.userId } });
    if (!wallet || Number(wallet.balance) < total) {
      throw new AppError("Insufficient balance", 400);
    }

    await tx.wallet.update({
      where: { userId: req.user!.userId },
      data: { balance: { decrement: new Prisma.Decimal(total) } },
    });

    return tx.transaction.create({
      data: {
        fromUserId: req.user!.userId,
        amount: new Prisma.Decimal(amount),
        fee: new Prisma.Decimal(fee),
        type: "WITHDRAWAL",
        status: "PENDING",
        reference: crypto.randomUUID(),  // Fixed
        description: `M-Pesa withdrawal to ${phone}`,
        metadata: { phone, method: "mpesa" },
      },
    });
  },
  {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 10000,
  }
);
```

### Fix 5: sendMpesa() - Same pattern as withdrawMpesa
### Fix 6: withdrawBank() - Same pattern as withdrawMpesa

---

## merchant.controller.ts Fixes

### Add crypto import
```typescript
import crypto from "crypto";
```

### Fix: processQRPayment() function

**Move balance check inside transaction (around line 105-106)**

```typescript
const created = await prisma.$transaction(
  async (tx) => {
    // Check balance INSIDE transaction
    const customerWallet = await tx.wallet.findUnique({ where: { userId: customerId } });
    if (!customerWallet || Number(customerWallet.balance) < amount) {
      throw new AppError("Insufficient balance", 400);
    }

    // Atomic updates
    await tx.wallet.update({
      where: { userId: customerId },
      data: { balance: { decrement: new Prisma.Decimal(amount) } },
    });

    await tx.wallet.update({
      where: { userId: merchantId },
      data: { balance: { increment: new Prisma.Decimal(amount) } },
    });

    return tx.transaction.create({
      data: {
        fromUserId: customerId,
        toUserId: merchantId,
        amount: new Prisma.Decimal(amount),
        type: "PAYMENT",
        status: "SUCCESS",
        reference: crypto.randomUUID(),  // Fixed
        description: "QR payment",
        metadata: { method: "qr", merchantId },
      },
    });
  },
  {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 10000,
  }
);
```

---

## project.controller.ts Fixes

### Add crypto import
```typescript
import crypto from "crypto";
```

### Fix: fundProject() function (around line 255-256)

**Move balance check inside transaction**

```typescript
const result = await prisma.$transaction(
  async (tx) => {
    // Check balance INSIDE transaction
    const wallet = await tx.wallet.findUnique({ where: { userId: req.user!.userId } });
    if (!wallet || Number(wallet.balance) < Number(project.budget)) {
      throw new AppError("Insufficient balance", 400);
    }

    // Move funds to escrow
    await tx.wallet.update({
      where: { userId: req.user!.userId },
      data: {
        balance: { decrement: project.budget },
        escrowBalance: { increment: project.budget }
      },
    });

    await tx.project.update({
      where: { id: projectId },
      data: {
        escrowBalance: { increment: project.budget },
        status: "ACTIVE"
      },
    });

    return tx.transaction.create({
      data: {
        fromUserId: req.user!.userId,
        amount: project.budget,
        type: "ESCROW_LOCK",
        status: "SUCCESS",
        reference: crypto.randomUUID(),  // Fixed
        description: `Funded project: ${project.title}`,
        metadata: { projectId, method: "wallet" },
      },
    });
  },
  {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 10000,
  }
);
```

---

## Quick Reference: Pattern to Apply

For ALL functions with race conditions:

1. **Remove** balance check from outside transaction
2. **Move** balance check to first line inside transaction callback
3. **Add** isolation level parameter: `{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 }`
4. **Replace** all `Date.now()` references with `crypto.randomUUID()`

---

## Testing After Fixes

Run this test to verify race conditions are fixed:

```typescript
// Test concurrent transfers
const results = await Promise.allSettled([
  transfer(userId, 'recipient1', 600),
  transfer(userId, 'recipient2', 600),
]);

// Should only allow ONE to succeed (wallet has 1000)
const successful = results.filter(r => r.status === 'fulfilled').length;
expect(successful).toBe(1);  // Not 2!
```
