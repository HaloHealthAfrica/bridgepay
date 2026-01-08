import { useState, useCallback, useEffect } from 'react';
import { transactionAPI } from '../services/api';

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
  page?: number;
  limit?: number;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: TransactionFilters;
  isDefault: boolean;
  createdAt: string;
  lastUsed: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon?: string;
  isDefault: boolean;
}

export interface FilteredTransactionResult {
  transactions: any[];
  totalCount: number;
  appliedFilters: TransactionFilters;
  executionTime: number;
}

export const useTransactionFilters = () => {
  const [filters, setFilters] = useState<TransactionFilters>({
    page: 1,
    limit: 20,
  });
  const [transactions, setTransactions] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [executionTime, setExecutionTime] = useState(0);

  // Convert filters to API query parameters
  const filtersToQueryParams = useCallback((filters: TransactionFilters) => {
    const params: any = {};

    // Handle date range
    if (filters.dateRange?.startDate) {
      params['dateRange[startDate]'] = filters.dateRange.startDate.toISOString();
    }
    if (filters.dateRange?.endDate) {
      params['dateRange[endDate]'] = filters.dateRange.endDate.toISOString();
    }

    // Handle amount range
    if (filters.amountRange?.min !== undefined) {
      params['amountRange[min]'] = filters.amountRange.min;
    }
    if (filters.amountRange?.max !== undefined) {
      params['amountRange[max]'] = filters.amountRange.max;
    }

    // Handle arrays
    if (filters.types?.length) {
      params.types = filters.types;
    }
    if (filters.statuses?.length) {
      params.statuses = filters.statuses;
    }
    if (filters.categories?.length) {
      params.categories = filters.categories;
    }

    // Handle pagination
    if (filters.page) {
      params.page = filters.page;
    }
    if (filters.limit) {
      params.limit = filters.limit;
    }

    return params;
  }, []);

  // Fetch transactions with filters
  const fetchTransactions = useCallback(async (filtersToApply: TransactionFilters = filters) => {
    setIsLoading(true);
    try {
      const params = filtersToQueryParams(filtersToApply);
      
      let response;
      
      // If there's a search query, use the search endpoint
      if (filtersToApply.searchQuery?.trim()) {
        response = await transactionAPI.searchTransactions({
          query: filtersToApply.searchQuery.trim(),
          page: params.page,
          limit: params.limit,
          highlight: true,
        });
      } else {
        response = await transactionAPI.getTransactions(params);
      }
      
      if (response.data.success) {
        setTransactions(response.data.data.transactions || []);
        setTotalCount(response.data.data.totalCount || response.data.data.totalMatches || 0);
        setExecutionTime(response.data.data.executionTime || response.data.data.searchTime || 0);
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      setTransactions([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [filters, filtersToQueryParams]);

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const response = await transactionAPI.getCategories();
      if (response.data.success) {
        setCategories(response.data.data.categories || []);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  }, []);

  // Fetch filter presets
  const fetchPresets = useCallback(async () => {
    try {
      const response = await transactionAPI.getFilterPresets();
      if (response.data.success) {
        setPresets(response.data.data.presets || []);
      }
    } catch (error) {
      console.error('Failed to fetch presets:', error);
    }
  }, []);

  // Update filters
  const updateFilters = useCallback((newFilters: Partial<TransactionFilters>) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters,
      // Reset to first page when filters change (except when explicitly setting page)
      page: newFilters.page !== undefined ? newFilters.page : 1,
    }));
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    const clearedFilters: TransactionFilters = {
      page: 1,
      limit: filters.limit || 20,
    };
    setFilters(clearedFilters);
    fetchTransactions(clearedFilters);
  }, [filters.limit, fetchTransactions]);

  // Apply current filters
  const applyFilters = useCallback(() => {
    fetchTransactions(filters);
  }, [filters, fetchTransactions]);

  // Save filter preset
  const savePreset = useCallback(async (name: string, filtersToSave: TransactionFilters) => {
    try {
      const response = await transactionAPI.saveFilterPreset({
        name,
        filters: filtersToSave,
      });
      
      if (response.data.success) {
        await fetchPresets(); // Refresh presets list
        return response.data.data;
      }
    } catch (error) {
      console.error('Failed to save preset:', error);
      throw error;
    }
  }, [fetchPresets]);

  // Load filter preset
  const loadPreset = useCallback((preset: FilterPreset) => {
    const newFilters = {
      ...preset.filters,
      page: 1, // Reset to first page
      limit: filters.limit, // Keep current limit
    };
    setFilters(newFilters);
    fetchTransactions(newFilters);
  }, [filters.limit, fetchTransactions]);

  // Delete filter preset
  const deletePreset = useCallback(async (presetId: string) => {
    try {
      await transactionAPI.deleteFilterPreset(presetId);
      await fetchPresets(); // Refresh presets list
    } catch (error) {
      console.error('Failed to delete preset:', error);
      throw error;
    }
  }, [fetchPresets]);

  // Change page
  const changePage = useCallback((page: number) => {
    const newFilters = { ...filters, page };
    setFilters(newFilters);
    fetchTransactions(newFilters);
  }, [filters, fetchTransactions]);

  // Change page size
  const changePageSize = useCallback((limit: number) => {
    const newFilters = { ...filters, limit, page: 1 };
    setFilters(newFilters);
    fetchTransactions(newFilters);
  }, [filters, fetchTransactions]);

  // Search transactions
  const searchTransactions = useCallback(async (query: string) => {
    const searchFilters = {
      ...filters,
      searchQuery: query,
      page: 1,
    };
    setFilters(searchFilters);
    await fetchTransactions(searchFilters);
  }, [filters, fetchTransactions]);

  // Get search suggestions
  const getSearchSuggestions = useCallback(async (query: string) => {
    try {
      const response = await transactionAPI.getSearchSuggestions({ query });
      
      if (response.data.success) {
        return response.data.data.suggestions || [];
      }
      return [];
    } catch (error) {
      console.error('Failed to get search suggestions:', error);
      return [];
    }
  }, []);

  // Initialize data on mount
  useEffect(() => {
    fetchTransactions();
    fetchCategories();
    fetchPresets();
  }, []); // Only run on mount

  return {
    // State
    filters,
    transactions,
    totalCount,
    isLoading,
    categories,
    presets,
    executionTime,
    
    // Actions
    updateFilters,
    clearFilters,
    applyFilters,
    fetchTransactions,
    savePreset,
    loadPreset,
    deletePreset,
    changePage,
    changePageSize,
    searchTransactions,
    getSearchSuggestions,
  };
};