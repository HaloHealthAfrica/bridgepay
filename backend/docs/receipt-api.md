# Receipt API Endpoints - Task 11.3

This document describes the receipt API endpoints implemented for Task 11.3, validating requirements 8.1-8.6 (Receipt integration).

## Overview

The receipt API provides comprehensive functionality for generating, managing, and sharing transaction receipts. All endpoints require authentication and follow the existing controller patterns for error handling and response formatting.

## Endpoints

### 1. Generate Receipt for Transaction

**POST** `/api/transactions/:id/receipt`

Generates a receipt for a specific transaction.

#### Request Parameters
- `id` (path): Transaction ID (UUID)

#### Request Body
```json
{
  "format": "PDF" | "HTML",           // Optional, default: "PDF"
  "includeQRCode": boolean,           // Optional, default: true
  "includeLogo": boolean,             // Optional, default: true
  "customMessage": "string"           // Optional, max 500 characters
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "receiptId": "uuid",
    "status": "COMPLETED",
    "downloadUrl": "https://...",
    "message": "Receipt generated successfully"
  }
}
```

#### Error Responses
- `400`: Invalid receipt generation parameters
- `404`: Transaction not found
- `500`: Failed to generate receipt

---

### 2. Get Receipt Status

**GET** `/api/transactions/:id/receipt/status`

Retrieves the status of a receipt for a transaction.

#### Request Parameters
- `id` (path): Transaction ID (UUID)

#### Response
```json
{
  "success": true,
  "data": {
    "receiptId": "uuid",
    "transactionId": "uuid",
    "status": "GENERATING" | "COMPLETED" | "FAILED",
    "format": "PDF" | "HTML",
    "downloadUrl": "https://...",      // Only if status is COMPLETED
    "createdAt": "2024-01-01T00:00:00Z",
    "expiresAt": "2024-01-31T00:00:00Z",
    "error": "string"                  // Only if status is FAILED
  }
}
```

#### Error Responses
- `404`: Transaction not found or receipt not found

---

### 3. Generate Bulk Receipts

**POST** `/api/transactions/receipts/bulk`

Generates receipts for multiple transactions in a batch.

#### Request Body
```json
{
  "transactionIds": ["uuid1", "uuid2"],  // Required, 1-100 items
  "format": "PDF" | "HTML",              // Optional, default: "PDF"
  "includeQRCode": boolean,              // Optional, default: true
  "includeLogo": boolean,                // Optional, default: true
  "emailDelivery": boolean               // Optional, default: false
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "batchId": "uuid",
    "status": "PROCESSING",
    "totalReceipts": 2,
    "successCount": 0,
    "failureCount": 0,
    "downloadUrl": "https://...",        // Available when completed
    "message": "Bulk receipt generation initiated successfully"
  }
}
```

#### Error Responses
- `400`: Invalid bulk receipt parameters
- `403`: Some transactions not found or access denied
- `500`: Failed to initiate bulk receipt generation

---

### 4. Get Receipt Sharing Options

**GET** `/api/transactions/:id/receipt/sharing`

Retrieves available sharing options for a transaction receipt.

#### Request Parameters
- `id` (path): Transaction ID (UUID)

#### Response
```json
{
  "success": true,
  "data": {
    "receiptId": "uuid",
    "availableMethods": ["EMAIL", "LINK", "SMS"],
    "currentShares": [
      {
        "id": "uuid",
        "method": "EMAIL",
        "recipient": "user@example.com",
        "createdAt": "2024-01-01T00:00:00Z",
        "expiresAt": "2024-01-02T00:00:00Z"
      }
    ],
    "maxSharesPerMethod": {
      "EMAIL": 10,
      "LINK": 5,
      "SMS": 3
    },
    "defaultExpiration": 24,             // hours
    "maxExpiration": 168                 // hours (7 days)
  }
}
```

#### Error Responses
- `404`: Transaction not found or receipt not found

---

### 5. Share Receipt

**POST** `/api/transactions/:id/receipt/share`

Shares a receipt via email, link, or SMS.

#### Request Parameters
- `id` (path): Transaction ID (UUID)

#### Request Body
```json
{
  "method": "EMAIL" | "LINK" | "SMS",   // Required
  "recipient": "string",                // Required, email/phone/etc
  "message": "string",                  // Optional, max 500 characters
  "expiresIn": number                   // Optional, hours (1-168), default: 24
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "shareId": "uuid",
    "method": "EMAIL",
    "recipient": "user@example.com",
    "shareUrl": "https://...",           // For LINK and SMS methods
    "expiresAt": "2024-01-02T00:00:00Z",
    "message": "Receipt shared successfully via email"
  }
}
```

#### Error Responses
- `400`: Invalid receipt sharing parameters
- `404`: Transaction not found or receipt not found
- `500`: Failed to share receipt

## Service Integration

The endpoints use the `transactionReceiptService` which provides the following methods:

- `generateReceiptForTransaction(request)`: Generates a receipt for a single transaction
- `getReceiptStatus(transactionId)`: Gets the current status of a receipt
- `generateBulkReceipts(request)`: Initiates bulk receipt generation
- `getReceiptSharingOptions(transactionId)`: Gets available sharing options
- `shareReceipt(options)`: Shares a receipt via specified method

## Database Schema

The implementation adds the following tables to support receipt functionality:

### Receipt
- Stores individual receipt records
- Links to transactions
- Tracks generation status and metadata

### ReceiptBatch
- Manages bulk receipt generation jobs
- Tracks progress and results

### ReceiptShare
- Records receipt sharing activities
- Manages expiration and access control

## Security Considerations

1. **Authentication**: All endpoints require valid JWT authentication
2. **Authorization**: Users can only access receipts for their own transactions
3. **Rate Limiting**: All endpoints are protected by rate limiting
4. **Expiration**: Receipts and shares have configurable expiration times
5. **Access Control**: Shared receipts use secure tokens for access

## File Storage

Receipts are stored using:
- **AWS S3**: For production environments (when configured)
- **Local Storage**: For development environments (fallback)

## Email Integration

Email sharing uses:
- **SMTP Configuration**: Via environment variables
- **Template System**: HTML email templates for receipt delivery
- **Error Handling**: Graceful fallback for email delivery failures

## Requirements Validation

This implementation validates the following requirements:

- **8.1**: Receipt generation for individual transactions ✓
- **8.2**: Bulk receipt generation capabilities ✓
- **8.3**: Multiple receipt formats (PDF, HTML) ✓
- **8.4**: Receipt status tracking and monitoring ✓
- **8.5**: Receipt sharing via multiple methods ✓
- **8.6**: Secure receipt access and expiration ✓

## Usage Examples

### Generate a PDF receipt with QR code
```bash
curl -X POST /api/transactions/123/receipt \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"format": "PDF", "includeQRCode": true}'
```

### Share receipt via email
```bash
curl -X POST /api/transactions/123/receipt/share \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "EMAIL",
    "recipient": "user@example.com",
    "message": "Your transaction receipt"
  }'
```

### Generate bulk receipts
```bash
curl -X POST /api/transactions/receipts/bulk \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionIds": ["123", "456"],
    "format": "PDF",
    "emailDelivery": true
  }'
```