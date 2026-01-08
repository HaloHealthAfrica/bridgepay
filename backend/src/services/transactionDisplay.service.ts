import { EnhancedTransaction, TransactionCategory } from "../types/transaction";
import { TransactionType, TransactionStatus } from "@prisma/client";

export interface DisplayConfig {
  currency: string;
  timezone: string;
  locale: string;
  dateFormat: 'short' | 'medium' | 'long' | 'full';
  timeFormat: '12h' | '24h';
}

export interface FormattedTransaction {
  id: string;
  formattedAmount: string;
  formattedFee: string;
  formattedDate: string;
  formattedTime: string;
  formattedDateTime: string;
  statusIndicator: StatusIndicator;
  recipientInfo: RecipientInfo;
  expandableDetails: ExpandableDetails;
  visualElements: VisualElements;
}

export interface StatusIndicator {
  text: string;
  color: string;
  icon: string;
  backgroundColor: string;
  borderColor: string;
}

export interface RecipientInfo {
  displayName: string;
  displayPhone?: string;
  direction: 'sent' | 'received' | 'internal';
  label: string;
}

export interface ExpandableDetails {
  reference: string;
  description?: string;
  category?: {
    name: string;
    color: string;
    icon?: string;
  };
  tags: string[];
  notes?: string;
  metadata?: Record<string, any>;
  receiptStatus: string;
  receiptUrl?: string;
  feeBreakdown: FeeBreakdown;
}

export interface FeeBreakdown {
  baseFee: string;
  processingFee?: string;
  networkFee?: string;
  totalFee: string;
  feePercentage: string;
}

export interface VisualElements {
  typeIcon: string;
  typeColor: string;
  amountColor: string;
  backgroundClass: string;
  borderClass: string;
}

export class TransactionDisplayService {
  private readonly defaultConfig: DisplayConfig = {
    currency: 'KES',
    timezone: 'Africa/Nairobi',
    locale: 'en-KE',
    dateFormat: 'medium',
    timeFormat: '24h',
  };

  /**
   * Format a single transaction for display
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
   */
  formatTransaction(
    transaction: EnhancedTransaction, 
    config: Partial<DisplayConfig> = {}
  ): FormattedTransaction {
    const displayConfig = { ...this.defaultConfig, ...config };

    return {
      id: transaction.id,
      formattedAmount: this.formatCurrency(transaction.amount, displayConfig),
      formattedFee: this.formatCurrency(transaction.fee, displayConfig),
      formattedDate: this.formatDate(transaction.createdAt, displayConfig),
      formattedTime: this.formatTime(transaction.createdAt, displayConfig),
      formattedDateTime: this.formatDateTime(transaction.createdAt, displayConfig),
      statusIndicator: this.getStatusIndicator(transaction.status),
      recipientInfo: this.getRecipientInfo(transaction),
      expandableDetails: this.getExpandableDetails(transaction, displayConfig),
      visualElements: this.getVisualElements(transaction),
    };
  }

  /**
   * Format multiple transactions for display
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
   */
  formatTransactions(
    transactions: EnhancedTransaction[], 
    config: Partial<DisplayConfig> = {}
  ): FormattedTransaction[] {
    return transactions.map(transaction => 
      this.formatTransaction(transaction, config)
    );
  }

