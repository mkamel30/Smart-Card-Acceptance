-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "settlementDate" DATETIME NOT NULL,
    "bankName" TEXT NOT NULL,
    "cardType" TEXT NOT NULL,
    "serviceCategory" TEXT NOT NULL DEFAULT 'SMART',
    "subService" TEXT,
    "merchantCode" TEXT NOT NULL,
    "batchNumber" TEXT,
    "approvalNumber" TEXT,
    "last4Digits" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "totalAmount" DECIMAL NOT NULL,
    "settledAmount" DECIMAL NOT NULL,
    "fees" DECIMAL NOT NULL,
    "netAmount" DECIMAL NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "receiptImageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailSentAt" DATETIME,
    "emailRecipients" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "settlementId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extractedText" TEXT,
    "merchantName" TEXT,
    "merchantId" TEXT,
    "transactionId" TEXT,
    "transactionDate" DATETIME,
    "processedAt" DATETIME,
    "processingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    CONSTRAINT "Receipt_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "toEmails" TEXT NOT NULL,
    "ccEmails" TEXT,
    "bccEmails" TEXT,
    "subject" TEXT NOT NULL DEFAULT 'Card Settlement Report',
    "bodyTemplate" TEXT NOT NULL,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL,
    "smtpUser" TEXT NOT NULL,
    "smtpPassword" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "autoSendOnApprove" BOOLEAN NOT NULL DEFAULT false,
    "includeReceiptPDF" BOOLEAN NOT NULL DEFAULT true,
    "includeExcel" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValues" TEXT,
    "newValues" TEXT,
    "performedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_referenceNumber_key" ON "Settlement"("referenceNumber");

-- CreateIndex
CREATE INDEX "Settlement_settlementDate_idx" ON "Settlement"("settlementDate");

-- CreateIndex
CREATE INDEX "Settlement_status_idx" ON "Settlement"("status");

-- CreateIndex
CREATE INDEX "Settlement_bankName_idx" ON "Settlement"("bankName");

-- CreateIndex
CREATE INDEX "Settlement_serviceCategory_idx" ON "Settlement"("serviceCategory");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_settlementId_key" ON "Receipt"("settlementId");

-- CreateIndex
CREATE INDEX "Receipt_settlementId_idx" ON "Receipt"("settlementId");

-- CreateIndex
CREATE INDEX "AuditLog_entityId_idx" ON "AuditLog"("entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
