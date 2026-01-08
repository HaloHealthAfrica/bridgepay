import { EnhancedTransaction, TransactionCategory } from "../types/transaction";
import { TransactionType, TransactionStatus } from "@prisma/client";
import { transactionDisplayService, DisplayConfig } from "./transactionDisplay.service";

export interface ExpandedTransactionDetails {
  id: string;
  basicInfo: BasicTransactionInfo;
  expandedInfo: ExpandedTransactionInfo;
  feeDetails: FeeDetails;
  metadataDetails: MetadataDetails;
  receiptDetails: ReceiptDetails;
  categoryDetails: CategoryDetails;
  auditTrail: AuditTrail;
  relatedTransactions?: RelatedTransaction[];
}

export interface BasicTransactionInfo {
  reference: string;
  formattedAmount: string;
  formattedDate: string;
  statusIndicator: {
    text: string;
    color: string;
    icon: string;
  };
  recipientInfo: {
    displayName: string;
    direction: 'sent' | 'received' | 'internal';
    label: string;
  };
}

export interface ExpandedTransactionInfo {
  description?: string;
  notes?: string;
  tags: TagInfo[];
  transactionType: TransactionTypeInfo;
  processingTime?: string;
  confirmations?: number;
  networkInfo?: NetworkInfo;
}

export interface FeeDetails {
  breakdown: FeeBreakdownItem[];
  totalFee: string;
  feePercentage: string;
  feeExplanation: string;
  feeComparison?: FeeComparison;
}

export interface FeeBreakdownItem {
  type: string;
  amount: string;
  description: string;
  percentage: string;
}

export interface FeeComparison {
  averageFee: string;
  comparison: 'lower' | 'average' | 'higher';
  percentageDifference: string;
}

export interface MetadataDetails {
  rawMetadata?: Record<string, any>;
  processedMetadata: ProcessedMetadataItem[];
  systemInfo: SystemInfo;
}

export interface ProcessedMetadataItem {
  key: string;
  value: string;
  displayName: string;
  category: 'system' | 'user' | 'external';
  sensitive: boolean;
}

export interface SystemInfo {
  createdAt: string;
  updatedAt: string;
  version?: string;
  source: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ReceiptDetails {
  status: 'none' | 'generating' | 'available' | 'failed';
  statusText: string;
  receiptUrl?: string;
  downloadOptions: DownloadOption[];
  shareOptions: ShareOption[];
  regenerationAvailable: boolean;
}

export interface DownloadOption {
  format: 'PDF' | 'HTML' | 'JSON';
  url: string;
  size?: string;
  description: string;
}

export interface ShareOption {
  method: 'email' | 'sms' | 'link';
  label: string;
  available: boolean;
  description: string;
}

export interface CategoryDetails {
  current?: CategoryInfo;
  suggestions: CategorySuggestion[];
  history: CategoryHistoryItem[];
  bulkActions: BulkActionOption[];
}

export interface CategoryInfo {
  id: string;
  name: string;
  color: string;
  icon?: string;
  assignedAt: Date;
  assignedBy: 'user' | 'system' | 'ml';
}

export interface CategorySuggestion {
  category: CategoryInfo;
  confidence: number;
  reason: string;
  canApply: boolean;
}

export interface CategoryHistoryItem {
  category: CategoryInfo;
  assignedAt: Date;
  assignedBy: 'user' | 'system' | 'ml';
  action: 'assigned' | 'removed' | 'changed';
}

export interface BulkActionOption {
  action: 'categorize' | 'tag' | 'note';
  label: string;
  description: string;
  available: boolean;
}

export interface AuditTrail {
  events: AuditEvent[];
  timeline: TimelineEvent[];
  statusHistory: StatusHistoryItem[];
}

export interface AuditEvent {
  timestamp: Date;
  event: string;
  description: string;
  actor: 'system' | 'user' | 'external';
  details?: Record<string, any>;
}

export interface TimelineEvent {
  timestamp: Date;
  title: string;
  description: string;
  type: 'info' | 'warning' | 'error' | 'success';
  icon: string;
}

export interface StatusHistoryItem {
  status: TransactionStatus;
  timestamp: Date;
  reason?: string;
  duration?: string;
}

export interface RelatedTransaction {
  id: string;
  reference: string;
  type: TransactionType;
  amount: string;
  date: string;
  relationship: 'refund' | 'reversal' | 'split' | 'fee' | 'escrow';
  description: string;
}

export interface TagInfo {
  name: string;
  color: string;
  category: 'user' | 'system' | 'auto';
  removable: boolean;
}

export interface TransactionTypeInfo {
  type: TransactionType;
  displayName: string;
  description: string;
  icon: string;
  color: string;
  category: 'incoming' | 'outgoing' | 'internal';
}

export interface NetworkInfo {
  network: string;
  blockHeight?: number;
  confirmations?: number;
  gasUsed?: string;
  gasPrice?: string;
}

export class TransactionDetailsService {
  /**
   * Get expanded transaction details for UI display
   * **Validates: Requirements 5.6**
   */
  async getExpandedDetails(
    transaction: EnhancedTransaction,
    config: Partial<DisplayConfig> = {}
  ): Promise<ExpandedTransactionDetails> {
    const formatted = transactionDisplayService.formatTransaction(transaction, config);

    return {
      id: transaction.id,
      basicInfo: this.extractBasicInfo(formatted),
      expandedInfo: this.extractExpandedInfo(transaction),
      feeDetails: await this.extractFeeDetails(transaction, config),
      metadataDetails: this.extractMetadataDetails(transaction),
      receiptDetails: this.extractReceiptDetails(transaction),
      categoryDetails: await this.extractCategoryDetails(transaction),
      auditTrail: this.extractAuditTrail(transaction),
      relatedTransactions: await this.findRelatedTransactions(transaction),
    };
  }

