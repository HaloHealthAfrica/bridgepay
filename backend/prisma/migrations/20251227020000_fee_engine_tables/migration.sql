-- Fee engine tables for PSP billing (FeeSchedule + PlatformAccount + PlatformLedgerEntry)

-- Enums (Prisma usually manages these, but for raw SQL migration we create them if missing)
DO $$ BEGIN
  CREATE TYPE "FeeFlow" AS ENUM (
    'WALLET_DEPOSIT',
    'WALLET_WITHDRAWAL',
    'WALLET_TRANSFER',
    'WALLET_SEND_MPESA',
    'MERCHANT_QR_PAY',
    'MERCHANT_CARD_PAY',
    'PROJECT_FUND_WALLET',
    'PROJECT_FUND_CARD'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "FeePayer" AS ENUM ('SENDER','RECEIVER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PlatformLedgerEntryType" AS ENUM (
    'FEE_REVENUE_CREDIT',
    'FEE_REVENUE_DEBIT',
    'PAYOUT_CLEARING_CREDIT',
    'PAYOUT_CLEARING_DEBIT'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "FeeSchedule" (
  "id" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "name" TEXT NOT NULL,
  "flow" "FeeFlow" NOT NULL,
  "method" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'KES',
  "feePayer" "FeePayer" NOT NULL DEFAULT 'SENDER',
  "bps" INTEGER NOT NULL DEFAULT 0,
  "flat" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "minFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "maxFee" DECIMAL(12,2),
  "metadata" JSONB,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeeSchedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FeeSchedule_active_idx" ON "FeeSchedule"("active");
CREATE INDEX IF NOT EXISTS "FeeSchedule_flow_idx" ON "FeeSchedule"("flow");
CREATE INDEX IF NOT EXISTS "FeeSchedule_currency_idx" ON "FeeSchedule"("currency");
CREATE INDEX IF NOT EXISTS "FeeSchedule_method_idx" ON "FeeSchedule"("method");
CREATE INDEX IF NOT EXISTS "FeeSchedule_createdAt_idx" ON "FeeSchedule"("createdAt");

CREATE TABLE IF NOT EXISTS "PlatformAccount" (
  "id" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "feeRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "payoutClearing" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformAccount_currency_key" ON "PlatformAccount"("currency");

CREATE TABLE IF NOT EXISTS "PlatformLedgerEntry" (
  "id" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "type" "PlatformLedgerEntryType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "transactionId" TEXT,
  "reference" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformLedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PlatformLedgerEntry_currency_idx" ON "PlatformLedgerEntry"("currency");
CREATE INDEX IF NOT EXISTS "PlatformLedgerEntry_type_idx" ON "PlatformLedgerEntry"("type");
CREATE INDEX IF NOT EXISTS "PlatformLedgerEntry_createdAt_idx" ON "PlatformLedgerEntry"("createdAt");
CREATE INDEX IF NOT EXISTS "PlatformLedgerEntry_transactionId_idx" ON "PlatformLedgerEntry"("transactionId");


