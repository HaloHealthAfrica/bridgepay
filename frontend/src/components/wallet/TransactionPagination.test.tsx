import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../test/utils';
import { TransactionPagination } from './TransactionPagination';

describe('TransactionPagination', () => {
  const mockProps = {
    currentPage: 1,
    totalCount: 100,
    pageSize: 20,
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders pagination info correctly', () => {
      render(<TransactionPagination {...mockProps} />);
      
      expect(screen.getByText('Showing 1 to 20 of 100 transactions')).toBeInTheDocument();
      expect(screen.getByDisplayValue('20')).toBeInTheDocument();
      expect(screen.getByText('per page')).toBeInTheDocument();
    });

    it('does not render when totalCount is 0', () => {
      render(<TransactionPagination {...mockProps} totalCount={0} />);
      
      expect(screen.queryByText('Showing')).not.toBeInTheDocument();
    });

    it('calculates correct item range for different pages', () => {
      render(<TransactionPagination {...mockProps} currentPage={3} />);
      
      expect(screen.getByText('Showing 41 to 60 of 100 transactions')).toBeInTheDocument();
    });

    it('handles last page correctly when not full', () => {
      render(<TransactionPagination {...mockProps} currentPage={5} totalCount={85} />);
      
      expect(screen.getByText('Showing 81 to 85 of 85 transactions')).toBeInTheDocument();
    });
  });

  describe('Page Size Selection', () => {
    it('renders all page size options', () => {
      render(<TransactionPagination {...mockProps} />);
      
      const select = screen.getByDisplayValue('20');
      expect(select).toBeInTheDocument();
      
      // Check that all options are available
      expect(screen.getByRole('option', { name: '10' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '20' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '50' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '100' })).toBeInTheDocument();
    });

    it('calls onPageSizeChange when page size is changed', async () => {
      const user = userEvent.setup();
      render(<TransactionPagination {...mockProps} />);
      
      const select = screen.getByDisplayValue('20');
      await user.selectOptions(select, '50');
      
      expect(mockProps.onPageSizeChange).toHaveBeenCalledWith(50);
    });

    it('disables page size select when loading', () => {
      render(<TransactionPagination {...mockProps} isLoading={true} />);
      
      const select = screen.getByDisplayValue('20');
      expect(select).toBeDisabled();
    });
  });

  describe('Page Navigation', () => {
    it('renders page numbers correctly for small total pages', () => {
      render(<TransactionPagination {...mockProps} totalCount={60} />); // 3 pages
      
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('renders page numbers with ellipsis for large total pages', () => {
      render(<TransactionPagination {...mockProps} totalCount={1000} currentPage={10} />); // 50 pages
      
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('...')).toBeInTheDocument();
      expect(screen.getByText('9')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('11')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
    });

    it('highlights current page', () => {
      render(<TransactionPagination {...mockProps} currentPage={3} />);
      
      const currentPageButton = screen.getByText('3');
      expect(currentPageButton).toHaveClass('bg-primary', 'text-white');
    });

    it('calls onPageChange when page number is clicked', async () => {
      const user = userEvent.setup();
      render(<TransactionPagination {...mockProps} />);
      
      await user.click(screen.getByText('2'));
      
      expect(mockProps.onPageChange).toHaveBeenCalledWith(2);
    });

    it('disables page buttons when loading', () => {
      render(<TransactionPagination {...mockProps} isLoading={true} />);
      
      const pageButton = screen.getByText('2');
      expect(pageButton).toBeDisabled();
    });
  });

  describe('Previous/Next Navigation', () => {
    it('renders previous and next buttons', () => {
      render(<TransactionPagination {...mockProps} currentPage={3} />);
      
      const prevButton = screen.getByRole('button', { name: /previous/i });
      const nextButton = screen.getByRole('button', { name: /next/i });
      
      expect(prevButton).toBeInTheDocument();
      expect(nextButton).toBeInTheDocument();
    });

    it('disables previous button on first page', () => {
      render(<TransactionPagination {...mockProps} currentPage={1} />);
      
      const prevButton = screen.getByRole('button', { name: /previous/i });
      expect(prevButton).toBeDisabled();
    });

    it('disables next button on last page', () => {
      render(<TransactionPagination {...mockProps} currentPage={5} totalCount={100} />);
      
      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeDisabled();
    });

    it('calls onPageChange when previous button is clicked', async () => {
      const user = userEvent.setup();
      render(<TransactionPagination {...mockProps} currentPage={3} />);
      
      const prevButton = screen.getByRole('button', { name: /previous/i });
      await user.click(prevButton);
      
      expect(mockProps.onPageChange).toHaveBeenCalledWith(2);
    });

    it('calls onPageChange when next button is clicked', async () => {
      const user = userEvent.setup();
      render(<TransactionPagination {...mockProps} currentPage={3} />);
      
      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);
      
      expect(mockProps.onPageChange).toHaveBeenCalledWith(4);
    });

    it('disables navigation buttons when loading', () => {
      render(<TransactionPagination {...mockProps} currentPage={3} isLoading={true} />);
      
      const prevButton = screen.getByRole('button', { name: /previous/i });
      const nextButton = screen.getByRole('button', { name: /next/i });
      
      expect(prevButton).toBeDisabled();
      expect(nextButton).toBeDisabled();
    });
  });

  describe('Edge Cases', () => {
    it('handles single page correctly', () => {
      render(<TransactionPagination {...mockProps} totalCount={15} />);
      
      expect(screen.getByText('Showing 1 to 15 of 15 transactions')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.queryByText('2')).not.toBeInTheDocument();
    });

    it('handles exact page size multiples', () => {
      render(<TransactionPagination {...mockProps} totalCount={100} pageSize={20} />);
      
      // Should have exactly 5 pages
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.queryByText('6')).not.toBeInTheDocument();
    });

    it('handles very large page numbers correctly', () => {
      render(<TransactionPagination {...mockProps} totalCount={10000} currentPage={250} />);
      
      // Should show ellipsis and current page area
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('...')).toBeInTheDocument();
      expect(screen.getByText('249')).toBeInTheDocument();
      expect(screen.getByText('250')).toBeInTheDocument();
      expect(screen.getByText('251')).toBeInTheDocument();
      expect(screen.getByText('500')).toBeInTheDocument(); // Last page
    });

    it('handles page size larger than total count', () => {
      render(<TransactionPagination {...mockProps} totalCount={15} pageSize={50} />);
      
      expect(screen.getByText('Showing 1 to 15 of 15 transactions')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.queryByText('2')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('provides proper ARIA labels for navigation buttons', () => {
      render(<TransactionPagination {...mockProps} currentPage={3} />);
      
      const prevButton = screen.getByRole('button', { name: /previous/i });
      const nextButton = screen.getByRole('button', { name: /next/i });
      
      expect(prevButton).toBeInTheDocument();
      expect(nextButton).toBeInTheDocument();
    });

    it('maintains focus management for keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<TransactionPagination {...mockProps} />);
      
      const pageButton = screen.getByText('2');
      await user.tab(); // Tab to the button
      
      expect(document.activeElement).toBe(pageButton);
    });
  });

  describe('Performance', () => {
    it('does not re-render unnecessarily when props do not change', () => {
      const { rerender } = render(<TransactionPagination {...mockProps} />);
      
      const initialText = screen.getByText('Showing 1 to 20 of 100 transactions');
      
      // Re-render with same props
      rerender(<TransactionPagination {...mockProps} />);
      
      expect(screen.getByText('Showing 1 to 20 of 100 transactions')).toBe(initialText);
    });

    it('updates correctly when props change', () => {
      const { rerender } = render(<TransactionPagination {...mockProps} />);
      
      expect(screen.getByText('Showing 1 to 20 of 100 transactions')).toBeInTheDocument();
      
      // Re-render with different props
      rerender(<TransactionPagination {...mockProps} currentPage={2} />);
      
      expect(screen.getByText('Showing 21 to 40 of 100 transactions')).toBeInTheDocument();
    });
  });
});