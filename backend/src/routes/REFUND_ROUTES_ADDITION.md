# Refund Routes Addition

## Add to `src/routes/wallet.routes.ts`

Add these imports at the top:

```typescript
import {
  createRefund,
  getRefunds,
  checkRefundEligibility,
} from "../controllers/refund.controller";
import { idempotencyMiddleware } from "../middleware/idempotency.v2";  // Use new version
```

Add these routes (after existing wallet routes):

```typescript
// Refund endpoints
walletRouter.post(
  "/refund",
  requireAuth,
  idempotencyMiddleware,  // IMPORTANT: Prevent duplicate refunds
  asyncHandler(createRefund)
);

walletRouter.get(
  "/refunds",
  requireAuth,
  asyncHandler(getRefunds)
);

walletRouter.get(
  "/refund/check/:transactionId",
  requireAuth,
  asyncHandler(checkRefundEligibility)
);
```

## Complete Example

```typescript
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { idempotencyMiddleware } from "../middleware/idempotency.v2";
import * as walletController from "../controllers/wallet.controller";
import {
  createRefund,
  getRefunds,
  checkRefundEligibility,
} from "../controllers/refund.controller";

export const walletRouter = Router();

// Existing wallet routes
walletRouter.get("/balance", requireAuth, asyncHandler(walletController.getBalance));
walletRouter.get("/transactions", requireAuth, asyncHandler(walletController.getTransactions));

// Deposit routes
walletRouter.post("/deposit/mpesa", requireAuth, idempotencyMiddleware, asyncHandler(walletController.depositMpesa));
walletRouter.post("/deposit/card", requireAuth, idempotencyMiddleware, asyncHandler(walletController.depositCard));

// Transfer routes
walletRouter.post("/transfer", requireAuth, idempotencyMiddleware, asyncHandler(walletController.transfer));

// Withdrawal routes
walletRouter.post("/withdraw/mpesa", requireAuth, idempotencyMiddleware, asyncHandler(walletController.withdrawMpesa));
walletRouter.post("/withdraw/bank", requireAuth, idempotencyMiddleware, asyncHandler(walletController.withdrawBank));

// Refund routes (NEW)
walletRouter.post("/refund", requireAuth, idempotencyMiddleware, asyncHandler(createRefund));
walletRouter.get("/refunds", requireAuth, asyncHandler(getRefunds));
walletRouter.get("/refund/check/:transactionId", requireAuth, asyncHandler(checkRefundEligibility));

export default walletRouter;
```

## API Documentation

### POST /api/wallet/refund

Request refund for a transaction.

**Headers:**
- `Authorization: Bearer <token>`
- `Idempotency-Key: <uuid>` (required)

**Body:**
```json
{
  "transactionId": "uuid",
  "amount": 500,  // Optional: for partial refund
  "reason": "Customer requested refund"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "refundId": "uuid",
    "amount": 500,
    "originalTransactionId": "uuid",
    "message": "Refund processed successfully"
  }
}
```

### GET /api/wallet/refunds

Get refund history for authenticated user.

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "refunds": [
      {
        "id": "uuid",
        "amount": "500",
        "status": "SUCCESS",
        "type": "REFUND",
        "reference": "uuid",
        "description": "Refund: Customer requested refund",
        "createdAt": "2025-12-20T...",
        "metadata": {
          "originalTransactionId": "uuid",
          "refundReason": "Customer requested refund"
        }
      }
    ],
    "count": 1
  }
}
```

### GET /api/wallet/refund/check/:transactionId

Check if transaction can be refunded.

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "canRefund": true
  }
}
```

Or if not refundable:

```json
{
  "success": true,
  "data": {
    "canRefund": false,
    "reason": "Transaction already refunded"
  }
}
```