  /**
   * Format currency amount with proper formatting
   * **Validates: Requirements 5.1**
   */
  private formatCurrency(amount: number, config: DisplayConfig): string {
    try {
      return new Intl.NumberFormat(config.locale, {
        style: 'currency',
        currency: config.currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch (error) {
      // Fallback formatting if locale/currency is not supported
      return `${config.currency} ${amount.toFixed(2)}`;
    }
  }

  /**
   * Format date with timezone awareness
   * **Validates: Requirements 5.2**
   */
  private formatDate(date: Date, config: DisplayConfig): string {
    try {
      return new Intl.DateTimeFormat(config.locale, {
        timeZone: config.timezone,
        dateStyle: config.dateFormat,
      }).format(date);
    } catch (error) {
      // Fallback formatting
      return date.toLocaleDateString();
    }
  }

  /**
   * Format time with timezone awareness
   * **Validates: Requirements 5.2**
   */
  private formatTime(date: Date, config: DisplayConfig): string {
    try {
      return new Intl.DateTimeFormat(config.locale, {
        timeZone: config.timezone,
        timeStyle: 'short',
        hour12: config.timeFormat === '12h',
      }).format(date);
    } catch (error) {
      // Fallback formatting
      return date.toLocaleTimeString();
    }
  }

  /**
   * Format date and time together
   * **Validates: Requirements 5.2**
   */
  private formatDateTime(date: Date, config: DisplayConfig): string {
    try {
      return new Intl.DateTimeFormat(config.locale, {
        timeZone: config.timezone,
        dateStyle: config.dateFormat,
        timeStyle: 'short',
        hour12: config.timeFormat === '12h',
      }).format(date);
    } catch (error) {
      // Fallback formatting
      return date.toLocaleString();
    }
  }

  /**
   * Get status indicator with visual elements
   * **Validates: Requirements 5.3**
   */
  private getStatusIndicator(status: TransactionStatus): StatusIndicator {
    const indicators: Record<TransactionStatus, StatusIndicator> = {
      SUCCESS: {
        text: 'Completed',
        color: '#10B981', // Green
        icon: '✓',
        backgroundColor: '#ECFDF5',
        borderColor: '#10B981',
      },
      PENDING: {
        text: 'Pending',
        color: '#F59E0B', // Amber
        icon: '⏳',
        backgroundColor: '#FFFBEB',
        borderColor: '#F59E0B',
      },
      FAILED: {
        text: 'Failed',
        color: '#EF4444', // Red
        icon: '✗',
        backgroundColor: '#FEF2F2',
        borderColor: '#EF4444',
      },
      CANCELLED: {
        text: 'Cancelled',
        color: '#6B7280', // Gray
        icon: '⊘',
        backgroundColor: '#F9FAFB',
        borderColor: '#6B7280',
      },
    };

    return indicators[status];
  }

  /**
   * Get recipient/sender information
   * **Validates: Requirements 5.4**
   */
  private getRecipientInfo(transaction: EnhancedTransaction): RecipientInfo {
    const { fromUser, toUser, type } = transaction;

    // Determine direction and primary contact
    let direction: 'sent' | 'received' | 'internal';
    let displayName: string;
    let displayPhone: string | undefined;
    let label: string;

    if (type === TransactionType.DEPOSIT) {
      direction = 'received';
      displayName = fromUser?.name || 'External Source';
      displayPhone = fromUser?.phone;
      label = 'From';
    } else if (type === TransactionType.WITHDRAWAL) {
      direction = 'sent';
      displayName = toUser?.name || 'External Destination';
      displayPhone = toUser?.phone;
      label = 'To';
    } else if (type === TransactionType.TRANSFER) {
      // For transfers, determine direction based on user context
      // This would need user context to determine if it's sent or received
      direction = 'internal';
      displayName = toUser?.name || fromUser?.name || 'Unknown';
      displayPhone = toUser?.phone || fromUser?.phone;
      label = toUser ? 'To' : 'From';
    } else {
      // PAYMENT, ESCROW_LOCK, ESCROW_RELEASE, REFUND
      direction = 'sent';
      displayName = toUser?.name || 'Service';
      displayPhone = toUser?.phone;
      label = 'To';
    }

    return {
      displayName,
      displayPhone,
      direction,
      label,
    };
  }

  /**
   * Get expandable details for transaction
   * **Validates: Requirements 5.6**
   */
  private getExpandableDetails(
    transaction: EnhancedTransaction, 
    config: DisplayConfig
  ): ExpandableDetails {
    return {
      reference: transaction.reference,
      description: transaction.description,
      category: transaction.category ? {
        name: transaction.category.name,
        color: transaction.category.color,
        icon: transaction.category.icon,
      } : undefined,
      tags: transaction.tags,
      notes: transaction.notes,
      metadata: transaction.metadata,
      receiptStatus: this.formatReceiptStatus(transaction.receiptStatus),
      receiptUrl: transaction.receiptUrl,
      feeBreakdown: this.calculateFeeBreakdown(transaction, config),
    };
  }

  /**
   * Calculate fee breakdown
   * **Validates: Requirements 5.5**
   */
  private calculateFeeBreakdown(
    transaction: EnhancedTransaction, 
    config: DisplayConfig
  ): FeeBreakdown {
    const totalFee = transaction.fee || 0;
    const transactionAmount = transaction.amount || 0;
    
    // For now, treat all fees as base fee
    // In a real implementation, this could be broken down further
    const baseFee = totalFee;
    
    // Handle edge cases for percentage calculation
    let feePercentage: string;
    if (transactionAmount > 0 && !isNaN(totalFee) && !isNaN(transactionAmount)) {
      const percentage = (totalFee / transactionAmount) * 100;
      feePercentage = isNaN(percentage) ? '0%' : percentage.toFixed(2) + '%';
    } else {
      feePercentage = '0%';
    }

    return {
      baseFee: this.formatCurrency(baseFee, config),
      totalFee: this.formatCurrency(totalFee, config),
      feePercentage,
    };
  }

  /**
   * Format receipt status for display
   */
  private formatReceiptStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'NONE': 'No Receipt',
      'GENERATING': 'Generating Receipt...',
      'AVAILABLE': 'Receipt Available',
      'FAILED': 'Receipt Generation Failed',
    };

    return statusMap[status] || status;
  }

  /**
   * Get visual elements for transaction type
   * **Validates: Requirements 5.3**
   */
  private getVisualElements(transaction: EnhancedTransaction): VisualElements {
    const typeElements: Record<TransactionType, Omit<VisualElements, 'amountColor'>> = {
      DEPOSIT: {
        typeIcon: '↓',
        typeColor: '#10B981', // Green
        backgroundClass: 'bg-green-50',
        borderClass: 'border-green-200',
      },
      WITHDRAWAL: {
        typeIcon: '↑',
        typeColor: '#EF4444', // Red
        backgroundClass: 'bg-red-50',
        borderClass: 'border-red-200',
      },
      TRANSFER: {
        typeIcon: '↔',
        typeColor: '#3B82F6', // Blue
        backgroundClass: 'bg-blue-50',
        borderClass: 'border-blue-200',
      },
      PAYMENT: {
        typeIcon: '💳',
        typeColor: '#8B5CF6', // Purple
        backgroundClass: 'bg-purple-50',
        borderClass: 'border-purple-200',
      },
      ESCROW_LOCK: {
        typeIcon: '🔒',
        typeColor: '#F59E0B', // Amber
        backgroundClass: 'bg-amber-50',
        borderClass: 'border-amber-200',
      },
      ESCROW_RELEASE: {
        typeIcon: '🔓',
        typeColor: '#10B981', // Green
        backgroundClass: 'bg-green-50',
        borderClass: 'border-green-200',
      },
      REFUND: {
        typeIcon: '↩',
        typeColor: '#6B7280', // Gray
        backgroundClass: 'bg-gray-50',
        borderClass: 'border-gray-200',
      },
    };

    const baseElements = typeElements[transaction.type];
    
    // Determine amount color based on transaction type and direction
    let amountColor: string;
    if (transaction.type === TransactionType.DEPOSIT || 
        transaction.type === TransactionType.ESCROW_RELEASE ||
        transaction.type === TransactionType.REFUND) {
      amountColor = '#10B981'; // Green for incoming money
    } else {
      amountColor = '#EF4444'; // Red for outgoing money
    }

    return {
      ...baseElements,
      amountColor,
    };
  }

  /**
   * Get relative time display (e.g., "2 hours ago")
   */
  getRelativeTime(date: Date, config: Partial<DisplayConfig> = {}): string {
    const displayConfig = { ...this.defaultConfig, ...config };
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'Just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} day${days > 1 ? 's' : ''} ago`;
    } else {
      // For older transactions, show the formatted date
      return this.formatDate(date, displayConfig);
    }
  }

  /**
   * Get transaction summary for quick display
   */
  getTransactionSummary(transaction: EnhancedTransaction): string {
    const recipientInfo = this.getRecipientInfo(transaction);
    const amount = this.formatCurrency(transaction.amount, this.defaultConfig);
    
    return `${amount} ${recipientInfo.direction} ${recipientInfo.label.toLowerCase()} ${recipientInfo.displayName}`;
  }

  /**
   * Validate display configuration
   */
  validateDisplayConfig(config: Partial<DisplayConfig>): boolean {
    try {
      // Test currency formatting
      if (config.currency) {
        new Intl.NumberFormat(config.locale || this.defaultConfig.locale, {
          style: 'currency',
          currency: config.currency,
        }).format(100);
      }

      // Test date formatting
      if (config.timezone) {
        new Intl.DateTimeFormat(config.locale || this.defaultConfig.locale, {
          timeZone: config.timezone,
        }).format(new Date());
      }

      return true;
    } catch (error) {
      return false;
    }
  }
}

export const transactionDisplayService = new TransactionDisplayService();