import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";
import { TransactionRow, type UITransaction } from "../../components/wallet/TransactionRow";
import { TransactionDetailModal } from "../../components/wallet/TransactionDetailModal";
import { TransactionFilters } from "../../components/wallet/TransactionFilters";
import { TransactionPagination } from "../../components/wallet/TransactionPagination";
import { SearchAndCategorization } from "../../components/wallet/SearchAndCategorization";
import { useTransactionFilters } from "../../hooks/useTransactionFilters";
import { transactionAPI } from "../../services/api";

type BackendTransaction = any;

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.floor(hrs / 24);
  return `${days} days ago`;
}

function mapTx(meId: string, tx: BackendTransaction): UITransaction & { backendId: string } {
  const isReceive = tx.toUserId === meId;
  const direction: UITransaction["direction"] = isReceive ? "receive" : "send";
  let title = tx.description || tx.type;
  if (tx.type === "TRANSFER" || tx.type === "PAYMENT" || tx.type === "ESCROW_RELEASE") {
    if (direction === "receive") title = `Payment from ${tx.fromUser?.name || "Someone"}`;
    else title = `Send to ${tx.toUser?.name || "Someone"}`;
  } else if (tx.type === "DEPOSIT") {
    const method = tx?.metadata?.method || tx?.metadata?.provider;
    if (method === "paybill") title = "Paybill Deposit";
    else if (method === "card" || method === "lemonade") title = "Diaspora Deposit (Card)";
    else title = tx.description || "Deposit";
  } else if (tx.type === "WITHDRAWAL") {
    const method = tx?.metadata?.method || tx?.metadata?.provider;
    if (method === "bank") title = "Bank Transfer (A2P)";
    else if (method === "mpesa_b2c" || method === "mpesa") title = "M-Pesa Send / Withdrawal";
    else title = tx.description || "Withdrawal";
  }
  return {
    backendId: tx.id,
    id: String(tx.id),
    direction,
    title,
    amount: Number(tx.amount),
    dateLabel: tx.createdAt ? timeAgo(tx.createdAt) : "",
    status: tx.status,
  };
}