  /**
   * Extract basic transaction information
   */
  private extractBasicInfo(formatted: any): BasicTransactionInfo {
    return {
      reference: formatted.expandableDetails.reference,
      formattedAmount: formatted.formattedAmount,
      formattedDate: formatted.formattedDateTime,
      statusIndicator: {
        text: formatted.statusIndicator.text,
        color: formatted.statusIndicator.color,
        icon: formatted.statusIndicator.icon,
      },
      recipientInfo: {
        displayName: formatted.recipientInfo.displayName,
        direction: formatted.recipientInfo.direction,
        label: formatted.recipientInfo.label,
      },
    };
  }

  /**
   * Extract expanded transaction information
   */
  private extractExpandedInfo(transaction: EnhancedTransaction): ExpandedTransactionInfo {
    return {
      description: transaction.description,
      notes: transaction.notes,
      tags: this.formatTags(transaction.tags),
      transactionType: this.getTransactionTypeInfo(transaction.type),
      processingTime: this.calculateProcessingTime(transaction),
      confirmations: this.getConfirmations(transaction),
      networkInfo: this.extractNetworkInfo(transaction),
    };
  }

  /**
   * Extract detailed fee information
   */
  private async extractFeeDetails(
    transaction: EnhancedTransaction,
    config: Partial<DisplayConfig> = {}
  ): Promise<FeeDetails> {
    const breakdown = this.calculateDetailedFeeBreakdown(transaction, config);
    const comparison = await this.getFeeComparison(transaction);

    return {
      breakdown,
      totalFee: transactionDisplayService.formatTransaction(transaction, config).formattedFee,
      feePercentage: this.calculateFeePercentage(transaction),
      feeExplanation: this.generateFeeExplanation(transaction),
      feeComparison: comparison,
    };
  }

  /**
   * Calculate detailed fee breakdown
   */
  private calculateDetailedFeeBreakdown(
    transaction: EnhancedTransaction,
    config: Partial<DisplayConfig> = {}
  ): FeeBreakdownItem[] {
    const totalFee = transaction.fee || 0;
    const breakdown: FeeBreakdownItem[] = [];

    if (totalFee > 0) {
      // Base processing fee (simplified - in reality this would be more complex)
      const processingFee = totalFee * 0.8;
      const networkFee = totalFee * 0.15;
      const serviceFee = totalFee * 0.05;

      breakdown.push({
        type: 'processing',
        amount: transactionDisplayService.formatTransaction({
          ...transaction,
          amount: processingFee,
        } as EnhancedTransaction, config).formattedAmount,
        description: 'Transaction processing fee',
        percentage: '80%',
      });

      if (networkFee > 0) {
        breakdown.push({
          type: 'network',
          amount: transactionDisplayService.formatTransaction({
            ...transaction,
            amount: networkFee,
          } as EnhancedTransaction, config).formattedAmount,
          description: 'Network/gateway fee',
          percentage: '15%',
        });
      }

      if (serviceFee > 0) {
        breakdown.push({
          type: 'service',
          amount: transactionDisplayService.formatTransaction({
            ...transaction,
            amount: serviceFee,
          } as EnhancedTransaction, config).formattedAmount,
          description: 'Service fee',
          percentage: '5%',
        });
      }
    }

    return breakdown;
  }

