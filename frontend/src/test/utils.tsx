import React, { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// Mock the auth store
const mockAuthStore = {
  user: {
    id: 'test-user-id',
    name: 'Test User',
    email: 'test@example.com',
    phone: '+1234567890',
    role: 'USER',
  },
  isAuthenticated: true,
  login: vi.fn(),
  logout: vi.fn(),
  setUser: vi.fn(),
};

// Mock zustand store
vi.mock('../store/auth.store', () => ({
  useAuthStore: (selector: any) => {
    if (typeof selector === 'function') {
      return selector(mockAuthStore);
    }
    return mockAuthStore;
  },
}));

// Mock API services
vi.mock('../services/api', () => ({
  transactionAPI: {
    getTransactions: vi.fn(),
    searchTransactions: vi.fn(),
    getSearchSuggestions: vi.fn(),
    getCategories: vi.fn(),
    getFilterPresets: vi.fn(),
    saveFilterPreset: vi.fn(),
    deleteFilterPreset: vi.fn(),
    generateReceipt: vi.fn(),
  },
  walletAPI: {
    getTransactions: vi.fn(),
    createReceipt: vi.fn(),
  },
}));

// Custom render function that includes providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <BrowserRouter>
      {children}
    </BrowserRouter>
  );
};

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => render(ui, { wrapper: AllTheProviders, ...options });

export * from '@testing-library/react';
export { customRender as render };

// Mock data for tests
export const mockTransactions = [
  {
    id: '1',
    type: 'DEPOSIT',
    status: 'SUCCESS',
    amount: 1000,
    description: 'Test deposit',
    createdAt: '2024-01-01T10:00:00Z',
    fromUserId: null,
    toUserId: 'test-user-id',
    fromUser: null,
    toUser: { id: 'test-user-id', name: 'Test User', phone: '+1234567890' },
  },
  {
    id: '2',
    type: 'WITHDRAWAL',
    status: 'SUCCESS',
    amount: 500,
    description: 'Test withdrawal',
    createdAt: '2024-01-02T10:00:00Z',
    fromUserId: 'test-user-id',
    toUserId: null,
    fromUser: { id: 'test-user-id', name: 'Test User', phone: '+1234567890' },
    toUser: null,
  },
  {
    id: '3',
    type: 'TRANSFER',
    status: 'PENDING',
    amount: 250,
    description: 'Test transfer',
    createdAt: '2024-01-03T10:00:00Z',
    fromUserId: 'test-user-id',
    toUserId: 'other-user-id',
    fromUser: { id: 'test-user-id', name: 'Test User', phone: '+1234567890' },
    toUser: { id: 'other-user-id', name: 'Other User', phone: '+0987654321' },
  },
];

export const mockCategories = [
  {
    id: 'cat-1',
    name: 'Food',
    color: '#FF6B6B',
    icon: '🍔',
    isDefault: true,
  },
  {
    id: 'cat-2',
    name: 'Transport',
    color: '#4ECDC4',
    icon: '🚗',
    isDefault: true,
  },
  {
    id: 'cat-3',
    name: 'Bills',
    color: '#45B7D1',
    icon: '💡',
    isDefault: true,
  },
];

export const mockPresets = [
  {
    id: 'preset-1',
    name: 'Last 30 Days',
    filters: {
      dateRange: {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      },
    },
    isDefault: false,
    createdAt: '2024-01-01T00:00:00Z',
    lastUsed: '2024-01-15T00:00:00Z',
  },
  {
    id: 'preset-2',
    name: 'Successful Deposits',
    filters: {
      types: ['DEPOSIT'],
      statuses: ['SUCCESS'],
    },
    isDefault: false,
    createdAt: '2024-01-01T00:00:00Z',
    lastUsed: '2024-01-10T00:00:00Z',
  },
];