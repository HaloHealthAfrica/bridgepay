import PDFDocument from 'pdfkit';
import AWS from 'aws-sdk';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

// AWS S3 Configuration
const hasS3 = !!(
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.AWS_S3_BUCKET &&
  process.env.AWS_REGION
);

const s3 = hasS3 ? new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  region: process.env.AWS_REGION!,
}) : null;

// Email Configuration
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface ReceiptGenerationRequest {
  transactionId: string;
  userId: string;
  format?: 'PDF' | 'HTML';
  includeQRCode?: boolean;
  includeLogo?: boolean;
  customMessage?: string;
}

interface BulkReceiptRequest {
  transactionIds: string[];
  userId: string;
  format?: 'PDF' | 'HTML';
  includeQRCode?: boolean;
  includeLogo?: boolean;
  emailDelivery?: boolean;
}

interface ReceiptSharingOptions {
  transactionId: string;
  userId: string;
  method: 'EMAIL' | 'LINK' | 'SMS';
  recipient: string;
  message?: string;
  expiresIn?: number; // hours
}

interface ReceiptStatus {
  receiptId: string;
  transactionId: string;
  status: 'GENERATING' | 'COMPLETED' | 'FAILED';
  format: string;
  downloadUrl?: string;
  createdAt: Date;
  expiresAt?: Date;
  error?: string;
}

interface BulkReceiptResult {
  batchId: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalReceipts: number;
  successCount: number;
  failureCount: number;
  downloadUrl?: string;
}

interface SharingResult {
  shareId: string;
  method: string;
  recipient: string;
  shareUrl?: string;
  expiresAt: Date;
}

class TransactionReceiptService {
  /**
   * Generate receipt for a single transaction
   */
  async generateReceiptForTransaction(request: ReceiptGenerationRequest) {
    try {
      // Get transaction with related data
      const transaction = await prisma.transaction.findUnique({
        where: { id: request.transactionId },
        include: {
          fromUser: { select: { id: true, name: true, email: true, phone: true } },
          toUser: { select: { id: true, name: true, email: true, phone: true } },
          category: true,
        },
      });

      if (!transaction) {
        throw new AppError('Transaction not found', 404);
      }

      // Check if receipt already exists
      let receipt = await prisma.receipt.findFirst({
        where: { transactionId: request.transactionId },
      });

      if (!receipt) {
        // Create new receipt record
        receipt = await prisma.receipt.create({
          data: {
            id: uuidv4(),
            transactionId: request.transactionId,
            format: request.format || 'PDF',
            status: 'GENERATING',
            includeQRCode: request.includeQRCode ?? true,
            includeLogo: request.includeLogo ?? true,
            customMessage: request.customMessage || null,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          },
        });
      }

      // Generate the receipt file
      let downloadUrl: string;
      
      if (request.format === 'HTML') {
        downloadUrl = await this.generateHTMLReceipt(transaction, receipt, request);
      } else {
        downloadUrl = await this.generatePDFReceipt(transaction, receipt, request);
      }

      // Update receipt status
      await prisma.receipt.update({
        where: { id: receipt.id },
        data: {
          status: 'COMPLETED',
          downloadUrl,
          updatedAt: new Date(),
        },
      });

      return {
        receiptId: receipt.id,
        status: 'COMPLETED',
        downloadUrl,
      };
    } catch (error) {
      console.error('Receipt generation error:', error);
      throw new AppError('Failed to generate receipt', 500);
    }
  }

  /**
   * Get receipt status for a transaction
   */
  async getReceiptStatus(transactionId: string): Promise<ReceiptStatus> {
    const receipt = await prisma.receipt.findFirst({
      where: { transactionId },
      orderBy: { createdAt: 'desc' },
    });

    if (!receipt) {
      throw new AppError('Receipt not found', 404);
    }

    return {
      receiptId: receipt.id,
      transactionId: receipt.transactionId,
      status: receipt.status as 'GENERATING' | 'COMPLETED' | 'FAILED',
      format: receipt.format,
      downloadUrl: receipt.downloadUrl || undefined,
      createdAt: receipt.createdAt,
      expiresAt: receipt.expiresAt || undefined,
      error: receipt.error || undefined,
    };
  }

