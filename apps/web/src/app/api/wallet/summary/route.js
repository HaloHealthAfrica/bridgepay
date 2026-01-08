import { getOrCreateWallet } from "../_helpers";
import {
  successResponse,
  ErrorCodes,
  withErrorHandling,
  errorResponse,
} from "@/app/api/utils/errorHandler";
import { getCachedWalletData } from "@apps-lib/cache/walletCache.js";
import { ensureAuthenticated } from "@/app/api/middleware/roleGuard";
import { normalizeCurrency, DEFAULT_CURRENCY, SUPPORTED_CURRENCIES, isValidCurrency } from "@/app/api/utils/currencies";

/**
 * GET /api/wallet/summary
 * Get wallet summary with caching
 * Query params: currency (optional, default: KES)
 */
export const GET = withErrorHandling(async (request) => {
  const guard = await ensureAuthenticated(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { searchParams } = new URL(request.url);
  const currencyParam = searchParams.get("currency") || DEFAULT_CURRENCY;
  const currency = normalizeCurrency(currencyParam);

  // Validate currency
  if (!isValidCurrency(currency)) {
    return errorResponse(ErrorCodes.INVALID_CURRENCY, {
      message: `Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
    });
  }

  const userId = session.user.id;

  // Try to get from cache first
  let walletData = await getCachedWalletData(userId, currency);

  // If not in cache, get or create wallet and cache it
  if (!walletData) {
    const wallet = await getOrCreateWallet(userId, currency);
    
    // Get pending transactions
    const { getCachedPending } = await import("@apps-lib/cache/walletCache.js");
    const pendingData = await getCachedPending(wallet.id);
    
    walletData = {
      wallet_id: wallet.id,
      user_id: wallet.user_id,
      currency: wallet.currency,
      balance: Number(wallet.balance || 0),
      pending: pendingData?.pending || 0,
    };
  }

  // Calculate monthly change (simplified - would need date range in real implementation)
  // For now, return basic summary
  return successResponse({
    balance: walletData.balance,
    pending: walletData.pending || 0,
    currency: walletData.currency,
  });
});
