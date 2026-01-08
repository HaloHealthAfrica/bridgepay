import axios from "axios";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import platformLedger from "./platformLedger.service";
import feeEngine from "./feeEngine.service";

function normalizeKenyanPhone(phone: string) {
  const trimmed = phone.replace(/\s+/g, "");
  if (trimmed.startsWith("254")) return trimmed;
  if (trimmed.startsWith("+254")) return trimmed.slice(1);
  if (trimmed.startsWith("0")) return `254${trimmed.slice(1)}`;
  return trimmed;
}

class MpesaService {
  private baseUrl: string;
  private consumerKey: string;
  private consumerSecret: string;

  constructor() {
    this.baseUrl =
      process.env.MPESA_ENVIRONMENT === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
    this.consumerKey = process.env.MPESA_CONSUMER_KEY || "";
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET || "";
  }

  async getAccessToken(): Promise<string> {
    const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString("base64");
    const { data } = await axios.get(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    return data.access_token;
  }

  async initiateSTKPush(phone: string, amount: number, accountReference: string) {
    const token = await this.getAccessToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, -3);
    const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString(
      "base64"
    );

    const partyA = normalizeKenyanPhone(phone);

    const payload = {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(amount),
      PartyA: partyA,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: partyA,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: accountReference,
      TransactionDesc: "Bridge Deposit",
    };

    const { data } = await axios.post(`${this.baseUrl}/mpesa/stkpush/v1/processrequest`, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return data;
  }

  async handleCallback(callbackData: any) {
    const body = callbackData?.Body;
    const resultCode = body?.stkCallback?.ResultCode;
    const merchantRequestID = body?.stkCallback?.MerchantRequestID;

    if (!merchantRequestID) return;

    // SECURITY FIX: Only find PENDING transactions to prevent duplicate processing
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
      const fee = transaction.fee ?? new Prisma.Decimal(0);
      const net = amount.sub(fee);
      await prisma.$transaction(async (tx) => {
        // SECURITY FIX: Use updateMany with WHERE status=PENDING to prevent race conditions
        const updated = await tx.transaction.updateMany({
          where: { id: transaction.id, status: "PENDING" },
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
            data: { balance: { increment: net.lessThan(0) ? new Prisma.Decimal(0) : net } },
          });

          if (fee.gt(0)) {
            const w = await tx.wallet.findUnique({ where: { userId: transaction.toUserId } });
            await platformLedger.creditFeeRevenue(tx, {
              currency: w?.currency || "KES",
              amount: fee,
              transactionId: transaction.id,
              reference: transaction.reference,
              metadata: { flow: "WALLET_DEPOSIT", method: "MPESA_STK" },
            });
          }

          await tx.notification.create({
            data: {
              userId: transaction.toUserId,
              type: "PAYMENT",
              title: "Deposit Successful",
              message: `KES ${Number(net.lessThan(0) ? 0 : net)} has been added to your wallet`,
            },
          });
        }
      });
    } else {
      // Mark as failed, but only if still pending
      await prisma.transaction.updateMany({
        where: { id: transaction.id, status: "PENDING" },
        data: { status: "FAILED", metadata: { ...(transaction.metadata as any), callback: body } },
      });
    }
  }

  async checkTransactionStatus(checkoutRequestID: string) {
    const token = await this.getAccessToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, -3);
    const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString(
      "base64"
    );

    const { data } = await axios.post(
      `${this.baseUrl}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestID,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return data;
  }

  async withdrawToMpesa(phone: string, amount: number, remarks: string) {
    const token = await this.getAccessToken();
    const partyB = normalizeKenyanPhone(phone);

    const payload = {
      InitiatorName: process.env.MPESA_B2C_INITIATOR,
      SecurityCredential: process.env.MPESA_B2C_PASSWORD,
      CommandID: "BusinessPayment",
      Amount: Math.round(amount),
      PartyA: process.env.MPESA_SHORTCODE,
      PartyB: partyB,
      Remarks: remarks,
      QueueTimeOutURL: `${process.env.MPESA_CALLBACK_URL}/timeout`,
      ResultURL: `${process.env.MPESA_CALLBACK_URL}/b2c`,
      Occasion: "Withdrawal",
    };

    const { data } = await axios.post(`${this.baseUrl}/mpesa/b2c/v1/paymentrequest`, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return data;
  }

  // C2B Confirmation handler (Paybill)
  async handleC2BConfirmation(payload: any) {
    // Expected Safaricom C2B payload fields:
    // - TransID, TransTime, TransAmount, BusinessShortCode, BillRefNumber, MSISDN, FirstName, MiddleName, LastName
    const transId = String(payload?.TransID || payload?.TransId || payload?.transId || payload?.transID || "").trim();
    const billRef = String(payload?.BillRefNumber || payload?.billRefNumber || payload?.AccountReference || "").trim();
    const transAmount = Number(payload?.TransAmount || payload?.transAmount || payload?.amount || 0);

    if (!transId || !billRef || !Number.isFinite(transAmount) || transAmount <= 0) return;

    // Our Paybill account reference is `BR-${userId}`
    const userId = billRef.startsWith("BR-") ? billRef.slice("BR-".length) : null;
    if (!userId) return;

    // Idempotency: if we've already processed this TransID, do nothing.
    const existing = await prisma.transaction.findFirst({
      where: {
        OR: [
          { reference: `C2B-${transId}` },
          { metadata: { path: ["mpesaC2B", "TransID"], equals: transId } },
          { metadata: { path: ["mpesaC2B", "transId"], equals: transId } },
        ],
      },
      select: { id: true },
    });
    if (existing) return;

    await prisma.$transaction(async (tx) => {
      // Try to reconcile an existing pending Paybill instruction transaction (best effort)
      const pending = await tx.transaction.findFirst({
        where: {
          toUserId: userId,
          type: "DEPOSIT",
          status: "PENDING",
          metadata: { path: ["method"], equals: "paybill" },
        } as any,
        orderBy: { createdAt: "desc" },
      });

      // Fee is computed on the actual callback amount (PSP-grade billing)
      const feeQuote = await feeEngine.quote({
        flow: "WALLET_DEPOSIT",
        method: "PAYBILL",
        currency: "KES",
        amount: new Prisma.Decimal(transAmount),
      });
      const fee = feeQuote.fee;
      const creditAmount = new Prisma.Decimal(transAmount);
      const netCredit = creditAmount.sub(fee);
      if (netCredit.lte(0)) return;

      if (pending) {
        const updated = await tx.transaction.updateMany({
          where: { id: pending.id, status: "PENDING" },
          data: {
            status: "SUCCESS",
            amount: creditAmount,
            fee,
            reference: `C2B-${transId}`,
            metadata: {
              ...(pending.metadata as any),
              mpesaC2B: payload,
              mpesaC2BTransId: transId,
              fee: { scheduleId: feeQuote.scheduleId, feePayer: feeQuote.feePayer, amount: Number(fee) },
            },
          },
        });
        if (updated.count !== 1) return;
      } else {
        await tx.transaction.create({
          data: {
            toUserId: userId,
            fromUserId: null,
            amount: creditAmount,
            fee,
            type: "DEPOSIT",
            status: "SUCCESS",
            reference: `C2B-${transId}`,
            description: "Paybill deposit",
            metadata: {
              method: "paybill",
              accountReference: billRef,
              mpesaC2B: payload,
              fee: { scheduleId: feeQuote.scheduleId, feePayer: feeQuote.feePayer, amount: Number(fee) },
            },
          },
        });
      }

      await tx.wallet.update({
        where: { userId },
        data: { balance: { increment: netCredit } },
      });

      if (fee.gt(0)) {
        const w = await tx.wallet.findUnique({ where: { userId } });
        await platformLedger.creditFeeRevenue(tx, {
          currency: w?.currency || "KES",
          amount: fee,
          reference: `C2B-${transId}`,
          metadata: { flow: "WALLET_DEPOSIT", method: "PAYBILL" },
        });
      }

      await tx.notification.create({
        data: {
          userId,
          type: "PAYMENT",
          title: "Paybill Deposit Received",
          message: `KES ${Number(netCredit)} added to your wallet`,
          actionUrl: "/wallet",
        },
      });
    });
  }

  // B2C result handler (withdrawals / send money)
  async handleB2CResult(payload: any) {
    const result = payload?.Result || payload?.result || payload;
    const resultCode = Number(result?.ResultCode ?? result?.resultCode);
    const originatorConversationID = String(
      result?.OriginatorConversationID ?? result?.originatorConversationID ?? ""
    ).trim();

    if (!originatorConversationID) return;

    const txRow = await prisma.transaction.findFirst({
      where: {
        status: "PENDING",
        type: "WITHDRAWAL",
        metadata: { path: ["originatorConversationID"], equals: originatorConversationID },
      },
    });
    if (!txRow) return;

    const mapped = resultCode === 0 ? "SUCCESS" : "FAILED";

    await prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.updateMany({
        where: { id: txRow.id, status: "PENDING" },
        data: { status: mapped, metadata: { ...(txRow.metadata as any), mpesaB2C: payload } },
      });
      if (updated.count !== 1) return;

      const wallet = txRow.fromUserId ? await tx.wallet.findUnique({ where: { userId: txRow.fromUserId } }) : null;
      const currency = wallet?.currency || "KES";

      if (mapped === "SUCCESS") {
        // Clear payout principal from platform clearing (we already moved it there on initiation)
        await platformLedger.debitPayoutClearing(tx, {
          currency,
          amount: txRow.amount,
          transactionId: txRow.id,
          reference: txRow.reference,
          metadata: { provider: "mpesa", resultCode },
        });
      }

      if (mapped === "FAILED" && txRow.fromUserId) {
        const refundTotal = txRow.amount.plus(txRow.fee);
        await tx.wallet.update({
          where: { userId: txRow.fromUserId },
          data: { balance: { increment: refundTotal } },
        });

        // Reverse platform postings (principal + fee)
        await platformLedger.debitPayoutClearing(tx, {
          currency,
          amount: txRow.amount,
          transactionId: txRow.id,
          reference: txRow.reference,
          metadata: { provider: "mpesa", resultCode, reason: "FAILED" },
        });
        await platformLedger.debitFeeRevenue(tx, {
          currency,
          amount: txRow.fee,
          transactionId: txRow.id,
          reference: txRow.reference,
          metadata: { provider: "mpesa", resultCode, reason: "FAILED" },
        });

        await tx.notification.create({
          data: {
            userId: txRow.fromUserId,
            type: "PAYMENT",
            title: "Withdrawal Failed",
            message: `Your M-Pesa payout failed. KES ${Number(refundTotal)} was returned to your wallet.`,
            actionUrl: "/wallet/history",
          },
        });
      }
    });
  }

  // B2C timeout handler (do not auto-refund; provider may still send result later)
  async handleB2CTimeout(payload: any) {
    const result = payload?.Result || payload?.result || payload;
    const originatorConversationID = String(
      result?.OriginatorConversationID ?? result?.originatorConversationID ?? ""
    ).trim();
    if (!originatorConversationID) return;

    const txRow = await prisma.transaction.findFirst({
      where: {
        status: "PENDING",
        type: "WITHDRAWAL",
        metadata: { path: ["originatorConversationID"], equals: originatorConversationID },
      },
    });
    if (!txRow) return;

    await prisma.transaction.updateMany({
      where: { id: txRow.id, status: "PENDING" },
      data: { metadata: { ...(txRow.metadata as any), mpesaB2CTimeout: payload } },
    });
  }
}

export default new MpesaService();




