-- Add IdempotencyKey table for cross-instance idempotency on payment endpoints

CREATE TABLE IF NOT EXISTS "IdempotencyKey" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "endpoint" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "response" JSONB,
  "statusCode" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- Mirrors schema.prisma @@unique([userId, endpoint, requestHash])
CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyKey_userId_endpoint_requestHash_key"
  ON "IdempotencyKey"("userId", "endpoint", "requestHash");

CREATE INDEX IF NOT EXISTS "IdempotencyKey_expiresAt_idx"
  ON "IdempotencyKey"("expiresAt");


