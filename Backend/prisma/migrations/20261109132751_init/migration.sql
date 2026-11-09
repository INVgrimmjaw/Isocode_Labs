-- CreateEnum
CREATE TYPE "Role" AS ENUM ('RETAILER', 'DESK');

-- CreateEnum
CREATE TYPE "SchemeKind" AS ENUM ('FREE_GOODS', 'SLAB_DISCOUNT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CREDIT_HOLD', 'READY', 'EXPORTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('APP', 'AI_CAPTURE');

-- CreateEnum
CREATE TYPE "CaptureStatus" AS ENUM ('NEEDS_REVIEW', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CaptureEngine" AS ENUM ('CLAUDE', 'MATCHER');

-- CreateEnum
CREATE TYPE "CaptureUnit" AS ENUM ('CASE', 'PIECE', 'UNCLEAR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "retailerId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Retailer" (
    "id" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "beat" TEXT NOT NULL,
    "tallyLedgerName" TEXT NOT NULL,
    "creditLimitPaise" INTEGER NOT NULL,
    "outstandingPaise" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Retailer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sku" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameHi" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "sizeGrams" INTEGER,
    "unitsPerCase" INTEGER NOT NULL,
    "dealerPricePaise" INTEGER NOT NULL,
    "gstBps" INTEGER NOT NULL,
    "stockPieces" INTEGER NOT NULL,
    "keywords" TEXT[],
    "packKind" TEXT NOT NULL,

    CONSTRAINT "Sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailerPrice" (
    "retailerId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "unitPricePaise" INTEGER NOT NULL,

    CONSTRAINT "RetailerPrice_pkey" PRIMARY KEY ("retailerId","skuId")
);

-- CreateTable
CREATE TABLE "Scheme" (
    "id" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "kind" "SchemeKind" NOT NULL,
    "label" TEXT NOT NULL,
    "labelHi" TEXT NOT NULL,
    "buyCases" INTEGER,
    "freeCases" INTEGER,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),

    CONSTRAINT "Scheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchemeSlab" (
    "id" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "minCases" INTEGER NOT NULL,
    "discountBps" INTEGER NOT NULL,

    CONSTRAINT "SchemeSlab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "retailerId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "source" "OrderSource" NOT NULL,
    "idempotencyKey" TEXT,
    "grossPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL,
    "taxablePaise" INTEGER NOT NULL,
    "gstPaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "overLimitPaise" INTEGER,
    "rejectedReason" TEXT,
    "tallyBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "skuCode" TEXT NOT NULL,
    "skuName" TEXT NOT NULL,
    "unitsPerCase" INTEGER NOT NULL,
    "cases" INTEGER NOT NULL,
    "pieces" INTEGER NOT NULL,
    "totalPieces" INTEGER NOT NULL,
    "freeCases" INTEGER NOT NULL DEFAULT 0,
    "unitPricePaise" INTEGER NOT NULL,
    "gstBps" INTEGER NOT NULL,
    "grossPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL,
    "taxablePaise" INTEGER NOT NULL,
    "gstPaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "schemeLabel" TEXT,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TallyBatch" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "xml" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TallyBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Capture" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "status" "CaptureStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "engine" "CaptureEngine" NOT NULL,
    "engineNote" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Capture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptureLine" (
    "id" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "originalWords" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "quantity" INTEGER,
    "unit" "CaptureUnit" NOT NULL,
    "suggestedSkuId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "alternativeSkuIds" TEXT[],

    CONSTRAINT "CaptureLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailerAlias" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,

    CONSTRAINT "RetailerAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_retailerId_idx" ON "User"("retailerId");

-- CreateIndex
CREATE INDEX "OtpChallenge_phone_createdAt_idx" ON "OtpChallenge"("phone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Retailer_phone_key" ON "Retailer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Sku_code_key" ON "Sku"("code");

-- CreateIndex
CREATE INDEX "Scheme_skuId_idx" ON "Scheme"("skuId");

-- CreateIndex
CREATE UNIQUE INDEX "SchemeSlab_schemeId_minCases_key" ON "SchemeSlab"("schemeId", "minCases");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_retailerId_createdAt_idx" ON "Order"("retailerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderLine_skuId_idx" ON "OrderLine"("skuId");

-- CreateIndex
CREATE UNIQUE INDEX "TallyBatch_number_key" ON "TallyBatch"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Capture_orderId_key" ON "Capture"("orderId");

-- CreateIndex
CREATE INDEX "Capture_status_createdAt_idx" ON "Capture"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CaptureLine_captureId_position_key" ON "CaptureLine"("captureId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerAlias_retailerId_phrase_key" ON "RetailerAlias"("retailerId", "phrase");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailerPrice" ADD CONSTRAINT "RetailerPrice_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailerPrice" ADD CONSTRAINT "RetailerPrice_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scheme" ADD CONSTRAINT "Scheme_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchemeSlab" ADD CONSTRAINT "SchemeSlab_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "Scheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tallyBatchId_fkey" FOREIGN KEY ("tallyBatchId") REFERENCES "TallyBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capture" ADD CONSTRAINT "Capture_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capture" ADD CONSTRAINT "Capture_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureLine" ADD CONSTRAINT "CaptureLine_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "Capture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailerAlias" ADD CONSTRAINT "RetailerAlias_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailerAlias" ADD CONSTRAINT "RetailerAlias_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;
