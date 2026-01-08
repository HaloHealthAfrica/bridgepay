import React, { useState } from 'react';
import { Filter, X, Save, ChevronDown, Search } from 'lucide-react';

export interface TransactionFilters {
  dateRange?: {
    startDate?: Date;
    endDate?: Date;
  };
  types?: string[];
  statuses?: string[];
  amountRange?: {
    min?: number;
    max?: number;
  };
  categories?: string[];
  searchQuery?: string;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: TransactionFilters;
  isDefault: boolean;
  createdAt: string;
  lastUsed: string;
}

interface TransactionFiltersProps {
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  onApplyFilters: () => void;
  onClearFilters: () => void;
  isLoading?: boolean;
  categories?: Array<{ id: string; name: string; color: string }>;
  presets?: FilterPreset[];
  onSavePreset?: (name: string, filters: TransactionFilters) => void;
  onLoadPreset?: (preset: FilterPreset) => void;
  onDeletePreset?: (presetId: string) => void;
}

const TRANSACTION_TYPES = [
  { value: 'DEPOSIT', label: 'Deposit' },
  { value: 'WITHDRAWAL', label: 'Withdrawal' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'PAYMENT', label: 'Payment' },
];

const TRANSACTION_STATUSES = [
  { value: 'SUCCESS', label: 'Success' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'FAILED', label: 'Failed' },
];