  /**
   * Generate bulk receipts for multiple transactions
   */
  async generateBulkReceipts(request: BulkReceiptRequest): Promise<BulkReceiptResult> {
    try {
      const batchId = uuidv4();
      
      // Create batch record
      await prisma.receiptBatch.create({
        data: {
          id: batchId,
          userId: request.userId,
          status: 'PROCESSING',
          totalReceipts: request.transactionIds.length,
          successCount: 0,
          failureCount: 0,
          format: request.format || 'PDF',
          emailDelivery: request.emailDelivery || false,
          createdAt: new Date(),
        },
      });

      // Process receipts in background (simulate async processing)
      this.processBulkReceipts(batchId, request).catch(console.error);

      return {
        batchId,
        status: 'PROCESSING',
        totalReceipts: request.transactionIds.length,
        successCount: 0,
        failureCount: 0,
      };
    } catch (error) {
      console.error('Bulk receipt generation error:', error);
      throw new AppError('Failed to initiate bulk receipt generation', 500);
    }
  }

  /**
   * Get receipt sharing options for a transaction
   */
  async getReceiptSharingOptions(transactionId: string) {
    const receipt = await prisma.receipt.findFirst({
      where: { transactionId },
      orderBy: { createdAt: 'desc' },
    });

    if (!receipt) {
      throw new AppError('Receipt not found', 404);
    }

    return {
      receiptId: receipt.id,
      availableMethods: ['EMAIL', 'LINK', 'SMS'],
      currentShares: await this.getActiveShares(receipt.id),
      maxSharesPerMethod: {
        EMAIL: 10,
        LINK: 5,
        SMS: 3,
      },
      defaultExpiration: 24, // hours
      maxExpiration: 168, // 7 days
    };
  }

  /**
   * Share receipt via specified method
   */
  async shareReceipt(options: ReceiptSharingOptions): Promise<SharingResult> {
    try {
      const receipt = await prisma.receipt.findFirst({
        where: { transactionId: options.transactionId },
        orderBy: { createdAt: 'desc' },
      });

      if (!receipt || receipt.status !== 'COMPLETED') {
        throw new AppError('Receipt not found or not ready for sharing', 404);
      }

      const shareId = uuidv4();
      const expiresAt = new Date(Date.now() + (options.expiresIn || 24) * 60 * 60 * 1000);

      // Create share record
      const share = await prisma.receiptShare.create({
        data: {
          id: shareId,
          receiptId: receipt.id,
          method: options.method,
          recipient: options.recipient,
          message: options.message || null,
          expiresAt,
          createdAt: new Date(),
        },
      });

      let shareUrl: string | undefined;

      // Handle different sharing methods
      switch (options.method) {
        case 'EMAIL':
          await this.sendReceiptByEmail(receipt, options.recipient, options.message);
          break;
        
        case 'LINK':
          shareUrl = `${process.env.FRONTEND_URL}/receipts/shared/${shareId}`;
          break;
        
        case 'SMS':
          shareUrl = `${process.env.FRONTEND_URL}/receipts/shared/${shareId}`;
          await this.sendReceiptBySMS(options.recipient, shareUrl, options.message);
          break;
      }

      return {
        shareId,
        method: options.method,
        recipient: options.recipient,
        shareUrl,
        expiresAt,
      };
    } catch (error) {
      console.error('Receipt sharing error:', error);
      throw new AppError('Failed to share receipt', 500);
    }
  }

