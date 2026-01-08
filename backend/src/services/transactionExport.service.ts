import { prisma } from "../lib/prisma";
import { 
  ExportRequest, 
  ExportResult, 
  TransactionFilters, 
  EnhancedTransaction 
} from "../types/transaction";
import { transactionFilterService } from "./transactionFilter.service";
import { transactionAnalyticsService } from "./transactionAnalytics.service";
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class TransactionExportService {
  private readonly exportDir = path.join(process.cwd(), 'exports');

  constructor() {
    this.ensureExportDirectory();
  }

  /**
   * Export transactions in the specified format
   */
  async exportTransactions(
    userId: string, 
    request: ExportRequest
  ): Promise<ExportResult> {
    const exportId = uuidv4();
    
    try {
      // Create export job record
      const exportJob = await prisma.transactionExport.create({
        data: {
          id: exportId,
          userId,
          format: request.format,
          filters: request.filters as any,
          includeAnalytics: request.includeAnalytics || false,
          emailDelivery: request.emailDelivery || false,
          status: 'PROCESSING',
        },
      });

      // Process export in background (simplified for this implementation)
      this.processExport(exportId, userId, request).catch(error => {
        console.error(`Export ${exportId} failed:`, error);
        this.updateExportStatus(exportId, 'FAILED', error.message);
      });

      return {
        exportId,
        status: 'PROCESSING',
        recordCount: 0, // Will be updated when processing completes
      };
    } catch (error: any) {
      throw new Error(`Failed to create export: ${error.message}`);
    }
  }

  /**
   * Get export status and details
   */
  async getExportStatus(exportId: string): Promise<ExportResult> {
    const exportJob = await prisma.transactionExport.findUnique({
      where: { id: exportId },
    });

    if (!exportJob) {
      throw new Error('Export not found');
    }

    return {
      exportId: exportJob.id,
      downloadUrl: exportJob.downloadUrl || undefined,
      status: exportJob.status as 'PROCESSING' | 'COMPLETED' | 'FAILED',
      fileSize: exportJob.fileSize || undefined,
      recordCount: exportJob.recordCount,
    };
  }

  /**
   * Schedule export for background processing
   */
  async scheduleExport(userId: string, request: ExportRequest): Promise<string> {
    const result = await this.exportTransactions(userId, request);
    return result.exportId;
  }

  /**
   * Email export to user with download link
   * **Validates: Requirements 4.6**
   */
  async emailExport(exportId: string, email: string): Promise<void> {
    const exportJob = await prisma.transactionExport.findUnique({
      where: { id: exportId },
    });

    if (!exportJob || exportJob.status !== 'COMPLETED') {
      throw new Error('Export not ready for delivery');
    }

    if (!exportJob.downloadUrl) {
      throw new Error('Download URL not available for export');
    }

    try {
      // Generate secure download link with expiration
      const downloadLink = await this.generateSecureDownloadLink(exportId);
      
      // Send email with download link
      await this.sendExportEmail(email, {
        exportId,
        downloadLink,
        fileName: exportJob.fileName || `export_${exportId}`,
        fileSize: exportJob.fileSize || 0,
        recordCount: exportJob.recordCount,
        format: exportJob.format,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });

      // Update export record
      await prisma.transactionExport.update({
        where: { id: exportId },
        data: { 
          emailedAt: new Date(),
          downloadExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

    } catch (error: any) {
      throw new Error(`Failed to email export: ${error.message}`);
    }
  }

  /**
   * Generate secure download link with expiration
   * **Validates: Requirements 4.6**
   */
  async generateSecureDownloadLink(exportId: string): Promise<string> {
    const exportJob = await prisma.transactionExport.findUnique({
      where: { id: exportId },
    });

    if (!exportJob || exportJob.status !== 'COMPLETED') {
      throw new Error('Export not available for download');
    }

    // Generate secure token for download
    const downloadToken = this.generateDownloadToken(exportId);
    
    // Store download token with expiration
    await prisma.transactionExport.update({
      where: { id: exportId },
      data: {
        downloadToken,
        downloadExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Return secure download URL
    return `${process.env.BASE_URL || 'http://localhost:3000'}/api/exports/${exportId}/download?token=${downloadToken}`;
  }

  /**
   * Validate download token and serve file
   * **Validates: Requirements 4.6**
   */
  async validateDownloadAndServeFile(exportId: string, token: string): Promise<{
    filePath: string;
    fileName: string;
    mimeType: string;
  }> {
    const exportJob = await prisma.transactionExport.findUnique({
      where: { id: exportId },
    });

    if (!exportJob) {
      throw new Error('Export not found');
    }

    if (exportJob.status !== 'COMPLETED') {
      throw new Error('Export not completed');
    }

    if (!exportJob.downloadToken || exportJob.downloadToken !== token) {
      throw new Error('Invalid download token');
    }

    if (!exportJob.downloadExpiresAt || exportJob.downloadExpiresAt < new Date()) {
      throw new Error('Download link has expired');
    }

    if (!exportJob.filePath || !exportJob.fileName) {
      throw new Error('Export file not available');
    }

    // Verify file exists
    try {
      await fs.access(exportJob.filePath);
    } catch {
      throw new Error('Export file no longer exists');
    }

    // Determine MIME type
    const mimeType = exportJob.format === 'CSV' ? 'text/csv' : 'application/pdf';

    return {
      filePath: exportJob.filePath,
      fileName: exportJob.fileName,
      mimeType,
    };
  }

  /**
   * Send export email with download link
   * **Validates: Requirements 4.6**
   */
  private async sendExportEmail(email: string, exportData: {
    exportId: string;
    downloadLink: string;
    fileName: string;
    fileSize: number;
    recordCount: number;
    format: string;
    expiresAt: Date;
  }): Promise<void> {
    const emailContent = this.generateExportEmailContent(exportData);
    
    // In a real implementation, this would use a proper email service like SendGrid, AWS SES, etc.
    // For now, we'll simulate the email sending
    console.log(`Sending export email to ${email}:`);
    console.log(`Subject: ${emailContent.subject}`);
    console.log(`Body: ${emailContent.body}`);
    
    // Simulate email service call
    await this.simulateEmailService(email, emailContent);
  }

  /**
   * Generate email content for export delivery
   */
  private generateExportEmailContent(exportData: {
    exportId: string;
    downloadLink: string;
    fileName: string;
    fileSize: number;
    recordCount: number;
    format: string;
    expiresAt: Date;
  }): { subject: string; body: string; html: string } {
    const subject = `Your Transaction Export is Ready - ${exportData.fileName}`;
    
    const body = `
Your transaction export has been generated and is ready for download.

Export Details:
- File Name: ${exportData.fileName}
- Format: ${exportData.format}
- Records: ${exportData.recordCount} transactions
- File Size: ${this.formatFileSize(exportData.fileSize)}
- Expires: ${exportData.expiresAt.toLocaleDateString()}

Download Link: ${exportData.downloadLink}

This link will expire in 7 days for security reasons. If you need the export after that, please generate a new one.

Best regards,
The Lemonade Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${subject}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .details { background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .download-btn { 
            display: inline-block; 
            background: #007bff; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0; 
        }
        .footer { font-size: 12px; color: #666; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Your Transaction Export is Ready</h2>
        </div>
        
        <p>Your transaction export has been generated and is ready for download.</p>
        
        <div class="details">
            <h3>Export Details</h3>
            <ul>
                <li><strong>File Name:</strong> ${exportData.fileName}</li>
                <li><strong>Format:</strong> ${exportData.format}</li>
                <li><strong>Records:</strong> ${exportData.recordCount} transactions</li>
                <li><strong>File Size:</strong> ${this.formatFileSize(exportData.fileSize)}</li>
                <li><strong>Expires:</strong> ${exportData.expiresAt.toLocaleDateString()}</li>
            </ul>
        </div>
        
        <a href="${exportData.downloadLink}" class="download-btn">Download Export</a>
        
        <p><strong>Important:</strong> This download link will expire in 7 days for security reasons. If you need the export after that, please generate a new one from your transaction history.</p>
        
        <div class="footer">
            <p>Best regards,<br>The Lemonade Team</p>
        </div>
    </div>
</body>
</html>
    `.trim();

    return { subject, body, html };
  }

  /**
   * Simulate email service (replace with real email service in production)
   */
  private async simulateEmailService(email: string, content: { subject: string; body: string; html: string }): Promise<void> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // In production, replace with actual email service:
    // await emailService.send({
    //   to: email,
    //   subject: content.subject,
    //   text: content.body,
    //   html: content.html,
    // });
    
    console.log(`Email sent successfully to ${email}`);
  }

  /**
   * Generate secure download token
   */
  private generateDownloadToken(exportId: string): string {
    // In production, use a proper cryptographic method
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    return Buffer.from(`${exportId}:${timestamp}:${random}`).toString('base64');
  }

  /**
   * Process export in background
   */
  private async processExport(
    exportId: string, 
    userId: string, 
    request: ExportRequest
  ): Promise<void> {
    try {
      // Get filtered transactions
      const filteredResult = await transactionFilterService.applyFilters(
        userId, 
        request.filters || {}
      );

      let fileContent: string;
      let fileName: string;
      let mimeType: string;

      if (request.format === 'CSV') {
        fileContent = await this.generateCSV(filteredResult.transactions, request);
        fileName = `transactions_${exportId}.csv`;
        mimeType = 'text/csv';
      } else if (request.format === 'PDF') {
        fileContent = await this.generatePDF(filteredResult.transactions, request);
        fileName = `transactions_${exportId}.pdf`;
        mimeType = 'application/pdf';
      } else {
        throw new Error(`Unsupported export format: ${request.format}`);
      }

      // Save file
      const filePath = path.join(this.exportDir, fileName);
      await fs.writeFile(filePath, fileContent);

      // Get file size
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;

      // Generate download URL (in production, this would be a signed URL)
      const downloadUrl = `/api/exports/${exportId}/download`;

      // Update export status
      await prisma.transactionExport.update({
        where: { id: exportId },
        data: {
          status: 'COMPLETED',
          fileName,
          filePath,
          downloadUrl,
          fileSize,
          recordCount: filteredResult.transactions.length,
          completedAt: new Date(),
        },
      });

    } catch (error: any) {
      await this.updateExportStatus(exportId, 'FAILED', error.message);
      throw error;
    }
  }

  /**
   * Generate CSV export
   */
  private async generateCSV(
    transactions: EnhancedTransaction[], 
    request: ExportRequest
  ): Promise<string> {
    const headers = [
      'Date',
      'Reference',
      'Type',
      'Status',
      'Amount',
      'Fee',
      'Description',
      'From',
      'To',
      'Category',
      'Tags',
      'Notes',
    ];

    let csvContent = headers.join(',') + '\n';

    transactions.forEach(transaction => {
      const row = [
        this.formatDate(transaction.createdAt),
        this.escapeCsvField(transaction.reference),
        transaction.type,
        transaction.status,
        transaction.amount.toString(),
        transaction.fee.toString(),
        this.escapeCsvField(transaction.description || ''),
        this.escapeCsvField(transaction.fromUser?.name || ''),
        this.escapeCsvField(transaction.toUser?.name || ''),
        this.escapeCsvField(transaction.category?.name || ''),
        this.escapeCsvField(transaction.tags.join('; ')),
        this.escapeCsvField(transaction.notes || ''),
      ];

      csvContent += row.join(',') + '\n';
    });

    // Add analytics if requested
    if (request.includeAnalytics && transactions.length > 0) {
      csvContent += '\n\n--- ANALYTICS ---\n';
      
      const startDate = new Date(Math.min(...transactions.map(t => t.createdAt.getTime())));
      const endDate = new Date(Math.max(...transactions.map(t => t.createdAt.getTime())));
      
      // Get analytics data
      const analytics = await transactionAnalyticsService.getTransactionInsights(
        transactions[0].fromUserId || transactions[0].toUserId || '',
        startDate,
        endDate
      );

      csvContent += `Total Spending,${analytics.totalSpending}\n`;
      csvContent += `Total Received,${analytics.totalReceived}\n`;
      csvContent += `Net Flow,${analytics.netFlow}\n`;
      csvContent += `Average Transaction,${analytics.averageTransaction}\n`;
      csvContent += `Transaction Count,${transactions.length}\n`;
      csvContent += `Most Active Day,${analytics.mostActiveDay}\n`;
      csvContent += `Spending Velocity,${analytics.spendingVelocity}\n`;
    }

    return csvContent;
  }

  /**
   * Generate PDF export (simplified implementation)
   */
  private async generatePDF(
    transactions: EnhancedTransaction[], 
    request: ExportRequest
  ): Promise<string> {
    // This is a simplified PDF generation
    // In production, you would use a library like puppeteer, jsPDF, or PDFKit
    
    let pdfContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Transaction Export</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { background: #f5f5f5; padding: 15px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .amount { text-align: right; }
        .analytics { margin-top: 30px; }
        .analytics h3 { color: #333; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Transaction History Export</h1>
        <p>Generated on ${this.formatDate(new Date())}</p>
    </div>

    <div class="summary">
        <h3>Export Summary</h3>
        <p><strong>Total Transactions:</strong> ${transactions.length}</p>
        <p><strong>Export Format:</strong> PDF</p>
        <p><strong>Date Range:</strong> ${this.getDateRange(transactions)}</p>
    </div>

    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Type</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Description</th>
                <th>From/To</th>
                <th>Category</th>
            </tr>
        </thead>
        <tbody>
`;

    transactions.forEach(transaction => {
      const fromTo = transaction.fromUser?.name || transaction.toUser?.name || '';
      pdfContent += `
            <tr>
                <td>${this.formatDate(transaction.createdAt)}</td>
                <td>${this.escapeHtml(transaction.reference)}</td>
                <td>${transaction.type}</td>
                <td>${transaction.status}</td>
                <td class="amount">${this.formatCurrency(transaction.amount)}</td>
                <td>${this.escapeHtml(transaction.description || '')}</td>
                <td>${this.escapeHtml(fromTo)}</td>
                <td>${this.escapeHtml(transaction.category?.name || '')}</td>
            </tr>
`;
    });

    pdfContent += `
        </tbody>
    </table>
`;

    // Add analytics if requested
    if (request.includeAnalytics && transactions.length > 0) {
      const startDate = new Date(Math.min(...transactions.map(t => t.createdAt.getTime())));
      const endDate = new Date(Math.max(...transactions.map(t => t.createdAt.getTime())));
      
      const analytics = await transactionAnalyticsService.getTransactionInsights(
        transactions[0].fromUserId || transactions[0].toUserId || '',
        startDate,
        endDate
      );

      pdfContent += `
    <div class="analytics">
        <h3>Analytics Summary</h3>
        <table>
            <tr><td><strong>Total Spending</strong></td><td class="amount">${this.formatCurrency(analytics.totalSpending)}</td></tr>
            <tr><td><strong>Total Received</strong></td><td class="amount">${this.formatCurrency(analytics.totalReceived)}</td></tr>
            <tr><td><strong>Net Flow</strong></td><td class="amount">${this.formatCurrency(analytics.netFlow)}</td></tr>
            <tr><td><strong>Average Transaction</strong></td><td class="amount">${this.formatCurrency(analytics.averageTransaction)}</td></tr>
            <tr><td><strong>Most Active Day</strong></td><td>${analytics.mostActiveDay}</td></tr>
            <tr><td><strong>Spending Velocity</strong></td><td>${analytics.spendingVelocity.toFixed(2)} transactions/day</td></tr>
        </table>
    </div>
`;
    }

    pdfContent += `
</body>
</html>
`;

    return pdfContent;
  }

  /**
   * Clean up old export files
   */
  async cleanupOldExports(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const oldExports = await prisma.transactionExport.findMany({
      where: {
        createdAt: { lt: cutoffDate },
        status: 'COMPLETED',
      },
    });

    let cleanedCount = 0;

    for (const exportJob of oldExports) {
      try {
        // Delete file if it exists
        if (exportJob.filePath) {
          await fs.unlink(exportJob.filePath);
        }

        // Delete database record
        await prisma.transactionExport.delete({
          where: { id: exportJob.id },
        });

        cleanedCount++;
      } catch (error) {
        console.error(`Failed to cleanup export ${exportJob.id}:`, error);
      }
    }

    return cleanedCount;
  }

  /**
   * Get user's export history
   */
  async getUserExports(userId: string, limit: number = 10) {
    return await prisma.transactionExport.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        format: true,
        status: true,
        recordCount: true,
        fileSize: true,
        downloadUrl: true,
        createdAt: true,
        completedAt: true,
      },
    });
  }

  /**
   * Cancel a pending export
   */
  async cancelExport(exportId: string, userId: string): Promise<void> {
    const exportJob = await prisma.transactionExport.findFirst({
      where: { id: exportId, userId },
    });

    if (!exportJob) {
      throw new Error('Export not found');
    }

    if (exportJob.status !== 'PROCESSING') {
      throw new Error('Export cannot be cancelled');
    }

    await prisma.transactionExport.update({
      where: { id: exportId },
      data: { 
        status: 'FAILED',
        errorMessage: 'Cancelled by user',
      },
    });
  }

  /**
   * Ensure export directory exists
   */
  private async ensureExportDirectory(): Promise<void> {
    try {
      await fs.access(this.exportDir);
    } catch {
      await fs.mkdir(this.exportDir, { recursive: true });
    }
  }

  /**
   * Update export status
   */
  private async updateExportStatus(
    exportId: string, 
    status: 'PROCESSING' | 'COMPLETED' | 'FAILED',
    errorMessage?: string
  ): Promise<void> {
    await prisma.transactionExport.update({
      where: { id: exportId },
      data: {
        status,
        errorMessage,
        completedAt: status === 'COMPLETED' ? new Date() : undefined,
      },
    });
  }

  /**
   * Escape CSV field
   */
  private escapeCsvField(field: string): string {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  /**
   * Escape HTML
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Format currency
   */
  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
    }).format(amount);
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get date range from transactions
   */
  private getDateRange(transactions: EnhancedTransaction[]): string {
    if (transactions.length === 0) return 'No transactions';
    
    const dates = transactions.map(t => t.createdAt);
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    
    return `${this.formatDate(minDate)} to ${this.formatDate(maxDate)}`;
  }
}

export const transactionExportService = new TransactionExportService();