  /**
   * Get fee comparison with average fees
   */
  private async getFeeComparison(transaction: EnhancedTransaction): Promise<FeeComparison | undefined> {
    // In a real implementation, this would query historical fee data
    const averageFee = 25; // Placeholder average fee
    const currentFee = transaction.fee || 0;

    if (currentFee === 0) return undefined;

    const difference = ((currentFee - averageFee) / averageFee) * 100;
    let comparison: 'lower' | 'average' | 'higher';

    if (difference < -10) {
      comparison = 'lower';
    } else if (difference > 10) {
      comparison = 'higher';
    } else {
      comparison = 'average';
    }

    return {
      averageFee: `KES ${averageFee.toFixed(2)}`,
      comparison,
      percentageDifference: `${Math.abs(difference).toFixed(1)}%`,
    };
  }

  /**
   * Extract metadata details
   */
  private extractMetadataDetails(transaction: EnhancedTransaction): MetadataDetails {
    const processedMetadata: ProcessedMetadataItem[] = [];

    if (transaction.metadata) {
      Object.entries(transaction.metadata).forEach(([key, value]) => {
        try {
          processedMetadata.push({
            key,
            value: typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value),
            displayName: this.formatMetadataKey(key),
            category: this.categorizeMetadataKey(key),
            sensitive: this.isMetadataSensitive(key),
          });
        } catch (error) {
          // Skip metadata entries that can't be processed
          processedMetadata.push({
            key,
            value: '[Unprocessable value]',
            displayName: this.formatMetadataKey(key),
            category: this.categorizeMetadataKey(key),
            sensitive: this.isMetadataSensitive(key),
          });
        }
      });
    }

    return {
      rawMetadata: transaction.metadata,
      processedMetadata,
      systemInfo: {
        createdAt: isNaN(transaction.createdAt.getTime()) ? new Date().toISOString() : transaction.createdAt.toISOString(),
        updatedAt: isNaN(transaction.updatedAt.getTime()) ? new Date().toISOString() : transaction.updatedAt.toISOString(),
        source: 'lemonade-api',
        version: '1.0.0',
      },
    };
  }

  /**
   * Extract receipt details
   */
  private extractReceiptDetails(transaction: EnhancedTransaction): ReceiptDetails {
    const status = this.mapReceiptStatus(transaction.receiptStatus);
    
    return {
      status,
      statusText: this.getReceiptStatusText(status),
      receiptUrl: transaction.receiptUrl,
      downloadOptions: this.getDownloadOptions(transaction),
      shareOptions: this.getShareOptions(transaction),
      regenerationAvailable: status === 'failed' || status === 'none',
    };
  }

  /**
   * Extract category details
   */
  private async extractCategoryDetails(transaction: EnhancedTransaction): Promise<CategoryDetails> {
    const suggestions = await this.getCategorySuggestions(transaction);
    const history = await this.getCategoryHistory(transaction);

    return {
      current: transaction.category ? {
        id: transaction.category.id,
        name: transaction.category.name,
        color: transaction.category.color,
        icon: transaction.category.icon,
        assignedAt: transaction.updatedAt, // Simplified
        assignedBy: 'user',
      } : undefined,
      suggestions,
      history,
      bulkActions: this.getBulkActionOptions(),
    };
  }

