import React, { useState } from 'react';
import { Search, Tag, Users, X } from 'lucide-react';
import { TransactionSearch } from './TransactionSearch';
import { CategoryManager, type Category } from './CategoryManager';
import { BulkCategorization } from './BulkCategorization';
import { CategoryAssignment } from './CategoryAssignment';

interface Transaction {
  id: string;
  type: string;
  status: string;
  amount: number;
  description: string;
  createdAt: string;
  category?: Category;
}

interface SearchAndCategorizationProps {
  transactions: Transaction[];
  categories: Category[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearch: (query: string) => void;
  onGetSearchSuggestions: (query: string) => Promise<string[]>;
  onCreateCategory: (category: { name: string; color: string; icon?: string }) => Promise<void>;
  onUpdateCategory: (id: string, updates: { name?: string; color?: string; icon?: string }) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onAssignCategory: (transactionId: string, categoryId: string) => Promise<void>;
  onBulkCategorize: (transactionIds: string[], categoryId: string) => Promise<void>;
  onGetCategorySuggestions?: (transactionId: string) => Promise<any[]>;
  recentSearches?: string[];
  isLoading?: boolean;
}

export const SearchAndCategorization: React.FC<SearchAndCategorizationProps> = ({
  transactions,
  categories,
  searchQuery,
  onSearchChange,
  onSearch,
  // onGetSearchSuggestions, // Available for future use
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onAssignCategory,
  onBulkCategorize,
  onGetCategorySuggestions,
  recentSearches = [],
  isLoading = false,
}) => {
  const [activeTab, setActiveTab] = useState<'search' | 'categories' | 'bulk'>('search');
  const [searchSuggestions] = useState<string[]>([]);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Handle search suggestions (available for future use)
  // const handleGetSearchSuggestions = useCallback(async (query: string) => {
  //   if (query.trim().length < 2) {
  //     setSearchSuggestions([]);
  //     return [];
  //   }

  //   try {
  //     const suggestions = await onGetSearchSuggestions(query);
  //     setSearchSuggestions(suggestions);
  //     return suggestions;
  //   } catch (error) {
  //     console.error('Failed to get search suggestions:', error);
  //     return [];
  //   }
  // }, [onGetSearchSuggestions]);

  // Handle bulk categorization
  const handleBulkCategorize = async (transactionIds: string[], categoryId: string) => {
    await onBulkCategorize(transactionIds, categoryId);
    setSelectedTransactionIds([]);
    setShowBulkModal(false);
  };

  // Format amount
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="bg-surface rounded-card border border-gray-200">
      {/* Header with Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex items-center justify-between p-4">
          <div className="flex space-x-1">
            <button
              type="button"
              onClick={() => setActiveTab('search')}
              className={`flex items-center gap-2 px-3 py-2 rounded-button text-sm font-medium transition-colors ${
                activeTab === 'search'
                  ? 'bg-primary text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Search size={16} />
              Search
            </button>
            
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`flex items-center gap-2 px-3 py-2 rounded-button text-sm font-medium transition-colors ${
                activeTab === 'categories'
                  ? 'bg-primary text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Tag size={16} />
              Categories
            </button>
            
            <button
              type="button"
              onClick={() => setActiveTab('bulk')}
              className={`flex items-center gap-2 px-3 py-2 rounded-button text-sm font-medium transition-colors ${
                activeTab === 'bulk'
                  ? 'bg-primary text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Users size={16} />
              Bulk Actions
            </button>
          </div>

          {selectedTransactionIds.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                {selectedTransactionIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => setShowBulkModal(true)}
                className="px-3 py-1 bg-primary text-white text-sm rounded-button hover:bg-primary-dark"
              >
                Categorize
              </button>
              <button
                type="button"
                onClick={() => setSelectedTransactionIds([])}
                className="p-1 text-gray-500 hover:text-gray-700"
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === 'search' && (
          <div className="space-y-4">
            {/* Search Input */}
            <TransactionSearch
              value={searchQuery}
              onChange={onSearchChange}
              onSearch={onSearch}
              suggestions={searchSuggestions}
              recentSearches={recentSearches}
              isLoading={isLoading}
              placeholder="Search by description, amount, recipient..."
            />

            {/* Search Results with Category Assignment */}
            {transactions.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">
                  Search Results ({transactions.length})
                </h4>
                
                <div className="space-y-2">
                  {transactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-button hover:shadow-sm transition-shadow"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-gray-900 truncate">
                            {transaction.description || transaction.type}
                          </div>
                          <div className="font-semibold text-gray-900 ml-4">
                            {formatAmount(transaction.amount)}
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between mt-1">
                          <div className="text-sm text-gray-500">
                            {formatDate(transaction.createdAt)} • {transaction.type}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <CategoryAssignment
                              transactionId={transaction.id}
                              currentCategory={transaction.category}
                              categories={categories}
                              onAssignCategory={onAssignCategory}
                              onGetSuggestions={onGetCategorySuggestions}
                              isLoading={isLoading}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {searchQuery && transactions.length === 0 && !isLoading && (
              <div className="text-center py-8 text-gray-500">
                <Search size={48} className="mx-auto mb-4 text-gray-300" />
                <p>No transactions found for "{searchQuery}"</p>
                <p className="text-sm">Try adjusting your search terms</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'categories' && (
          <CategoryManager
            categories={categories}
            onCreateCategory={onCreateCategory}
            onUpdateCategory={onUpdateCategory}
            onDeleteCategory={onDeleteCategory}
            isLoading={isLoading}
          />
        )}

        {activeTab === 'bulk' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-900">Bulk Categorization</h4>
                <p className="text-sm text-gray-600">
                  Select multiple transactions to categorize them at once
                </p>
              </div>
              
              {selectedTransactionIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowBulkModal(true)}
                  className="px-4 py-2 bg-primary text-white rounded-button hover:bg-primary-dark"
                >
                  Categorize {selectedTransactionIds.length} Transaction
                  {selectedTransactionIds.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>

            {/* Transaction Selection */}
            <div className="space-y-2">
              {transactions.filter(tx => tx.status === 'SUCCESS').map((transaction) => {
                const isSelected = selectedTransactionIds.includes(transaction.id);
                
                return (
                  <div
                    key={transaction.id}
                    className={`flex items-center p-3 rounded-button border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-primary bg-primary-light'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedTransactionIds(prev => prev.filter(id => id !== transaction.id));
                      } else {
                        setSelectedTransactionIds(prev => [...prev, transaction.id]);
                      }
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // Handled by parent div onClick
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-gray-900 truncate">
                            {transaction.description || transaction.type}
                          </div>
                          <div className="font-semibold text-gray-900">
                            {formatAmount(transaction.amount)}
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between mt-1">
                          <div className="text-sm text-gray-500">
                            {formatDate(transaction.createdAt)}
                          </div>
                          
                          {transaction.category && (
                            <div className="flex items-center gap-1">
                              <div
                                className="w-4 h-4 rounded-full"
                                style={{ backgroundColor: transaction.category.color }}
                              />
                              <span className="text-xs text-gray-500">
                                {transaction.category.name}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {transactions.filter(tx => tx.status === 'SUCCESS').length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Users size={48} className="mx-auto mb-4 text-gray-300" />
                <p>No transactions available for bulk categorization</p>
                <p className="text-sm">Only successful transactions can be categorized</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bulk Categorization Modal */}
      {showBulkModal && (
        <BulkCategorization
          transactions={transactions}
          categories={categories}
          selectedTransactionIds={selectedTransactionIds}
          onSelectionChange={setSelectedTransactionIds}
          onBulkCategorize={handleBulkCategorize}
          onClose={() => setShowBulkModal(false)}
          isLoading={isLoading}
        />
      )}
    </div>
  );
};