export function History() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const meId = user?.id || "";

  const [selected, setSelected] = useState<(UITransaction & { backendId: string }) | null>(null);
  const [showSearchAndCategories, setShowSearchAndCategories] = useState(false);

  const {
    filters,
    transactions,
    totalCount,
    isLoading,
    categories,
    presets,
    executionTime,
    updateFilters,
    clearFilters,
    applyFilters,
    savePreset,
    loadPreset,
    deletePreset,
    changePage,
    changePageSize,
    searchTransactions,
    getSearchSuggestions,
  } = useTransactionFilters();

  // Map backend transactions to UI format
  const uiTxs = meId ? transactions.map((t) => mapTx(meId, t)) : [];

  // Handle receipt generation
  const handleReceipt = async (transactionId: string) => {
    try {
      const res = await transactionAPI.generateReceipt(transactionId);
      const url = res.data.data.downloadUrl;
      if (url) {
        window.open(url, "_blank");
      } else {
        alert("Receipt not available (S3 not configured).");
      }
    } catch (e: any) {
      alert(e?.response?.data?.error?.message || "Failed to generate receipt");
    }
  };

  // Handle category operations
  const handleCreateCategory = async (category: { name: string; color: string; icon?: string }) => {
    try {
      await transactionAPI.createCategory(category);
      // Refresh categories - this would be handled by the hook
    } catch (error) {
      console.error('Failed to create category:', error);
      throw error;
    }
  };

  const handleUpdateCategory = async (id: string, updates: { name?: string; color?: string; icon?: string }) => {
    try {
      await transactionAPI.updateCategory(id, updates);
      // Refresh categories - this would be handled by the hook
    } catch (error) {
      console.error('Failed to update category:', error);
      throw error;
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await transactionAPI.deleteCategory(id);
      // Refresh categories - this would be handled by the hook
    } catch (error) {
      console.error('Failed to delete category:', error);
      throw error;
    }
  };

  const handleAssignCategory = async (transactionId: string, categoryId: string) => {
    try {
      await transactionAPI.assignCategory({
        transactionIds: [transactionId],
        categoryId,
      });
      // Refresh transactions - this would be handled by the hook
    } catch (error) {
      console.error('Failed to assign category:', error);
      throw error;
    }
  };

  const handleBulkCategorize = async (transactionIds: string[], categoryId: string) => {
    try {
      await transactionAPI.bulkAssignCategory({
        transactionIds,
        categoryId,
      });
      // Refresh transactions - this would be handled by the hook
    } catch (error) {
      console.error('Failed to bulk categorize:', error);
      throw error;
    }
  };

  const handleGetCategorySuggestions = async (transactionId: string) => {
    try {
      const response = await transactionAPI.getCategorySuggestions(transactionId);
      return response.data.data.suggestions || [];
    } catch (error) {
      console.error('Failed to get category suggestions:', error);
      return [];
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <button type="button" onClick={() => navigate("/wallet")} className="text-primary font-semibold mb-4 hover:underline">
          ← Back to Wallet
        </button>
        <h1 className="text-3xl font-bold mb-2">Transaction History</h1>
        <p className="text-text-secondary">All your money movements with advanced filtering and search</p>
      </div>

      {/* Toggle between views */}
      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setShowSearchAndCategories(false)}
          className={`px-4 py-2 rounded-button transition-colors ${
            !showSearchAndCategories
              ? 'bg-primary text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Filter View
        </button>
        <button
          type="button"
          onClick={() => setShowSearchAndCategories(true)}
          className={`px-4 py-2 rounded-button transition-colors ${
            showSearchAndCategories
              ? 'bg-primary text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Search & Categories
        </button>
      </div>

      {showSearchAndCategories ? (
        /* Search and Categorization Interface */
        <SearchAndCategorization
          transactions={transactions}
          categories={categories}
          searchQuery={filters.searchQuery || ''}
          onSearchChange={(query) => updateFilters({ searchQuery: query })}
          onSearch={searchTransactions}
          onGetSearchSuggestions={getSearchSuggestions}
          onCreateCategory={handleCreateCategory}
          onUpdateCategory={handleUpdateCategory}
          onDeleteCategory={handleDeleteCategory}
          onAssignCategory={handleAssignCategory}
          onBulkCategorize={handleBulkCategorize}
          onGetCategorySuggestions={handleGetCategorySuggestions}
          recentSearches={[]} // This could be stored in localStorage
          isLoading={isLoading}
        />
      ) : (
        /* Original Filter Interface */
        <>
          {/* Advanced Filters */}
          <TransactionFilters
            filters={filters}
            onFiltersChange={updateFilters}
            onApplyFilters={applyFilters}
            onClearFilters={clearFilters}
            isLoading={isLoading}
            categories={categories}
            presets={presets}
            onSavePreset={savePreset}
            onLoadPreset={loadPreset}
            onDeletePreset={deletePreset}
          />

          {/* Results Summary */}
          {!isLoading && (
            <div className="mb-4 flex items-center justify-between text-sm text-gray-600">
              <div>
                {totalCount > 0 ? (
                  <>
                    Found {totalCount.toLocaleString()} transaction{totalCount !== 1 ? 's' : ''}
                    {executionTime > 0 && ` in ${executionTime}ms`}
                  </>
                ) : (
                  'No transactions found'
                )}
              </div>
              {filters.searchQuery && (
                <div>
                  Search results for: <span className="font-medium">"{filters.searchQuery}"</span>
                </div>
              )}
            </div>
          )}

          {/* Transaction List */}
          <div className="bg-surface rounded-card border border-gray-200 overflow-hidden">
            <div className="p-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <span className="ml-3 text-gray-600">Loading transactions...</span>
                </div>
              ) : uiTxs.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-gray-500 mb-2">No transactions found</div>
                  <div className="text-sm text-gray-400">
                    {filters.searchQuery || Object.keys(filters).some(key => key !== 'page' && key !== 'limit' && filters[key as keyof typeof filters])
                      ? 'Try adjusting your filters or search terms'
                      : 'You haven\'t made any transactions yet'
                    }
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {uiTxs.map((t) => (
                    <TransactionRow 
                      key={t.id} 
                      transaction={t} 
                      onClick={() => setSelected(t)} 
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalCount > 0 && (
              <TransactionPagination
                currentPage={filters.page || 1}
                totalCount={totalCount}
                pageSize={filters.limit || 20}
                onPageChange={changePage}
                onPageSizeChange={changePageSize}
                isLoading={isLoading}
              />
            )}
          </div>
        </>
      )}

      {/* Transaction Detail Modal */}
      {selected && (
        <TransactionDetailModal
          transaction={selected}
          onClose={() => setSelected(null)}
          onReceipt={() => handleReceipt(selected.backendId)}
        />
      )}
    </div>
  );
}




