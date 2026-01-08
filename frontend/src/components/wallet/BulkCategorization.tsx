import React, { useState } from 'react';
import { Tag, Check, X, AlertCircle, CheckSquare, Square } from 'lucide-react';
import type { Category } from './CategoryManager';

interface Transaction {
  id: string;
  type: string;
  status: string;
  amount: number;
  description: string;
  createdAt: string;
  category?: Category;
}

interface BulkCategorizationProps {
  transactions: Transaction[];
  categories: Category[];
  selectedTransactionIds: string[];
  onSelectionChange: (transactionIds: string[]) => void;
  onBulkCategorize: (transactionIds: string[], categoryId: string) => Promise<void>;
  onClose: () => void;
  isLoading?: boolean;
}

export const BulkCategorization: React.FC<BulkCategorizationProps> = ({
  transactions,
  categories,
  selectedTransactionIds,
  onSelectionChange,
  onBulkCategorize,
  onClose,
  isLoading = false,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Filter transactions to show only those that can be categorized
  const categorizableTransactions = transactions.filter(tx => 
    tx.status === 'SUCCESS' // Only allow categorizing successful transactions
  );

  // Handle select all/none
  const handleSelectAll = () => {
    if (selectedTransactionIds.length === categorizableTransactions.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(categorizableTransactions.map(tx => tx.id));
    }
  };

  // Handle individual transaction selection
  const handleTransactionSelect = (transactionId: string) => {
    if (selectedTransactionIds.includes(transactionId)) {
      onSelectionChange(selectedTransactionIds.filter(id => id !== transactionId));
    } else {
      onSelectionChange([...selectedTransactionIds, transactionId]);
    }
  };

  // Handle bulk categorization
  const handleBulkCategorize = async () => {
    if (!selectedCategoryId || selectedTransactionIds.length === 0) return;

    setIsProcessing(true);
    try {
      await onBulkCategorize(selectedTransactionIds, selectedCategoryId);
      onClose();
    } catch (error) {
      console.error('Bulk categorization failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Get category by ID
  const getCategoryById = (id: string) => categories.find(cat => cat.id === id);

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

  const selectedCategory = selectedCategoryId ? getCategoryById(selectedCategoryId) : null;
  const allSelected = selectedTransactionIds.length === categorizableTransactions.length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-card w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Bulk Categorization</h2>
              <p className="text-sm text-gray-600 mt-1">
                Select transactions and assign them to a category
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 rounded-button hover:bg-gray-100"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Category Selection */}
          <div className="p-6 border-b border-gray-200">
            <h3 className="font-medium text-gray-900 mb-3">Select Category</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(category.id)}
                  className={`flex items-center gap-2 p-3 rounded-button border-2 transition-all ${
                    selectedCategoryId === category.id
                      ? 'border-primary bg-primary-light'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-sm"
                    style={{ backgroundColor: category.color }}
                  >
                    {category.icon}
                  </div>
                  <span className="text-sm font-medium truncate">{category.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Transaction Selection */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-6 pb-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">
                  Select Transactions ({selectedTransactionIds.length} selected)
                </h3>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="flex items-center gap-2 text-sm text-primary hover:text-primary-dark"
                >
                  {allSelected ? (
                    <>
                      <CheckSquare size={16} />
                      Deselect All
                    </>
                  ) : (
                    <>
                      <Square size={16} />
                      Select All
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6">
              {categorizableTransactions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Tag size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>No transactions available for categorization</p>
                  <p className="text-sm">Only successful transactions can be categorized</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {categorizableTransactions.map((transaction) => {
                    const isSelected = selectedTransactionIds.includes(transaction.id);
                    
                    return (
                      <div
                        key={transaction.id}
                        className={`flex items-center p-3 rounded-button border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-primary bg-primary-light'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => handleTransactionSelect(transaction.id)}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="flex-shrink-0">
                            {isSelected ? (
                              <CheckSquare size={20} className="text-primary" />
                            ) : (
                              <Square size={20} className="text-gray-400" />
                            )}
                          </div>
                          
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
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200">
          {/* Summary */}
          {selectedTransactionIds.length > 0 && selectedCategory && (
            <div className="mb-4 p-3 bg-blue-50 rounded-button border border-blue-200">
              <div className="flex items-center gap-2 text-sm text-blue-800">
                <AlertCircle size={16} />
                <span>
                  You are about to categorize <strong>{selectedTransactionIds.length}</strong> transaction
                  {selectedTransactionIds.length !== 1 ? 's' : ''} as{' '}
                  <strong className="inline-flex items-center gap-1">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: selectedCategory.color }}
                    />
                    {selectedCategory.name}
                  </strong>
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-button hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            
            <button
              type="button"
              onClick={handleBulkCategorize}
              disabled={
                !selectedCategoryId || 
                selectedTransactionIds.length === 0 || 
                isProcessing || 
                isLoading
              }
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-button hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Categorize {selectedTransactionIds.length} Transaction
                  {selectedTransactionIds.length !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};