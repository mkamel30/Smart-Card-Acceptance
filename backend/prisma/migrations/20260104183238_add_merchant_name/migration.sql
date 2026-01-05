-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "settlementDate" DATETIME NOT NULL,
    "bankName" TEXT,
    "cardType" TEXT,
    "serviceCategory" TEXT NOT NULL DEFAULT 'SMART',
    "subService" TEXT,
    "merchantCode" TEXT NOT NULL,
    "merchantName" TEXT,
    "batchNumber" TEXT,
    "approvalNumber" TEXT,
    "last4Digits" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "totalAmount" DECIMAL NOT NULL,
    "settledAmount" DECIMAL NOT NULL,
    "fees" DECIMAL NOT NULL,
    "netAmount" DECIMAL NOT NULL,
    "referenceNumber" TEXT,
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
INSERT INTO "new_Settlement" ("approvalNumber", "bankName", "batchNumber", "cardType", "createdAt", "createdBy", "customerName", "customerPhone", "emailRecipients", "emailSent", "emailSentAt", "fees", "id", "invoiceNumber", "last4Digits", "merchantCode", "netAmount", "notes", "receiptImageUrl", "referenceNumber", "serviceCategory", "settledAmount", "settlementDate", "status", "subService", "totalAmount", "updatedAt") SELECT "approvalNumber", "bankName", "batchNumber", "cardType", "createdAt", "createdBy", "customerName", "customerPhone", "emailRecipients", "emailSent", "emailSentAt", "fees", "id", "invoiceNumber", "last4Digits", "merchantCode", "netAmount", "notes", "receiptImageUrl", "referenceNumber", "serviceCategory", "settledAmount", "settlementDate", "status", "subService", "totalAmount", "updatedAt" FROM "Settlement";
DROP TABLE "Settlement";
ALTER TABLE "new_Settlement" RENAME TO "Settlement";
CREATE INDEX "Settlement_settlementDate_idx" ON "Settlement"("settlementDate");
CREATE INDEX "Settlement_status_idx" ON "Settlement"("status");
CREATE INDEX "Settlement_bankName_idx" ON "Settlement"("bankName");
CREATE INDEX "Settlement_serviceCategory_idx" ON "Settlement"("serviceCategory");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
