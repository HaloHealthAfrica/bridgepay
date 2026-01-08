import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";
import { AppError } from "./errorHandler";

// Kenyan phone number regex: +254XXXXXXXXX or 07XXXXXXXX or 01XXXXXXXX
const kenyanPhoneRegex = /^(\+254|0)?[17]\d{8}$/;

// Helper to normalize Kenyan phone numbers to +254 format
export function normalizeKenyanPhone(phone: string): string {
  const cleaned = phone.replace(/\s+/g, "");
  if (cleaned.startsWith("+254")) {
    return cleaned;
  } else if (cleaned.startsWith("0")) {
    return "+254" + cleaned.slice(1);
  } else if (cleaned.startsWith("254")) {
    return "+" + cleaned;
  }
  return cleaned;
}

// Custom Zod refinements
export const kenyanPhoneSchema = z
  .string()
  .min(1, "Phone number is required")
  .regex(kenyanPhoneRegex, "Invalid Kenyan phone number format. Use +254XXXXXXXXX or 07XXXXXXXX")
  .transform(normalizeKenyanPhone);

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const amountSchema = z
  .union([z.string(), z.number()])
  .transform((val) => Number(val))
  .refine((val) => !isNaN(val) && val > 0, "Amount must be a positive number")
  .refine((val) => val <= 1000000, "Amount cannot exceed 1,000,000 KES")
  .refine((val) => Number.isFinite(val), "Amount must be finite");

export const emailSchema = z
  .string()
  .email("Invalid email format")
  .min(1, "Email is required");

// Validation middleware factory
export function validate(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
        next(new AppError(messages.join(", "), 400));
      } else {
        next(error);
      }
    }
  };
}

// Validation schemas for different endpoints
export const authSchemas = {
  register: z.object({
    email: emailSchema,
    phone: kenyanPhoneSchema,
    password: passwordSchema,
    name: z.string().min(1, "Name is required").max(100, "Name too long"),
    // Public registration is restricted to non-privileged roles.
    // Privileged roles (ADMIN/KYC_VERIFIER/PROJECT_VERIFIER) must be assigned by an admin.
    role: z.enum(["CUSTOMER", "MERCHANT", "IMPLEMENTER"]).optional(),
  }),
  login: z.object({
    email: emailSchema,
    password: z.string().min(1, "Password is required"),
  }),
};

export const walletSchemas = {
  depositMpesa: z.object({
    amount: amountSchema.refine((val) => val >= 1, "Minimum deposit is 1 KES"),
    phone: kenyanPhoneSchema,
  }),
  depositCard: z.object({
    amount: amountSchema.refine((val) => val >= 1, "Minimum deposit is 1 KES"),
  }),
  transfer: z.object({
    amount: amountSchema.refine((val) => val >= 1, "Minimum transfer is 1 KES"),
    recipientPhone: kenyanPhoneSchema,
    note: z.string().max(200, "Note too long").optional(),
  }),
  sendMpesa: z.object({
    amount: amountSchema.refine((val) => val >= 10, "Minimum send is 10 KES"),
    phone: kenyanPhoneSchema,
    note: z.string().max(200, "Note too long").optional(),
  }),
  withdraw: z.object({
    amount: amountSchema.refine((val) => val >= 10, "Minimum withdrawal is 10 KES"),
    phone: kenyanPhoneSchema,
  }),
  withdrawBank: z.object({
    amount: amountSchema.refine((val) => val >= 50, "Minimum bank transfer is 50 KES"),
    bankCode: z.string().min(1, "Bank code is required").max(50),
    accountNumber: z.string().min(4, "Account number is required").max(50),
    accountName: z.string().min(2, "Account name is required").max(120),
    note: z.string().max(200, "Note too long").optional(),
  }),
  depositPaybill: z.object({
    amount: amountSchema.refine((val) => val >= 1, "Minimum deposit is 1 KES"),
  }),
};