  /**
   * Extract audit trail
   */
  private extractAuditTrail(transaction: EnhancedTransaction): AuditTrail {
    const events: AuditEvent[] = [
      {
        timestamp: transaction.createdAt,
        event: 'transaction_created',
        description: 'Transaction was created',
        actor: 'system',
      },
    ];

    if (transaction.updatedAt > transaction.createdAt) {
      events.push({
        timestamp: transaction.updatedAt,
        event: 'transaction_updated',
        description: 'Transaction was updated',
        actor: 'system',
      });
    }

    const timeline: TimelineEvent[] = events.map(event => ({
      timestamp: event.timestamp,
      title: this.formatEventTitle(event.event),
      description: event.description,
      type: this.getEventType(event.event),
      icon: this.getEventIcon(event.event),
    }));

    const statusHistory: StatusHistoryItem[] = [
      {
        status: transaction.status,
        timestamp: transaction.createdAt,
        reason: 'Initial status',
      },
    ];

    return {
      events,
      timeline,
      statusHistory,
    };
  }

  /**
   * Find related transactions
   */
  private async findRelatedTransactions(transaction: EnhancedTransaction): Promise<RelatedTransaction[]> {
    // In a real implementation, this would query the database for related transactions
    // For now, return empty array
    return [];
  }

  /**
   * Format tags for display
   */
  private formatTags(tags: string[]): TagInfo[] {
    return tags.map(tag => ({
      name: tag,
      color: this.getTagColor(tag),
      category: this.getTagCategory(tag),
      removable: true,
    }));
  }

  /**
   * Get transaction type information
   */
  private getTransactionTypeInfo(type: TransactionType): TransactionTypeInfo {
    const typeInfo: Record<TransactionType, Omit<TransactionTypeInfo, 'type'>> = {
      DEPOSIT: {
        displayName: 'Deposit',
        description: 'Money received into your account',
        icon: '↓',
        color: '#10B981',
        category: 'incoming',
      },
      WITHDRAWAL: {
        displayName: 'Withdrawal',
        description: 'Money withdrawn from your account',
        icon: '↑',
        color: '#EF4444',
        category: 'outgoing',
      },
      TRANSFER: {
        displayName: 'Transfer',
        description: 'Money transferred between accounts',
        icon: '↔',
        color: '#3B82F6',
        category: 'internal',
      },
      PAYMENT: {
        displayName: 'Payment',
        description: 'Payment for goods or services',
        icon: '💳',
        color: '#8B5CF6',
        category: 'outgoing',
      },
      ESCROW_LOCK: {
        displayName: 'Escrow Lock',
        description: 'Funds locked in escrow',
        icon: '🔒',
        color: '#F59E0B',
        category: 'internal',
      },
      ESCROW_RELEASE: {
        displayName: 'Escrow Release',
        description: 'Funds released from escrow',
        icon: '🔓',
        color: '#10B981',
        category: 'incoming',
      },
      REFUND: {
        displayName: 'Refund',
        description: 'Money refunded to your account',
        icon: '↩',
        color: '#6B7280',
        category: 'incoming',
      },
    };

    return {
      type,
      ...typeInfo[type],
    };
  }

  /**
   * Calculate processing time
   */
  private calculateProcessingTime(transaction: EnhancedTransaction): string | undefined {
    if (transaction.status === TransactionStatus.SUCCESS) {
      const processingTime = transaction.updatedAt.getTime() - transaction.createdAt.getTime();
      const seconds = Math.floor(processingTime / 1000);
      
      if (seconds < 60) {
        return `${seconds} seconds`;
      } else if (seconds < 3600) {
        return `${Math.floor(seconds / 60)} minutes`;
      } else {
        return `${Math.floor(seconds / 3600)} hours`;
      }
    }
    return undefined;
  }

  /**
   * Get confirmations (placeholder)
   */
  private getConfirmations(transaction: EnhancedTransaction): number | undefined {
    if (transaction.status === TransactionStatus.SUCCESS) {
      return 6; // Placeholder
    }
    return undefined;
  }

  /**
   * Extract network information
   */
  private extractNetworkInfo(transaction: EnhancedTransaction): NetworkInfo | undefined {
    // In a real implementation, this would extract network-specific information
    return undefined;
  }

  /**
   * Calculate fee percentage
   */
  private calculateFeePercentage(transaction: EnhancedTransaction): string {
    const fee = transaction.fee || 0;
    const amount = transaction.amount || 0;
    
    if (amount > 0) {
      const percentage = (fee / amount) * 100;
      return `${percentage.toFixed(2)}%`;
    }
    return '0%';
  }