export const TransactionFilters: React.FC<TransactionFiltersProps> = ({
  filters,
  onFiltersChange,
  onApplyFilters,
  onClearFilters,
  isLoading = false,
  categories = [],
  presets = [],
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);

  // Format date for input
  const formatDateForInput = (date?: Date) => {
    if (!date) return '';
    return date.toISOString().split('T')[0];
  };

  // Parse date from input
  const parseDateFromInput = (dateString: string) => {
    return dateString ? new Date(dateString) : undefined;
  };

  // Update individual filter values
  const updateFilter = (key: keyof TransactionFilters, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  // Toggle array values (for types, statuses, categories)
  const toggleArrayValue = (key: 'types' | 'statuses' | 'categories', value: string) => {
    const currentArray = filters[key] || [];
    const newArray = currentArray.includes(value)
      ? currentArray.filter(item => item !== value)
      : [...currentArray, value];
    
    updateFilter(key, newArray.length > 0 ? newArray : undefined);
  };

  // Check if filters are active
  const hasActiveFilters = () => {
    return !!(
      filters.dateRange?.startDate ||
      filters.dateRange?.endDate ||
      filters.types?.length ||
      filters.statuses?.length ||
      filters.amountRange?.min ||
      filters.amountRange?.max ||
      filters.categories?.length ||
      filters.searchQuery
    );
  };

  // Save preset
  const handleSavePreset = () => {
    if (presetName.trim() && onSavePreset) {
      onSavePreset(presetName.trim(), filters);
      setPresetName('');
      setShowPresetModal(false);
    }
  };

  return (
    <div className="bg-surface rounded-card border border-gray-200 mb-6">
      {/* Filter Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Filter size={20} className="text-gray-600" />
            <h3 className="font-semibold text-gray-900">Filters</h3>
            {hasActiveFilters() && (
              <span className="bg-primary text-white text-xs px-2 py-1 rounded-full">
                Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Preset Dropdown */}
            {presets.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowPresetDropdown(!showPresetDropdown)}
                  className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-button hover:bg-gray-50"
                >
                  Presets
                  <ChevronDown size={14} />
                </button>
                {showPresetDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-button shadow-lg z-10">
                    {presets.map((preset) => (
                      <div key={preset.id} className="flex items-center justify-between p-2 hover:bg-gray-50">
                        <button
                          type="button"
                          onClick={() => {
                            onLoadPreset?.(preset);
                            setShowPresetDropdown(false);
                          }}
                          className="flex-1 text-left text-sm"
                        >
                          {preset.name}
                        </button>
                        {onDeletePreset && (
                          <button
                            type="button"
                            onClick={() => onDeletePreset(preset.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-button hover:bg-gray-50"
            >
              {isExpanded ? 'Collapse' : 'Expand'}
              <ChevronDown size={14} className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quick Search */}
        <div className="mt-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search transactions..."
              value={filters.searchQuery || ''}
              onChange={(e) => updateFilter('searchQuery', e.target.value || undefined)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-button focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">From</label>
                <input
                  type="date"
                  value={formatDateForInput(filters.dateRange?.startDate)}
                  onChange={(e) => updateFilter('dateRange', {
                    ...filters.dateRange,
                    startDate: parseDateFromInput(e.target.value)
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-button focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">To</label>
                <input
                  type="date"
                  value={formatDateForInput(filters.dateRange?.endDate)}
                  onChange={(e) => updateFilter('dateRange', {
                    ...filters.dateRange,
                    endDate: parseDateFromInput(e.target.value)
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-button focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Transaction Types */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Transaction Types</label>
            <div className="flex flex-wrap gap-2">
              {TRANSACTION_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => toggleArrayValue('types', type.value)}
                  className={`px-3 py-1 text-sm rounded-button border transition-colors ${
                    filters.types?.includes(type.value)
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Transaction Statuses */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <div className="flex flex-wrap gap-2">
              {TRANSACTION_STATUSES.map((status) => (
                <button
                  key={status.value}
                  type="button"
                  onClick={() => toggleArrayValue('statuses', status.value)}
                  className={`px-3 py-1 text-sm rounded-button border transition-colors ${
                    filters.statuses?.includes(status.value)
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {status.label}
                </button>
              ))}
            </div>
          </div>

          {/* Amount Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Amount Range (KES)</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Minimum</label>
                <input
                  type="number"
                  placeholder="0"
                  min="0"
                  step="0.01"
                  value={filters.amountRange?.min || ''}
                  onChange={(e) => updateFilter('amountRange', {
                    ...filters.amountRange,
                    min: e.target.value ? parseFloat(e.target.value) : undefined
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-button focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Maximum</label>
                <input
                  type="number"
                  placeholder="No limit"
                  min="0"
                  step="0.01"
                  value={filters.amountRange?.max || ''}
                  onChange={(e) => updateFilter('amountRange', {
                    ...filters.amountRange,
                    max: e.target.value ? parseFloat(e.target.value) : undefined
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-button focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Categories */}
          {categories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Categories</label>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => toggleArrayValue('categories', category.id)}
                    className={`px-3 py-1 text-sm rounded-button border transition-colors ${
                      filters.categories?.includes(category.id)
                        ? 'text-white border-primary'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                    style={{
                      backgroundColor: filters.categories?.includes(category.id) ? category.color : undefined,
                      borderColor: filters.categories?.includes(category.id) ? category.color : undefined,
                    }}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onApplyFilters}
                disabled={isLoading}
                className="px-4 py-2 bg-primary text-white rounded-button hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Applying...' : 'Apply Filters'}
              </button>
              {hasActiveFilters() && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-button hover:bg-gray-50"
                >
                  Clear All
                </button>
              )}
            </div>
            
            {onSavePreset && hasActiveFilters() && (
              <button
                type="button"
                onClick={() => setShowPresetModal(true)}
                className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-button hover:bg-gray-50"
              >
                <Save size={14} />
                Save Preset
              </button>
            )}
          </div>
        </div>
      )}

      {/* Save Preset Modal */}
      {showPresetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-card p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Save Filter Preset</h3>
            <input
              type="text"
              placeholder="Enter preset name..."
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-button focus:ring-2 focus:ring-primary focus:border-transparent mb-4"
              onKeyPress={(e) => e.key === 'Enter' && handleSavePreset()}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowPresetModal(false);
                  setPresetName('');
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-button hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePreset}
                disabled={!presetName.trim()}
                className="px-4 py-2 bg-primary text-white rounded-button hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};