  /**
   * Generate PDF receipt
   */
  private async generatePDFReceipt(transaction: any, receipt: any, request: ReceiptGenerationRequest): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('error', reject);
        doc.on('end', async () => {
          try {
            const pdfBuffer = Buffer.concat(chunks);
            const key = `receipts/${receipt.id}.pdf`;

            if (s3) {
              await s3.putObject({
                Bucket: process.env.AWS_S3_BUCKET!,
                Key: key,
                Body: pdfBuffer,
                ContentType: 'application/pdf',
              }).promise();

              const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
              resolve(url);
            } else {
              // Fallback: save locally (for development)
              const fs = require('fs');
              const path = require('path');
              const uploadsDir = path.join(process.cwd(), 'uploads', 'receipts');
              
              if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
              }
              
              const filePath = path.join(uploadsDir, `${receipt.id}.pdf`);
              fs.writeFileSync(filePath, pdfBuffer);
              
              resolve(`/uploads/receipts/${receipt.id}.pdf`);
            }
          } catch (error) {
            reject(error);
          }
        });

        // Generate PDF content
        await this.buildPDFContent(doc, transaction, receipt, request);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate HTML receipt
   */
  private async generateHTMLReceipt(transaction: any, receipt: any, request: ReceiptGenerationRequest): Promise<string> {
    const html = await this.buildHTMLContent(transaction, receipt, request);
    
    const key = `receipts/${receipt.id}.html`;
    
    if (s3) {
      await s3.putObject({
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: key,
        Body: html,
        ContentType: 'text/html',
      }).promise();

      return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    } else {
      // Fallback: save locally
      const fs = require('fs');
      const path = require('path');
      const uploadsDir = path.join(process.cwd(), 'uploads', 'receipts');
      
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      const filePath = path.join(uploadsDir, `${receipt.id}.html`);
      fs.writeFileSync(filePath, html);
      
      return `/uploads/receipts/${receipt.id}.html`;
    }
  }

  /**
   * Build PDF content
   */
  private async buildPDFContent(doc: PDFKit.PDFDocument, transaction: any, receipt: any, request: ReceiptGenerationRequest) {
    // Header
    if (request.includeLogo) {
      doc.fontSize(24).text('BRIDGE', { align: 'center' });
    }
    doc.fontSize(16).text('Transaction Receipt', { align: 'center' });
    doc.moveDown();

    // QR Code
    if (request.includeQRCode) {
      try {
        const qrData = JSON.stringify({
          transactionId: transaction.id,
          reference: transaction.reference,
          amount: transaction.amount,
          date: transaction.createdAt,
        });
        const qrCodeDataURL = await QRCode.toDataURL(qrData);
        const qrBuffer = Buffer.from(qrCodeDataURL.split(',')[1] || '', 'base64');
        doc.image(qrBuffer, doc.page.width - 150, 50, { width: 100 });
      } catch (error) {
        console.error('QR Code generation error:', error);
      }
    }

    // Transaction details
    doc.fontSize(12);
    doc.text(`Receipt ID: ${receipt.id}`, 50, 150);
    doc.text(`Transaction Reference: ${transaction.reference}`);
    doc.text(`Date: ${transaction.createdAt.toLocaleString()}`);
    doc.text(`Type: ${transaction.type}`);
    doc.text(`Status: ${transaction.status}`);
    doc.moveDown();

    // Parties
    if (transaction.fromUser) {
      doc.text('From:', { underline: true });
      doc.text(`  ${transaction.fromUser.name}`);
      doc.text(`  ${transaction.fromUser.phone}`);
      doc.moveDown();
    }

    if (transaction.toUser) {
      doc.text('To:', { underline: true });
      doc.text(`  ${transaction.toUser.name}`);
      doc.text(`  ${transaction.toUser.phone}`);
      doc.moveDown();
    }

    // Amount details
    doc.fontSize(14);
    doc.text(`Amount: KES ${Number(transaction.amount).toLocaleString()}`);
    if (Number(transaction.fee) > 0) {
      doc.text(`Fee: KES ${Number(transaction.fee).toLocaleString()}`);
      doc.text(`Total: KES ${(Number(transaction.amount) + Number(transaction.fee)).toLocaleString()}`);
    }

    // Custom message
    if (request.customMessage) {
      doc.moveDown();
      doc.fontSize(10);
      doc.text(request.customMessage, { align: 'center' });
    }

    // Footer
    doc.moveDown();
    doc.fontSize(8);
    doc.text('Thank you for using Bridge', { align: 'center' });
    doc.text(`Generated on ${new Date().toLocaleString()}`, { align: 'center' });
  }

  /**
   * Build HTML content
   */
  private async buildHTMLContent(transaction: any, receipt: any, request: ReceiptGenerationRequest): Promise<string> {
    let qrCodeHTML = '';
    
    if (request.includeQRCode) {
      try {
        const qrData = JSON.stringify({
          transactionId: transaction.id,
          reference: transaction.reference,
          amount: transaction.amount,
          date: transaction.createdAt,
        });
        const qrCodeDataURL = await QRCode.toDataURL(qrData);
        qrCodeHTML = `<img src="${qrCodeDataURL}" alt="QR Code" style="width: 100px; height: 100px; float: right;">`;
      } catch (error) {
        console.error('QR Code generation error:', error);
      }
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Transaction Receipt</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
          .title { font-size: 18px; margin-top: 10px; }
          .qr-code { float: right; margin-left: 20px; }
          .details { margin: 20px 0; }
          .detail-row { margin: 5px 0; }
          .label { font-weight: bold; }
          .amount { font-size: 18px; font-weight: bold; color: #059669; }
          .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #6b7280; }
          .custom-message { text-align: center; margin: 20px 0; font-style: italic; }
        </style>
      </head>
      <body>
        <div class="header">
          ${request.includeLogo ? '<div class="logo">BRIDGE</div>' : ''}
          <div class="title">Transaction Receipt</div>
          ${qrCodeHTML}
        </div>
        
        <div class="details">
          <div class="detail-row"><span class="label">Receipt ID:</span> ${receipt.id}</div>
          <div class="detail-row"><span class="label">Transaction Reference:</span> ${transaction.reference}</div>
          <div class="detail-row"><span class="label">Date:</span> ${transaction.createdAt.toLocaleString()}</div>
          <div class="detail-row"><span class="label">Type:</span> ${transaction.type}</div>
          <div class="detail-row"><span class="label">Status:</span> ${transaction.status}</div>
        </div>

        ${transaction.fromUser ? `
          <div class="details">
            <div class="label">From:</div>
            <div style="margin-left: 20px;">
              <div>${transaction.fromUser.name}</div>
              <div>${transaction.fromUser.phone}</div>
            </div>
          </div>
        ` : ''}

        ${transaction.toUser ? `
          <div class="details">
            <div class="label">To:</div>
            <div style="margin-left: 20px;">
              <div>${transaction.toUser.name}</div>
              <div>${transaction.toUser.phone}</div>
            </div>
          </div>
        ` : ''}

        <div class="details">
          <div class="amount">Amount: KES ${Number(transaction.amount).toLocaleString()}</div>
          ${Number(transaction.fee) > 0 ? `
            <div>Fee: KES ${Number(transaction.fee).toLocaleString()}</div>
            <div class="amount">Total: KES ${(Number(transaction.amount) + Number(transaction.fee)).toLocaleString()}</div>
          ` : ''}
        </div>

        ${request.customMessage ? `
          <div class="custom-message">${request.customMessage}</div>
        ` : ''}

        <div class="footer">
          <div>Thank you for using Bridge</div>
          <div>Generated on ${new Date().toLocaleString()}</div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Process bulk receipts in background
   */
  private async processBulkReceipts(batchId: string, request: BulkReceiptRequest) {
    let successCount = 0;
    let failureCount = 0;

    for (const transactionId of request.transactionIds) {
      try {
        await this.generateReceiptForTransaction({
          transactionId,
          userId: request.userId,
          format: request.format || 'PDF',
          includeQRCode: request.includeQRCode ?? true,
          includeLogo: request.includeLogo ?? true,
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to generate receipt for transaction ${transactionId}:`, error);
        failureCount++;
      }
    }

    // Update batch status
    await prisma.receiptBatch.update({
      where: { id: batchId },
      data: {
        status: failureCount === 0 ? 'COMPLETED' : 'FAILED',
        successCount,
        failureCount,
        updatedAt: new Date(),
      },
    });

    // Send email if requested
    if (request.emailDelivery) {
      // Implementation for email delivery would go here
    }
  }

  /**
   * Get active shares for a receipt
   */
  private async getActiveShares(receiptId: string) {
    return await prisma.receiptShare.findMany({
      where: {
        receiptId,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        method: true,
        recipient: true,
        createdAt: true,
        expiresAt: true,
      },
    });
  }

  /**
   * Send receipt by email
   */
  private async sendReceiptByEmail(receipt: any, email: string, message?: string) {
    try {
      await emailTransporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@bridge.com',
        to: email,
        subject: 'Transaction Receipt',
        html: `
          <h2>Transaction Receipt</h2>
          <p>Please find your transaction receipt attached.</p>
          ${message ? `<p><strong>Message:</strong> ${message}</p>` : ''}
          <p>Receipt ID: ${receipt.id}</p>
          <p><a href="${receipt.downloadUrl}">Download Receipt</a></p>
        `,
      });
    } catch (error) {
      console.error('Email sending error:', error);
      throw new AppError('Failed to send receipt by email', 500);
    }
  }

  /**
   * Send receipt by SMS
   */
  private async sendReceiptBySMS(phone: string, shareUrl: string, message?: string) {
    // SMS implementation would go here
    // For now, just log the action
    console.log(`SMS would be sent to ${phone} with URL: ${shareUrl}`);
    if (message) {
      console.log(`Message: ${message}`);
    }
  }
}

export const transactionReceiptService = new TransactionReceiptService();