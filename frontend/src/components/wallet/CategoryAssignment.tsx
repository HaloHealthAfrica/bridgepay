import React, { useState, useEffect } from 'react';
import { Tag, ChevronDown, Check, Sparkles, X } from 'lucide-react';
import type { Category } from './CategoryManager';

interface CategorySuggestion {
  category: Category;
  confidence: number;
  reason: string;
}

interface CategoryAssignmentProps {
  transactionId: string;
  currentCategory?: Category;
  categories: Category[];
  suggestions?: CategorySuggestion[];
  onAssignCategory: (transactionId: string, categoryId: string) => Promise<void>;
  onGetSuggestions?: (transactionId: string) => Promise<CategorySuggestion[]>;
  isLoading?: boolean;
  className?: string;
}

export const CategoryAssignment: React.FC<CategoryAssignmentProps> = ({
  transactionId,
  currentCategory,
  categories,
  suggestions = [],
  onAssignCategory,
  onGetSuggestions,
  isLoading = false,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [localSuggestions, setLocalSuggestions] = useState<CategorySuggestion[]>(suggestions);

  // Load suggestions when dropdown opens
  useEffect(() => {
    if (isOpen && onGetSuggestions && localSuggestions.length === 0) {
      setLoadingSuggestions(true);
      onGetSuggestions(transactionId)
        .then(setLocalSuggestions)
        .catch(console.error)
        .finally(() => setLoadingSuggestions(false));
    }
  }, [isOpen, onGetSuggestions, transactionId, localSuggestions.length]);

  // Handle category assignment
  const handleAssignCategory = async (categoryId: string) => {
    setIsAssigning(true);
    try {
      await onAssignCategory(transactionId, categoryId);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to assign category:', error);
    } finally {
      setIsAssigning(false);
    }
  };

  // Handle remove category
  const handleRemoveCategory = async () => {
    if (currentCategory) {
      await handleAssignCategory(''); // Empty string to remove category
    }
  };

  // Get confidence color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-gray-600';
  };

  // Get confidence label
  // Helper function to get confidence label (currently unused but available for future use)
  // const getConfidenceLabel = (confidence: number) => {
  //   if (confidence >= 0.8) return 'High confidence';
  //   if (confidence >= 0.6) return 'Medium confidence';
  //   return 'Low confidence';
  // };

  return (
    <div className={`relative ${className}`}>
      {/* Category Display/Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading || isAssigning}
        className={`flex items-center gap-2 px-3 py-2 rounded-button border transition-all ${
          currentCategory
            ? 'border-gray-300 hover:border-gray-400'
            : 'border-dashed border-gray-300 hover:border-gray-400 text-gray-500'
        } ${isLoading || isAssigning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {currentCategory ? (
          <>
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center text-xs"
              style={{ backgroundColor: currentCategory.color }}
            >
              {currentCategory.icon}
            </div>
            <span className="text-sm font-medium">{currentCategory.name}</span>
          </>
        ) : (
          <>
            <Tag size={16} />
            <span className="text-sm">Add category</span>
          </>
        )}
        
        <ChevronDown 
          size={14} 
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-64 mt-1 bg-white border border-gray-200 rounded-button shadow-lg">
          {/* Current Category Actions */}
          {currentCategory && (
            <div className="p-2 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center text-xs"
                    style={{ backgroundColor: currentCategory.color }}
                  >
                    {currentCategory.icon}
                  </div>
                  <span className="text-sm font-medium">{currentCategory.name}</span>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveCategory}
                  disabled={isAssigning}
                  className="p-1 text-red-500 hover:text-red-700 disabled:opacity-50"
                  title="Remove category"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Suggestions Section */}
          {(localSuggestions.length > 0 || loadingSuggestions) && (
            <div className="p-2 border-b border-gray-100">
              <div className="flex items-center gap-1 mb-2">
                <Sparkles size={14} className="text-primary" />
                <span className="text-xs font-medium text-gray-700">Suggestions</span>
              </div>
              
              {loadingSuggestions ? (
                <div className="flex items-center gap-2 py-2">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-gray-500">Loading suggestions...</span>
                </div>
              ) : (
                <div className="space-y-1">
                  {localSuggestions.slice(0, 3).map((suggestion) => (
                    <button
                      key={suggestion.category.id}
                      type="button"
                      onClick={() => handleAssignCategory(suggestion.category.id)}
                      disabled={isAssigning || currentCategory?.id === suggestion.category.id}
                      className="w-full flex items-center justify-between p-2 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full flex items-center justify-center text-xs"
                          style={{ backgroundColor: suggestion.category.color }}
                        >
                          {suggestion.category.icon}
                        </div>
                        <span className="text-sm">{suggestion.category.name}</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <span className={`text-xs ${getConfidenceColor(suggestion.confidence)}`}>
                          {Math.round(suggestion.confidence * 100)}%
                        </span>
                        {currentCategory?.id === suggestion.category.id && (
                          <Check size={14} className="text-primary" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* All Categories */}
          <div className="max-h-48 overflow-y-auto">
            <div className="p-2">
              <span className="text-xs font-medium text-gray-700 mb-2 block">All Categories</span>
              <div className="space-y-1">
                {categories.map((category) => {
                  const isSelected = currentCategory?.id === category.id;
                  const isSuggested = localSuggestions.some(s => s.category.id === category.id);
                  
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => handleAssignCategory(category.id)}
                      disabled={isAssigning || isSelected}
                      className={`w-full flex items-center justify-between p-2 rounded transition-colors ${
                        isSelected
                          ? 'bg-primary-light text-primary'
                          : 'hover:bg-gray-50'
                      } ${isAssigning ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full flex items-center justify-center text-xs"
                          style={{ backgroundColor: category.color }}
                        >
                          {category.icon}
                        </div>
                        <span className="text-sm">{category.name}</span>
                        {isSuggested && (
                          <Sparkles size={12} className="text-primary" />
                        )}
                      </div>
                      
                      {isSelected && (
                        <Check size={14} className="text-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Close Button */}
          <div className="p-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full px-3 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isAssigning && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center rounded-button">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};