  /**
   * Generate fee explanation
   */
  private generateFeeExplanation(transaction: EnhancedTransaction): string {
    const type = transaction.type;
    const fee = transaction.fee || 0;

    if (fee === 0) {
      return 'No fees applied to this transaction.';
    }

    switch (type) {
      case TransactionType.TRANSFER:
        return 'Transfer fees cover processing and network costs.';
      case TransactionType.WITHDRAWAL:
        return 'Withdrawal fees cover processing and external network costs.';
      case TransactionType.PAYMENT:
        return 'Payment fees cover merchant processing and gateway costs.';
      default:
        return 'Fees cover transaction processing and network costs.';
    }
  }

  // Helper methods
  private mapReceiptStatus(status: string): 'none' | 'generating' | 'available' | 'failed' {
    const statusMap: Record<string, 'none' | 'generating' | 'available' | 'failed'> = {
      'NONE': 'none',
      'GENERATING': 'generating',
      'AVAILABLE': 'available',
      'FAILED': 'failed',
    };
    return statusMap[status] || 'none';
  }

  private getReceiptStatusText(status: 'none' | 'generating' | 'available' | 'failed'): string {
    const statusText = {
      'none': 'No receipt available',
      'generating': 'Generating receipt...',
      'available': 'Receipt ready for download',
      'failed': 'Receipt generation failed',
    };
    return statusText[status];
  }

  private getDownloadOptions(transaction: EnhancedTransaction): DownloadOption[] {
    if (transaction.receiptStatus !== 'AVAILABLE') return [];

    return [
      {
        format: 'PDF',
        url: transaction.receiptUrl || '',
        description: 'Download as PDF document',
      },
      {
        format: 'HTML',
        url: transaction.receiptUrl?.replace('.pdf', '.html') || '',
        description: 'View in browser',
      },
    ];
  }

  private getShareOptions(transaction: EnhancedTransaction): ShareOption[] {
    return [
      {
        method: 'email',
        label: 'Email Receipt',
        available: transaction.receiptStatus === 'AVAILABLE',
        description: 'Send receipt via email',
      },
      {
        method: 'link',
        label: 'Copy Link',
        available: transaction.receiptStatus === 'AVAILABLE',
        description: 'Copy shareable link',
      },
    ];
  }

  private async getCategorySuggestions(transaction: EnhancedTransaction): Promise<CategorySuggestion[]> {
    // Placeholder implementation
    return [];
  }

  private async getCategoryHistory(transaction: EnhancedTransaction): Promise<CategoryHistoryItem[]> {
    // Placeholder implementation
    return [];
  }

  private getBulkActionOptions(): BulkActionOption[] {
    return [
      {
        action: 'categorize',
        label: 'Bulk Categorize',
        description: 'Apply category to similar transactions',
        available: true,
      },
      {
        action: 'tag',
        label: 'Bulk Tag',
        description: 'Add tags to similar transactions',
        available: true,
      },
    ];
  }

  private formatMetadataKey(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  }

  private categorizeMetadataKey(key: string): 'system' | 'user' | 'external' {
    const systemKeys = ['id', 'createdAt', 'updatedAt', 'version'];
    const userKeys = ['notes', 'tags', 'category'];
    
    if (systemKeys.includes(key)) return 'system';
    if (userKeys.includes(key)) return 'user';
    return 'external';
  }

  private isMetadataSensitive(key: string): boolean {
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'pin'];
    return sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive));
  }

  private getTagColor(tag: string): string {
    // Simple hash-based color generation
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 70%, 50%)`;
  }

  private getTagCategory(tag: string): 'user' | 'system' | 'auto' {
    const systemTags = ['system', 'auto', 'generated'];
    if (systemTags.some(sys => tag.toLowerCase().includes(sys))) {
      return 'system';
    }
    return 'user';
  }

  private formatEventTitle(event: string): string {
    return event.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private getEventType(event: string): 'info' | 'warning' | 'error' | 'success' {
    if (event.includes('error') || event.includes('failed')) return 'error';
    if (event.includes('warning')) return 'warning';
    if (event.includes('success') || event.includes('completed')) return 'success';
    return 'info';
  }

  private getEventIcon(event: string): string {
    if (event.includes('created')) return '✨';
    if (event.includes('updated')) return '📝';
    if (event.includes('completed')) return '✅';
    if (event.includes('failed')) return '❌';
    return 'ℹ️';
  }
}

export const transactionDetailsService = new TransactionDetailsService();