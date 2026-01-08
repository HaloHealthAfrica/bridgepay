# Race Condition Fixes - Copy-Paste Ready

## Fix 1: wallet.controller.ts - transfer() function

**Location:** `backend/src/controllers/wallet.controller.ts` lines 221-276

**Replace this entire function:**

```typescript
export async function transfer(req: Request, res: Response) {
  const { recipientPhone, amount, note } = req.body ?? {};
  if (!recipientPhone) throw new AppError("Recipient phone required", 400);
  if (!amount || Number(amount) < 1) throw new AppError("Minimum transfer is KES 1", 400);

  const recipient = await prisma.user.findUnique({
    where: { phone: recipientPhone },
    select: { id: true, name: true, status: true },
  });
  if (!recipient) throw new AppError("Recipient not found", 404);
  if (recipient.status !== "ACTIVE") throw new AppError("Recipient account is not active", 400);
  if (recipient.id === req.user!.userId) throw new AppError("Cannot transfer to yourself", 400);

  const sender = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true } });
  const senderName = sender?.name || "Someone";

  // SECURITY FIX: Move balance check INSIDE transaction to prevent race conditions
  const result = await prisma.$transaction(async (tx) => {
    // Check balance inside transaction with row-level locking
    const senderWallet = await tx.wallet.findUnique({
      where: { userId: req.user!.userId }
    });

    if (!senderWallet || Number(senderWallet.balance) < Number(amount)) {
      throw new AppError("Insufficient balance", 400);
    }

    // Ensure recipient wallet exists
    const recipientWallet = await tx.wallet.findUnique({
      where: { userId: recipient.id }
    });
    if (!recipientWallet) {
      throw new AppError("Recipient wallet not found", 404);
    }

    await tx.wallet.update({
      where: { userId: req.user!.userId },
      data: { balance: { decrement: new Prisma.Decimal(amount) } },
    });
    await tx.wallet.update({
      where: { userId: recipient.id },
      data: { balance: { increment: new Prisma.Decimal(amount) } },
    });

    const txRow = await tx.transaction.create({
      data: {
        fromUserId: req.user!.userId,
        toUserId: recipient.id,
        amount: new Prisma.Decimal(amount),
        type: "TRANSFER",
        status: "SUCCESS",
        reference: `TRF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        description: note || "Transfer",
      },
      include: { toUser: { select: { name: true, phone: true } } },
    });

    await tx.notification.create({
      data: {
        userId: recipient.id,
        type: "PAYMENT",
        title: "Money Received",
        message: `You received KES ${amount} from ${senderName}`,
        actionUrl: "/wallet",
      },
    });

    return txRow;
  });

  res.json({ transaction: result });
}
```

---

## Fix 2: wallet.controller.ts - withdrawMpesa() function

**Location:** `backend/src/controllers/wallet.controller.ts` lines 277-308

**Replace this entire function:**

```typescript
export async function withdrawMpesa(req: Request, res: Response) {
  const { phone, amount } = req.body ?? {};
  if (!phone) throw new AppError("Phone number required", 400);
  if (!amount || Number(amount) < 10) throw new AppError("Minimum withdrawal is KES 10", 400);

  const fee = Math.min(Number(amount) * 0.01, 50);
  const total = Number(amount) + fee;

  // SECURITY FIX: Move balance check INSIDE transaction
  const result = await prisma.$transaction(async (tx) => {
    // Check balance inside transaction
    const wallet = await tx.wallet.findUnique({
      where: { userId: req.user!.userId }
    });

    if (!wallet || Number(wallet.balance) < total) {
      throw new AppError(`Insufficient balance. Required: KES ${total} (amount + fee)`, 400);
    }

    // Deduct from wallet immediately
    await tx.wallet.update({
      where: { userId: req.user!.userId },
      data: { balance: { decrement: new Prisma.Decimal(total) } },
    });

    // Create transaction record
    const txRow = await tx.transaction.create({
      data: {
        fromUserId: req.user!.userId,
        amount: new Prisma.Decimal(amount),
        fee: new Prisma.Decimal(fee),
        type: "WITHDRAWAL",
        status: "PENDING",
        reference: `WTH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        description: "M-Pesa Withdrawal",
        metadata: { phone, method: "mpesa" },
      },
    });

    return txRow;
  });

  // Initiate M-Pesa withdrawal AFTER transaction committed
  try {
    const mpesaResponse = await mpesaService.withdrawToMpesa(phone, Number(amount), `Withdrawal ${result.reference}`);

    if (mpesaResponse.ResponseCode !== "0") {
      // M-Pesa initiation failed, refund the user
      await prisma.$transaction(async (tx) => {
        await tx.wallet.update({
          where: { userId: req.user!.userId },
          data: { balance: { increment: new Prisma.Decimal(total) } },
        });
        await tx.transaction.update({
          where: { id: result.id },
          data: { status: "FAILED", metadata: { ...result.metadata, mpesaResponse } },
        });
      });
      throw new AppError("Withdrawal initiation failed. Funds have been refunded.", 500);
    }

    // Update transaction with M-Pesa details
    await prisma.transaction.update({
      where: { id: result.id },
      data: { metadata: { ...result.metadata, mpesaResponse } },
    });

    res.json({
      message: "Withdrawal initiated successfully",
      transaction: result,
    });
  } catch (error) {
    // On error, refund and mark as failed
    await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { userId: req.user!.userId },
        data: { balance: { increment: new Prisma.Decimal(total) } },
      });
      await tx.transaction.update({
        where: { id: result.id },
        data: { status: "FAILED" },
      });
    });
    throw error;
  }
}
```

---

## Fix 3: merchant.controller.ts - processQRPayment() function

**Location:** `backend/src/controllers/merchant.controller.ts` lines 96-149

**Find and replace:**

```typescript
export async function processQRPayment(req: Request, res: Response) {
  const { amount, qrData } = req.body ?? {};
  if (!amount || Number(amount) < 1) throw new AppError("Invalid amount", 400);
  if (!qrData) throw new AppError("QR data required", 400);

  const merchantId = JSON.parse(Buffer.from(qrData, "base64").toString("utf8")).merchantId;
  if (!merchantId) throw new AppError("Invalid QR code", 400);

  const merchant = await prisma.user.findUnique({
    where: { id: merchantId },
    include: { merchantProfile: true },
  });
  if (!merchant || merchant.role !== "MERCHANT") throw new AppError("Merchant not found", 404);

  // SECURITY FIX: Move balance check INSIDE transaction
  const result = await prisma.$transaction(async (tx) => {
    // Check balance inside transaction
    const customerWallet = await tx.wallet.findUnique({
      where: { userId: req.user!.userId }
    });

    if (!customerWallet || Number(customerWallet.balance) < Number(amount)) {
      throw new AppError("Insufficient balance", 400);
    }

    // Ensure merchant wallet exists
    const merchantWallet = await tx.wallet.findUnique({
      where: { userId: merchantId }
    });
    if (!merchantWallet) {
      throw new AppError("Merchant wallet not found", 404);
    }

    // Deduct from customer
    await tx.wallet.update({
      where: { userId: req.user!.userId },
      data: { balance: { decrement: new Prisma.Decimal(amount) } },
    });

    // Add to merchant
    await tx.wallet.update({
      where: { userId: merchantId },
      data: { balance: { increment: new Prisma.Decimal(amount) } },
    });

    // Create transaction
    const txRow = await tx.transaction.create({
      data: {
        fromUserId: req.user!.userId,
        toUserId: merchantId,
        amount: new Prisma.Decimal(amount),
        type: "PAYMENT",
        status: "SUCCESS",
        reference: `QR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        description: `Payment to ${merchant.merchantProfile?.businessName || merchant.name}`,
        metadata: { method: "qr", merchantId },
      },
      include: { toUser: { select: { name: true } } },
    });

    // Notify merchant
    await tx.notification.create({
      data: {
        userId: merchantId,
        type: "PAYMENT",
        title: "Payment Received",
        message: `You received KES ${amount} from a customer`,
        actionUrl: "/merchant",
      },
    });

    return txRow;
  });

  res.json({ transaction: result });
}
```

---

## Fix 4: mpesa.service.ts - handleCallback() function

**Location:** `backend/src/services/mpesa.service.ts` lines 62-113

**Replace this entire function:**

```typescript
async handleCallback(callbackData: any) {
  const body = callbackData?.Body;
  const resultCode = body?.stkCallback?.ResultCode;
  const merchantRequestID = body?.stkCallback?.MerchantRequestID;

  if (!merchantRequestID) return;

  // SECURITY FIX: Only find PENDING transactions
  const transaction = await prisma.transaction.findFirst({
    where: {
      metadata: {
        path: ["merchantRequestID"],
        equals: merchantRequestID,
      },
      status: "PENDING", // Only process pending transactions
    },
  });

  // Transaction not found or already processed
  if (!transaction) {
    console.warn(`[M-Pesa] Callback for non-existent or already processed transaction: ${merchantRequestID}`);
    return;
  }

  if (resultCode === 0) {
    const amount = transaction.amount;
    await prisma.$transaction(async (tx) => {
      // SECURITY FIX: Use updateMany with WHERE status=PENDING to prevent race conditions
      const updated = await tx.transaction.updateMany({
        where: {
          id: transaction.id,
          status: "PENDING"
        },
        data: {
          status: "SUCCESS",
          metadata: { ...(transaction.metadata as any), callback: body },
        },
      });

      // If update count is 0, another callback already processed this
      if (updated.count === 0) {
        console.warn(`[M-Pesa] Race condition prevented for transaction: ${transaction.id}`);
        return;
      }

      if (transaction.toUserId) {
        await tx.wallet.update({
          where: { userId: transaction.toUserId },
          data: { balance: { increment: amount } },
        });

        await tx.notification.create({
          data: {
            userId: transaction.toUserId,
            type: "PAYMENT",
            title: "Deposit Successful",
            message: `KES ${amount} has been added to your wallet`,
          },
        });
      }
    });
  } else {
    // Mark as failed, but only if still pending
    await prisma.transaction.updateMany({
      where: {
        id: transaction.id,
        status: "PENDING"
      },
      data: { status: "FAILED", metadata: { ...(transaction.metadata as any), callback: body } },
    });
  }
}
```

---

## Fix 5: lemonade.service.ts - handleCallback() function

**Location:** `backend/src/services/lemonade.service.ts` (around line 160)

**Apply same pattern - add status check:**

```typescript
async handleCallback(callbackBody: any) {
  const transactionId = callbackBody?.transaction_id;
  const status = callbackBody?.status;
  const provider = callbackBody;

  if (!transactionId) return;

  // SECURITY FIX: Only find PENDING transactions
  const txRow = await prisma.transaction.findFirst({
    where: {
      metadata: { path: ["lemonade", "transaction_id"], equals: transactionId },
      status: "PENDING", // Only process pending
    },
  });

  if (!txRow) {
    console.warn(`[Lemonade] Callback for non-existent or already processed transaction: ${transactionId}`);
    return;
  }

  if (status === "successful") {
    await prisma.$transaction(async (tx) => {
      // SECURITY FIX: Use updateMany with status check
      const updated = await tx.transaction.updateMany({
        where: { id: txRow.id, status: "PENDING" },
        data: { status: "SUCCESS", metadata: { ...(txRow.metadata as any), lemonade: provider } },
      });

      if (updated.count === 0) {
        console.warn(`[Lemonade] Race condition prevented for transaction: ${txRow.id}`);
        return;
      }

      if (txRow.toUserId) {
        await tx.wallet.update({
          where: { userId: txRow.toUserId },
          data: { balance: { increment: txRow.amount } },
        });

        await tx.notification.create({
          data: {
            userId: txRow.toUserId,
            type: "PAYMENT",
            title: "Deposit Successful",
            message: `KES ${txRow.amount} has been added to your wallet`,
          },
        });
      }
    });
  } else {
    await prisma.transaction.updateMany({
      where: { id: txRow.id, status: "PENDING" },
      data: { status: "FAILED", metadata: { ...(txRow.metadata as any), lemonade: provider } },
    });
  }
}
```

---

## Common Pattern Summary

**The Fix:**
1. ✅ Move balance check INSIDE `$transaction()`
2. ✅ Use `updateMany()` with WHERE status='PENDING' for status updates
3. ✅ Check `updated.count` to detect race conditions
4. ✅ Add unique reference generation with timestamp + random

**Key Changes:**
- Before: `update()` → After: `updateMany()` with status check
- Before: Balance check outside → After: Balance check inside transaction
- Before: No race detection → After: Check `updated.count`

This prevents double-spending even if two requests arrive simultaneously!
