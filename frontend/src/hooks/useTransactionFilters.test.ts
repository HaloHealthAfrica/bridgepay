import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTransactionFilters } from './useTransactionFilters';
import { transactionAPI } from '../services/api';
import { mockTransactions, mockCategories, mockPresets } from '../test/utils';

// Mock the API
vi.mock('../services/api');

describe('useTransactionFilters', () => {
  const mockTransactionAPI = transactionAPI as any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock responses
    mockTransactionAPI.getTransactions.mockResolvedValue({
      data: {
        success: true,
        data: {
          transactions: mockTransactions,
          totalCount: mockTransactions.length,
          executionTime: 50,
        },
      },
    });

    mockTransactionAPI.getCategories.mockResolvedValue({
      data: {
        success: true,
        data: {
          categories: mockCategories,
        },
      },
    });

    mockTransactionAPI.getFilterPresets.mockResolvedValue({
      data: {
        success: true,
        data: {
          presets: mockPresets,
        },
      },
    });

    mockTransactionAPI.searchTransactions.mockResolvedValue({
      data: {
        success: true,
        data: {
          transactions: mockTransactions.slice(0, 1),
          totalMatches: 1,
          searchTime: 25,
        },
      },
    });

    mockTransactionAPI.getSearchSuggestions.mockResolvedValue({
      data: {
        success: true,
        data: {
          suggestions: ['deposit', 'withdrawal', 'transfer'],
        },
      },
    });

    mockTransactionAPI.saveFilterPreset.mockResolvedValue({
      data: {
        success: true,
        data: { id: 'new-preset-id', name: 'New Preset' },
      },
    });

    mockTransactionAPI.deleteFilterPreset.mockResolvedValue({
      data: { success: true },
    });
  });

  describe('Initialization', () => {
    it('initializes with default filters and loads initial data', async () => {
      const { result } = renderHook(() => useTransactionFilters());

      expect(result.current.filters).toEqual({
        page: 1,
        limit: 20,
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.transactions).toEqual(mockTransactions);
      expect(result.current.totalCount).toBe(mockTransactions.length);
      expect(result.current.categories).toEqual(mockCategories);
      expect(result.current.presets).toEqual(mockPresets);
    });

    it('calls all initialization APIs on mount', async () => {
      renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(mockTransactionAPI.getTransactions).toHaveBeenCalledWith({
          page: 1,
          limit: 20,
        });
        expect(mockTransactionAPI.getCategories).toHaveBeenCalled();
        expect(mockTransactionAPI.getFilterPresets).toHaveBeenCalled();
      });
    });
  });

  describe('Filter Updates', () => {
    it('updates filters correctly', async () => {
      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.updateFilters({
          types: ['DEPOSIT'],
          statuses: ['SUCCESS'],
        });
      });

      expect(result.current.filters).toEqual({
        page: 1,
        limit: 20,
        types: ['DEPOSIT'],
        statuses: ['SUCCESS'],
      });
    });

    it('resets page to 1 when filters change', async () => {
      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // First set page to 3
      act(() => {
        result.current.changePage(3);
      });

      expect(result.current.filters.page).toBe(3);

      // Then update filters - should reset page to 1
      act(() => {
        result.current.updateFilters({
          types: ['DEPOSIT'],
        });
      });

      expect(result.current.filters.page).toBe(1);
    });

    it('preserves page when explicitly setting it', async () => {
      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.updateFilters({
          types: ['DEPOSIT'],
          page: 2,
        });
      });

      expect(result.current.filters.page).toBe(2);
    });
  });

  describe('Filter Application', () => {
    it('applies filters and fetches transactions', async () => {
      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.updateFilters({
          types: ['DEPOSIT'],
          dateRange: {
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-01-31'),
          },
        });
      });

      act(() => {
        result.current.applyFilters();
      });

      await waitFor(() => {
        expect(mockTransactionAPI.getTransactions).toHaveBeenCalledWith({
          page: 1,
          limit: 20,
          types: ['DEPOSIT'],
          'dateRange[startDate]': '2024-01-01T00:00:00.000Z',
          'dateRange[endDate]': '2024-01-31T00:00:00.000Z',
        });
      });
    });

    it('uses search endpoint when search query is present', async () => {
      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.updateFilters({
          searchQuery: 'deposit',
        });
      });

      act(() => {
        result.current.applyFilters();
      });

      await waitFor(() => {
        expect(mockTransactionAPI.searchTransactions).toHaveBeenCalledWith({
          query: 'deposit',
          page: 1,
          limit: 20,
          highlight: true,
        });
      });
    });

    it('clears all filters correctly', async () => {
      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Set some filters first
      act(() => {
        result.current.updateFilters({
          types: ['DEPOSIT'],
          searchQuery: 'test',
          statuses: ['SUCCESS'],
        });
      });

      // Clear filters
      act(() => {
        result.current.clearFilters();
      });

      expect(result.current.filters).toEqual({
        page: 1,
        limit: 20,
      });

      await waitFor(() => {
        expect(mockTransactionAPI.getTransactions).toHaveBeenCalledWith({
          page: 1,
          limit: 20,
        });
      });
    });
  });

  describe('Pagination', () => {
    it('changes page correctly', async () => {
      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.changePage(3);
      });

      expect(result.current.filters.page).toBe(3);

      await waitFor(() => {
        expect(mockTransactionAPI.getTransactions).toHaveBeenCalledWith({
          page: 3,
          limit: 20,
        });
      });
    });

    it('changes page size and resets to page 1', async () => {
      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Set page to 3 first
      act(() => {
        result.current.changePage(3);
      });

      // Change page size - should reset to page 1
      act(() => {
        result.current.changePageSize(50);
      });

      expect(result.current.filters).toEqual({
        page: 1,
        limit: 50,
      });

      await waitFor(() => {
        expect(mockTransactionAPI.getTransactions).toHaveBeenCalledWith({
          page: 1,
          limit: 50,
        });
      });
    });
  });

  describe('Search Functionality', () => {
    it('searches transactions with query', async () => {
      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.searchTransactions('deposit');
      });

      expect(result.current.filters.searchQuery).toBe('deposit');
      expect(result.current.filters.page).toBe(1);

      await waitFor(() => {
        expect(mockTransactionAPI.searchTransactions).toHaveBeenCalledWith({
          query: 'deposit',
          page: 1,
          limit: 20,
          highlight: true,
        });
      });
    });

    it('gets search suggestions', async () => {
      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let suggestions: string[] = [];
      await act(async () => {
        suggestions = await result.current.getSearchSuggestions('dep');
      });

      expect(suggestions).toEqual(['deposit', 'withdrawal', 'transfer']);
      expect(mockTransactionAPI.getSearchSuggestions).toHaveBeenCalledWith({
        query: 'dep',
      });
    });
  });

  describe('Filter Presets', () => {
    it('saves filter preset', async () => {
      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const filtersToSave = {
        types: ['DEPOSIT'],
        statuses: ['SUCCESS'],
      };

      await act(async () => {
        await result.current.savePreset('My Preset', filtersToSave);
      });

      expect(mockTransactionAPI.saveFilterPreset).toHaveBeenCalledWith({
        name: 'My Preset',
        filters: filtersToSave,
      });

      // Should refresh presets after saving
      expect(mockTransactionAPI.getFilterPresets).toHaveBeenCalledTimes(2);
    });

    it('loads filter preset', async () => {
      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const presetToLoad = mockPresets[0];

      act(() => {
        result.current.loadPreset(presetToLoad);
      });

      expect(result.current.filters).toEqual({
        ...presetToLoad.filters,
        page: 1,
        limit: 20,
      });

      await waitFor(() => {
        expect(mockTransactionAPI.getTransactions).toHaveBeenCalledWith({
          page: 1,
          limit: 20,
          'dateRange[startDate]': '2024-01-01T00:00:00.000Z',
          'dateRange[endDate]': '2024-01-31T00:00:00.000Z',
        });
      });
    });

    it('deletes filter preset', async () => {
      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.deletePreset('preset-1');
      });

      expect(mockTransactionAPI.deleteFilterPreset).toHaveBeenCalledWith('preset-1');

      // Should refresh presets after deleting
      expect(mockTransactionAPI.getFilterPresets).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('handles transaction fetch errors gracefully', async () => {
      mockTransactionAPI.getTransactions.mockRejectedValueOnce(
        new Error('Network error')
      );

      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.transactions).toEqual([]);
      expect(result.current.totalCount).toBe(0);
    });

    it('handles category fetch errors gracefully', async () => {
      mockTransactionAPI.getCategories.mockRejectedValueOnce(
        new Error('Network error')
      );

      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.categories).toEqual([]);
    });

    it('handles preset operations errors gracefully', async () => {
      mockTransactionAPI.saveFilterPreset.mockRejectedValueOnce(
        new Error('Save failed')
      );

      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        result.current.savePreset('Test Preset', { types: ['DEPOSIT'] })
      ).rejects.toThrow('Save failed');
    });

    it('handles search suggestions errors gracefully', async () => {
      mockTransactionAPI.getSearchSuggestions.mockRejectedValueOnce(
        new Error('Search failed')
      );

      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let suggestions: string[] = [];
      await act(async () => {
        suggestions = await result.current.getSearchSuggestions('test');
      });

      expect(suggestions).toEqual([]);
    });
  });

  describe('Query Parameter Conversion', () => {
    it('converts complex filters to correct query parameters', async () => {
      const { result } = renderHook(() => useTransactionFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const complexFilters = {
        dateRange: {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31'),
        },
        types: ['DEPOSIT', 'WITHDRAWAL'],
        statuses: ['SUCCESS'],
        amountRange: {
          min: 100,
          max: 1000,
        },
        categories: ['cat-1', 'cat-2'],
        page: 2,
        limit: 50,
      };

      act(() => {
        result.current.updateFilters(complexFilters);
      });

      act(() => {
        result.current.applyFilters();
      });

      await waitFor(() => {
        expect(mockTransactionAPI.getTransactions).toHaveBeenCalledWith({
          'dateRange[startDate]': '2024-01-01T00:00:00.000Z',
          'dateRange[endDate]': '2024-01-31T00:00:00.000Z',
          types: ['DEPOSIT', 'WITHDRAWAL'],
          statuses: ['SUCCESS'],
          'amountRange[min]': 100,
          'amountRange[max]': 1000,
          categories: ['cat-1', 'cat-2'],
          page: 2,
          limit: 50,
        });
      });
    });
  });
});