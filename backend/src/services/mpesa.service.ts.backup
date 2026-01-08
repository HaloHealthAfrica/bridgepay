import axios from "axios";
import { prisma } from "../lib/prisma";

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

    const transaction = await prisma.transaction.findFirst({
      where: {
        metadata: {
          path: ["merchantRequestID"],
          equals: merchantRequestID,
        },
      },
    });

    if (!transaction) return;

    if (resultCode === 0) {
      const amount = transaction.amount;
      await prisma.$transaction(async (tx) => {
        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: "SUCCESS",
            metadata: { ...(transaction.metadata as any), callback: body },
          },
        });

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
      await prisma.transaction.update({
        where: { id: transaction.id },
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
}

export default new MpesaService();