export const merchantSchemas = {
  processQRPayment: z.object({
    merchantId: z.string().min(1, "merchantId is required"),
    amount: amountSchema.refine((val) => val >= 1, "Minimum payment is 1 KES"),
    note: z.string().max(200, "Note too long").optional(),
  }),
  initiateCardPayment: z.object({
    merchantId: z.string().min(1, "merchantId is required"),
    amount: amountSchema.refine((val) => val >= 1, "Minimum payment is 1 KES"),
    note: z.string().max(200, "Note too long").optional(),
  }),
  updateProfile: z.object({
    businessName: z.string().min(1, "Business name is required").max(200).optional(),
    businessDescription: z.string().max(1000).optional(),
    category: z.string().max(100).optional(),
  }),
};

export const projectSchemas = {
  create: z.object({
    title: z.string().min(1, "Title is required").max(200, "Title too long"),
    description: z.string().min(1, "Description is required").max(5000, "Description too long"),
    category: z.string().min(1, "Category is required").max(100),
    budget: amountSchema.refine((val) => val >= 100, "Minimum budget is 100 KES"),
    milestones: z
      .array(
        z.object({
          title: z.string().min(1, "Milestone title required").max(200),
          description: z.string().max(2000),
          amount: amountSchema,
        })
      )
      .min(1, "At least one milestone is required"),
  }),
  fundCard: z.object({
    amount: amountSchema.refine((val) => val >= 1, "Minimum funding amount is 1 KES"),
  }),
};

export const feeSchemas = {
  createSchedule: z.object({
    active: z.boolean().optional(),
    name: z.string().min(1, "name is required").max(200),
    flow: z.enum([
      "WALLET_DEPOSIT",
      "WALLET_WITHDRAWAL",
      "WALLET_TRANSFER",
      "WALLET_SEND_MPESA",
      "MERCHANT_QR_PAY",
      "MERCHANT_CARD_PAY",
      "PROJECT_FUND_WALLET",
      "PROJECT_FUND_CARD",
    ]),
    method: z.string().max(50).nullable().optional(),
    currency: z.string().min(3).max(10).default("KES").optional(),
    feePayer: z.enum(["SENDER", "RECEIVER"]).optional(),
    bps: z.number().int().min(0).max(50_000).optional(),
    flat: z.union([z.string(), z.number()]).transform((v) => Number(v)).optional(),
    minFee: z.union([z.string(), z.number()]).transform((v) => Number(v)).optional(),
    maxFee: z.union([z.string(), z.number()]).transform((v) => Number(v)).nullable().optional(),
    metadata: z.any().optional(),
  }),
  updateSchedule: z.object({
    active: z.boolean().optional(),
    name: z.string().min(1).max(200).optional(),
    flow: z
      .enum([
        "WALLET_DEPOSIT",
        "WALLET_WITHDRAWAL",
        "WALLET_TRANSFER",
        "WALLET_SEND_MPESA",
        "MERCHANT_QR_PAY",
        "MERCHANT_CARD_PAY",
        "PROJECT_FUND_WALLET",
        "PROJECT_FUND_CARD",
      ])
      .optional(),
    method: z.string().max(50).nullable().optional(),
    currency: z.string().min(3).max(10).optional(),
    feePayer: z.enum(["SENDER", "RECEIVER"]).optional(),
    bps: z.number().int().min(0).max(50_000).optional(),
    flat: z.union([z.string(), z.number()]).transform((v) => Number(v)).optional(),
    minFee: z.union([z.string(), z.number()]).transform((v) => Number(v)).optional(),
    maxFee: z.union([z.string(), z.number()]).transform((v) => Number(v)).nullable().optional(),
    metadata: z.any().optional(),
  }),
  settleRevenue: z.object({
    currency: z.string().min(3).max(10).default("KES").optional(),
    amount: amountSchema,
    reference: z.string().max(100).optional(),
    note: z.string().max(500).optional(),
  }),
};
