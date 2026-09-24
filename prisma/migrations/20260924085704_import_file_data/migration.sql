-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Import" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "profileId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "fileData" BLOB,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "mapping" TEXT NOT NULL,
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsNew" INTEGER NOT NULL DEFAULT 0,
    "rowsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "rowsFlagged" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "statementBalance" INTEGER,
    "statementBalanceDate" DATETIME,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" DATETIME,
    "revertedAt" DATETIME,
    CONSTRAINT "Import_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Import_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Import_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ImportProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Import" ("accountId", "committedAt", "createdAt", "errorMessage", "fileHash", "fileName", "fileType", "id", "mapping", "periodEnd", "periodStart", "profileId", "revertedAt", "rowsDuplicate", "rowsFlagged", "rowsNew", "rowsSkipped", "rowsTotal", "statementBalance", "statementBalanceDate", "status", "userId") SELECT "accountId", "committedAt", "createdAt", "errorMessage", "fileHash", "fileName", "fileType", "id", "mapping", "periodEnd", "periodStart", "profileId", "revertedAt", "rowsDuplicate", "rowsFlagged", "rowsNew", "rowsSkipped", "rowsTotal", "statementBalance", "statementBalanceDate", "status", "userId" FROM "Import";
DROP TABLE "Import";
ALTER TABLE "new_Import" RENAME TO "Import";
CREATE INDEX "Import_userId_createdAt_idx" ON "Import"("userId", "createdAt");
CREATE INDEX "Import_accountId_fileHash_idx" ON "Import"("accountId", "fileHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
