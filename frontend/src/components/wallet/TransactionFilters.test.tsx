import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render, mockCategories, mockPresets } from '../../test/utils';
import { TransactionFilters, type TransactionFilters as FilterType } from './TransactionFilters';

describe('TransactionFilters', () => {
  const mockProps = {
    filters: {},
    onFiltersChange: vi.fn(),
    onApplyFilters: vi.fn(),
    onClearFilters: vi.fn(),
    isLoading: false,
    categories: mockCategories,
    presets: mockPresets,
    onSavePreset: vi.fn(),
    onLoadPreset: vi.fn(),
    onDeletePreset: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders filter header with expand/collapse functionality', () => {
      render(<TransactionFilters {...mockProps} />);
      
      expect(screen.getByText('Filters')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search transactions...')).toBeInTheDocument();
      expect(screen.getByText('Expand')).toBeInTheDocument();
    });

    it('shows active indicator when filters are applied', () => {
      const filtersWithData: FilterType = {
        types: ['DEPOSIT'],
        searchQuery: 'test',
      };
      
      render(<TransactionFilters {...mockProps} filters={filtersWithData} />);
      
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('expands and collapses filter panel', async () => {
      const user = userEvent.setup();
      render(<TransactionFilters {...mockProps} />);
      
      const expandButton = screen.getByText('Expand');
      await user.click(expandButton);
      
      expect(screen.getByText('Collapse')).toBeInTheDocument();
      expect(screen.getByText('Date Range')).toBeInTheDocument();
      expect(screen.getByText('Transaction Types')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('updates search query on input change', async () => {
      const user = userEvent.setup();
      render(<TransactionFilters {...mockProps} />);
      
      const searchInput = screen.getByPlaceholderText('Search transactions...');
      await user.type(searchInput, 'test query');
      
      expect(mockProps.onFiltersChange).toHaveBeenCalledWith({
        searchQuery: 'test query',
      });
    });

    it('clears search query when input is emptied', async () => {
      const user = userEvent.setup();
      const filtersWithSearch: FilterType = { searchQuery: 'existing query' };
      
      render(<TransactionFilters {...mockProps} filters={filtersWithSearch} />);
      
      const searchInput = screen.getByPlaceholderText('Search transactions...');
      await user.clear(searchInput);
      
      expect(mockProps.onFiltersChange).toHaveBeenCalledWith({
        searchQuery: undefined,
      });
    });
  });

  describe('Date Range Filtering', () => {
    it('renders date range inputs when expanded', async () => {
      const user = userEvent.setup();
      render(<TransactionFilters {...mockProps} />);
      
      await user.click(screen.getByText('Expand'));
      
      expect(screen.getByLabelText('From')).toBeInTheDocument();
      expect(screen.getByLabelText('To')).toBeInTheDocument();
    });

    it('updates date range filters', async () => {
      const user = userEvent.setup();
      render(<TransactionFilters {...mockProps} />);
      
      await user.click(screen.getByText('Expand'));
      
      const startDateInput = screen.getByLabelText('From');
      await user.type(startDateInput, '2024-01-01');
      
      expect(mockProps.onFiltersChange).toHaveBeenCalledWith({
        dateRange: {
          startDate: new Date('2024-01-01'),
        },
      });
    });
  });

  describe('Transaction Type Filtering', () => {
    it('renders transaction type buttons when expanded', async () => {
      const user = userEvent.setup();
      render(<TransactionFilters {...mockProps} />);
      
      await user.click(screen.getByText('Expand'));
      
      expect(screen.getByText('Deposit')).toBeInTheDocument();
      expect(screen.getByText('Withdrawal')).toBeInTheDocument();
      expect(screen.getByText('Transfer')).toBeInTheDocument();
      expect(screen.getByText('Payment')).toBeInTheDocument();
    });

    it('toggles transaction type selection', async () => {
      const user = userEvent.setup();
      render(<TransactionFilters {...mockProps} />);
      
      await user.click(screen.getByText('Expand'));
      await user.click(screen.getByText('Deposit'));
      
      expect(mockProps.onFiltersChange).toHaveBeenCalledWith({
        types: ['DEPOSIT'],
      });
    });

    it('shows selected transaction types with active styling', async () => {
      const user = userEvent.setup();
      const filtersWithTypes: FilterType = { types: ['DEPOSIT', 'WITHDRAWAL'] };
      
      render(<TransactionFilters {...mockProps} filters={filtersWithTypes} />);
      
      await user.click(screen.getByText('Expand'));
      
      const depositButton = screen.getByText('Deposit');
      const withdrawalButton = screen.getByText('Withdrawal');
      
      expect(depositButton).toHaveClass('bg-primary', 'text-white');
      expect(withdrawalButton).toHaveClass('bg-primary', 'text-white');
    });
  });

  describe('Status Filtering', () => {
    it('renders status buttons when expanded', async () => {
      const user = userEvent.setup();
      render(<TransactionFilters {...mockProps} />);
      
      await user.click(screen.getByText('Expand'));
      
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('toggles status selection', async () => {
      const user = userEvent.setup();
      render(<TransactionFilters {...mockProps} />);
      
      await user.click(screen.getByText('Expand'));
      await user.click(screen.getByText('Success'));
      
      expect(mockProps.onFiltersChange).toHaveBeenCalledWith({
        statuses: ['SUCCESS'],
      });
    });
  });

  describe('Amount Range Filtering', () => {
    it('renders amount range inputs when expanded', async () => {
      const user = userEvent.setup();
      render(<TransactionFilters {...mockProps} />);
      
      await user.click(screen.getByText('Expand'));
      
      expect(screen.getByLabelText('Minimum')).toBeInTheDocument();
      expect(screen.getByLabelText('Maximum')).toBeInTheDocument();
    });

    it('updates amount range filters', async () => {
      const user = userEvent.setup();
      render(<TransactionFilters {...mockProps} />);
      
      await user.click(screen.getByText('Expand'));
      
      const minInput = screen.getByLabelText('Minimum');
      await user.type(minInput, '100');
      
      expect(mockProps.onFiltersChange).toHaveBeenCalledWith({
        amountRange: {
          min: 100,
        },
      });
    });
  });

  describe('Category Filtering', () => {
    it('renders category buttons when categories are provided and expanded', async () => {
      const user = userEvent.setup();
      render(<TransactionFilters {...mockProps} />);
      
      await user.click(screen.getByText('Expand'));
      
      expect(screen.getByText('Food')).toBeInTheDocument();
      expect(screen.getByText('Transport')).toBeInTheDocument();
      expect(screen.getByText('Bills')).toBeInTheDocument();
    });

    it('toggles category selection', async () => {
      const user = userEvent.setup();
      render(<TransactionFilters {...mockProps} />);
      
      await user.click(screen.getByText('Expand'));
      await user.click(screen.getByText('Food'));
      
      expect(mockProps.onFiltersChange).toHaveBeenCalledWith({
        categories: ['cat-1'],
      });
    });

    it('applies category colors to selected categories', async () => {
      const user = userEvent.setup();
      const filtersWithCategories: FilterType = { categories: ['cat-1'] };
      
      render(<TransactionFilters {...mockProps} filters={filtersWithCategories} />);
      
      await user.click(screen.getByText('Expand'));
      
      const foodButton = screen.getByText('Food');
      expect(foodButton).toHaveStyle({ backgroundColor: '#FF6B6B' });
    });
  });

  describe('Filter Actions', () => {
    it('calls onApplyFilters when Apply Filters button is clicked', async () => {
      const user = userEvent.setup();
      render(<TransactionFilters {...mockProps} />);
      
      await user.click(screen.getByText('Expand'));
      await user.click(screen.getByText('Apply Filters'));
      
      expect(mockProps.onApplyFilters).toHaveBeenCalled();
    });

    it('shows loading state on Apply Filters button', async () => {
      const user = userEvent.setup();
      render(<TransactionFilters {...mockProps} isLoading={true} />);
      
      await user.click(screen.getByText('Expand'));
      
      expect(screen.getByText('Applying...')).toBeInTheDocument();
      expect(screen.getByText('Applying...')).toBeDisabled();
    });

    it('shows Clear All button when filters are active', async () => {
      const user = userEvent.setup();
      const filtersWithData: FilterType = { types: ['DEPOSIT'] };
      
      render(<TransactionFilters {...mockProps} filters={filtersWithData} />);
      
      await user.click(screen.getByText('Expand'));
      
      expect(screen.getByText('Clear All')).toBeInTheDocument();
    });

    it('calls onClearFilters when Clear All button is clicked', async () => {
      const user = userEvent.setup();
      const filtersWithData: FilterType = { types: ['DEPOSIT'] };
      
      render(<TransactionFilters {...mockProps} filters={filtersWithData} />);
      
      await user.click(screen.getByText('Expand'));
      await user.click(screen.getByText('Clear All'));
      
      expect(mockProps.onClearFilters).toHaveBeenCalled();
    });
  });

  describe('Filter Presets', () => {
    it('shows preset dropdown when presets are available', () => {
      render(<TransactionFilters {...mockProps} />);
      
      expect(screen.getByText('Presets')).toBeInTheDocument();
    });

    it('opens preset dropdown and shows preset options', async () => {
      const user = userEvent.setup();
      render(<TransactionFilters {...mockProps} />);
      
      await user.click(screen.getByText('Presets'));
      
      expect(screen.getByText('Last 30 Days')).toBeInTheDocument();
      expect(screen.getByText('Successful Deposits')).toBeInTheDocument();
    });

    it('calls onLoadPreset when preset is selected', async () => {
      const user = userEvent.setup();
      render(<TransactionFilters {...mockProps} />);
      
      await user.click(screen.getByText('Presets'));
      await user.click(screen.getByText('Last 30 Days'));
      
      expect(mockProps.onLoadPreset).toHaveBeenCalledWith(mockPresets[0]);
    });

    it('shows Save Preset button when filters are active', async () => {
      const user = userEvent.setup();
      const filtersWithData: FilterType = { types: ['DEPOSIT'] };
      
      render(<TransactionFilters {...mockProps} filters={filtersWithData} />);
      
      await user.click(screen.getByText('Expand'));
      
      expect(screen.getByText('Save Preset')).toBeInTheDocument();
    });

    it('opens save preset modal when Save Preset is clicked', async () => {
      const user = userEvent.setup();
      const filtersWithData: FilterType = { types: ['DEPOSIT'] };
      
      render(<TransactionFilters {...mockProps} filters={filtersWithData} />);
      
      await user.click(screen.getByText('Expand'));
      await user.click(screen.getByText('Save Preset'));
      
      expect(screen.getByText('Save Filter Preset')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter preset name...')).toBeInTheDocument();
    });

    it('saves preset with entered name', async () => {
      const user = userEvent.setup();
      const filtersWithData: FilterType = { types: ['DEPOSIT'] };
      
      render(<TransactionFilters {...mockProps} filters={filtersWithData} />);
      
      await user.click(screen.getByText('Expand'));
      await user.click(screen.getByText('Save Preset'));
      
      const nameInput = screen.getByPlaceholderText('Enter preset name...');
      await user.type(nameInput, 'My Custom Preset');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      
      expect(mockProps.onSavePreset).toHaveBeenCalledWith('My Custom Preset', filtersWithData);
    });
  });

  describe('Integration Tests', () => {
    it('applies multiple filters and shows them as active', async () => {
      const user = userEvent.setup();
      render(<TransactionFilters {...mockProps} />);
      
      // Add search query
      const searchInput = screen.getByPlaceholderText('Search transactions...');
      await user.type(searchInput, 'deposit');
      
      // Expand and add type filter
      await user.click(screen.getByText('Expand'));
      await user.click(screen.getByText('Deposit'));
      
      // Add status filter
      await user.click(screen.getByText('Success'));
      
      // Verify active indicator is shown
      expect(screen.getByText('Active')).toBeInTheDocument();
      
      // Verify multiple filter changes were called
      expect(mockProps.onFiltersChange).toHaveBeenCalledTimes(3);
    });

    it('handles filter removal correctly', async () => {
      const user = userEvent.setup();
      const filtersWithMultipleTypes: FilterType = { 
        types: ['DEPOSIT', 'WITHDRAWAL'],
        statuses: ['SUCCESS']
      };
      
      render(<TransactionFilters {...mockProps} filters={filtersWithMultipleTypes} />);
      
      await user.click(screen.getByText('Expand'));
      
      // Remove one type filter
      await user.click(screen.getByText('Deposit'));
      
      expect(mockProps.onFiltersChange).toHaveBeenCalledWith({
        types: ['WITHDRAWAL'],
        statuses: ['SUCCESS']
      });
    });

    it('handles complete filter clearing', async () => {
      const user = userEvent.setup();
      const filtersWithData: FilterType = { 
        types: ['DEPOSIT'],
        statuses: ['SUCCESS'],
        searchQuery: 'test'
      };
      
      render(<TransactionFilters {...mockProps} filters={filtersWithData} />);
      
      await user.click(screen.getByText('Expand'));
      await user.click(screen.getByText('Clear All'));
      
      expect(mockProps.onClearFilters).toHaveBeenCalled();
    });
  });
});