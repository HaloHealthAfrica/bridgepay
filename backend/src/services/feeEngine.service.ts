import { Prisma, FeeFlow, FeePayer } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type FeeQuote = {
  flow: FeeFlow;
  method?: string;
  currency: string;
  feePayer: FeePayer;
  fee: Prisma.Decimal;
  scheduleId?: string;
};

function clampFee(fee: Prisma.Decimal, minFee: Prisma.Decimal, maxFee?: Prisma.Decimal | null) {
  let f = fee;
  if (f.lessThan(minFee)) f = minFee;
  if (maxFee !== null && maxFee !== undefined && f.greaterThan(maxFee)) f = maxFee;
  if (f.lessThan(0)) f = new Prisma.Decimal(0);
  return f;
}

function bpsFee(amount: Prisma.Decimal, bps: number) {
  // fee = amount * (bps / 10000)
  return amount.mul(new Prisma.Decimal(bps)).div(new Prisma.Decimal(10_000));
}

class FeeEngineService {
  async quote(args: { flow: FeeFlow; method?: string; currency?: string; amount: number | Prisma.Decimal }): Promise<FeeQuote> {
    const currency = args.currency || "KES";
    const amountDec = args.amount instanceof Prisma.Decimal ? args.amount : new Prisma.Decimal(args.amount);

    // Pick schedule: exact method first, then method=null fallback.
    const schedule =
      (await prisma.feeSchedule.findFirst({
        where: { active: true, flow: args.flow, currency, method: args.method || null },
        orderBy: { updatedAt: "desc" },
      })) ||
      (await prisma.feeSchedule.findFirst({
        where: { active: true, flow: args.flow, currency, method: null },
        orderBy: { updatedAt: "desc" },
      }));

    // Backward-compatible defaults (so existing behavior is preserved even with no schedules).
    const defaults = (() => {
      if ((args.flow === "WALLET_WITHDRAWAL" || args.flow === "WALLET_SEND_MPESA") && args.method === "BANK_A2P") {
        // Bank payout: 1% min 20, max 200
        return { feePayer: "SENDER" as FeePayer, bps: 100, flat: new Prisma.Decimal(0), minFee: new Prisma.Decimal(20), maxFee: new Prisma.Decimal(200) };
      }
      if (args.flow === "WALLET_WITHDRAWAL" || args.flow === "WALLET_SEND_MPESA") {
        // M-Pesa payout: 1% capped at 50 KES
        return { feePayer: "SENDER" as FeePayer, bps: 100, flat: new Prisma.Decimal(0), minFee: new Prisma.Decimal(0), maxFee: new Prisma.Decimal(50) };
      }
      return { feePayer: "SENDER" as FeePayer, bps: 0, flat: new Prisma.Decimal(0), minFee: new Prisma.Decimal(0), maxFee: null };
    })();

    let feePayer = schedule?.feePayer ?? defaults.feePayer;
    const bps = schedule?.bps ?? defaults.bps;
    const flat = schedule?.flat ?? defaults.flat;
    const minFee = schedule?.minFee ?? defaults.minFee;
    const maxFee = schedule?.maxFee ?? defaults.maxFee;

    const rawFee = bpsFee(amountDec, bps).add(flat);
    const fee = clampFee(rawFee, minFee, maxFee);

    // For provider-based pay-ins, we can’t “ask the provider for amount+fee” reliably without changing UX.
    // So we always apply deposit/card funding fees by reducing the credited amount (receiver pays).
    if (
      args.flow === "WALLET_DEPOSIT" ||
      args.flow === "MERCHANT_CARD_PAY" ||
      args.flow === "PROJECT_FUND_CARD"
    ) {
      feePayer = "RECEIVER";
    }

    return {
      flow: args.flow,
      ...(args.method ? { method: args.method } : {}),
      currency,
      feePayer,
      fee,
      ...(schedule?.id ? { scheduleId: schedule.id } : {}),
    };
  }
}

export default new FeeEngineService();


