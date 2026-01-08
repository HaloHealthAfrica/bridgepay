import { z } from "zod";
import { TransactionType, TransactionStatus } from "@prisma/client";

// Transaction filter validation schemas
export const dateRangeSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
}).refine(data => data.startDate <= data.endDate, {
  message: "Start date must be before or equal to end date",
});

export const amountRangeSchema = z.object({
  min: z.number().min(0).optional(),
  max: z.number().min(0).optional(),
}).refine(data => {
  if (data.min !== undefined && data.max !== undefined) {
    return data.min <= data.max;
  }
  return true;
}, {
  message: "Minimum amount must be less than or equal to maximum amount",
});

export const transactionFiltersSchema = z.object({
  dateRange: dateRangeSchema.optional(),
  types: z.array(z.nativeEnum(TransactionType)).optional(),
  statuses: z.array(z.nativeEnum(TransactionStatus)).optional(),
  amountRange: amountRangeSchema.optional(),
  categories: z.array(z.string().uuid()).optional(),
  searchQuery: z.string().max(255).optional(),
});

// Pagination schema
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Filter preset schemas
export const createFilterPresetSchema = z.object({
  name: z.string().min(1).max(100),
  filters: transactionFiltersSchema,
  isDefault: z.boolean().default(false),
});

export const updateFilterPresetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  filters: transactionFiltersSchema.optional(),
  isDefault: z.boolean().optional(),
});

// Category schemas
export const createCategorySchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid hex color").default("#6B7280"),
  icon: z.string().max(10).optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid hex color").optional(),
  icon: z.string().max(10).optional(),
});

export const assignCategorySchema = z.object({
  categoryId: z.string().uuid(),
});

export const bulkCategorizeSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(100),
  categoryId: z.string().uuid(),
});

// Search schemas
export const searchTransactionsSchema = z.object({
  query: z.string().min(1).max(255),
  filters: transactionFiltersSchema.optional(),
});

export const searchSuggestionsSchema = z.object({
  partial: z.string().min(2).max(100),
});

// Export schemas
export const exportRequestSchema = z.object({
  format: z.enum(['CSV', 'PDF']),
  filters: transactionFiltersSchema.optional(),
  includeAnalytics: z.boolean().default(false),
  emailDelivery: z.boolean().default(false),
});

// Analytics schemas
export const analyticsDateRangeSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
}).refine(data => data.startDate <= data.endDate, {
  message: "Start date must be before or equal to end date",
});

export const periodComparisonSchema = z.object({
  period1: analyticsDateRangeSchema,
  period2: analyticsDateRangeSchema,
});

// Transaction update schemas
export const updateTransactionNotesSchema = z.object({
  notes: z.string().max(500).optional(),
});

export const updateTransactionTagsSchema = z.object({
  tags: z.array(z.string().max(50)).max(10),
});

// Receipt schemas
export const bulkReceiptGenerationSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(50),
});

// Validation helper functions
export function validateTransactionFilters(data: unknown) {
  return transactionFiltersSchema.parse(data);
}

export function validatePagination(data: unknown) {
  return paginationSchema.parse(data);
}

export function validateCreateCategory(data: unknown) {
  return createCategorySchema.parse(data);
}

export function validateSearchQuery(data: unknown) {
  return searchTransactionsSchema.parse(data);
}

export function validateExportRequest(data: unknown) {
  return exportRequestSchema.parse(data);
}

// Type exports for use in controllers
export type TransactionFiltersInput = z.infer<typeof transactionFiltersSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type SearchTransactionsInput = z.infer<typeof searchTransactionsSchema>;
export type ExportRequestInput = z.infer<typeof exportRequestSchema>;
export type AnalyticsDateRangeInput = z.infer<typeof analyticsDateRangeSchema>;
export type PeriodComparisonInput = z.infer<typeof periodComparisonSchema>;