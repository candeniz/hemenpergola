-- CreateEnum
CREATE TYPE "PriceBookStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PriceUnit" AS ENUM ('PER_M2', 'PER_M', 'PER_UNIT');

-- CreateEnum
CREATE TYPE "OptionPriceMode" AS ENUM ('FLAT', 'PER_M2', 'PER_M', 'PER_UNIT', 'PERCENT');

-- CreateEnum
CREATE TYPE "AdjustmentMode" AS ENUM ('FLAT', 'PERCENT');

-- CreateEnum
CREATE TYPE "PriceRuleKind" AS ENUM ('AREA_DISCOUNT', 'VALUE_DISCOUNT', 'SIZE_SURCHARGE', 'HEIGHT_SURCHARGE');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "priceOnRequest" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PriceBook" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PriceBookStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBookItem" (
    "id" TEXT NOT NULL,
    "priceBookId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "basePriceKurus" INTEGER NOT NULL,
    "unit" "PriceUnit" NOT NULL,
    "minProjectPriceKurus" INTEGER NOT NULL DEFAULT 0,
    "setupFeeKurus" INTEGER,

    CONSTRAINT "PriceBookItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBookOptionPrice" (
    "id" TEXT NOT NULL,
    "priceBookId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "mode" "OptionPriceMode" NOT NULL,
    "valueKurus" INTEGER,
    "percent" DOUBLE PRECISION,

    CONSTRAINT "PriceBookOptionPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBookRegionAdjustment" (
    "id" TEXT NOT NULL,
    "priceBookId" TEXT NOT NULL,
    "cityId" TEXT,
    "districtId" TEXT,
    "mode" "AdjustmentMode" NOT NULL,
    "valueKurus" INTEGER,
    "percent" DOUBLE PRECISION,

    CONSTRAINT "PriceBookRegionAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBookRule" (
    "id" TEXT NOT NULL,
    "priceBookId" TEXT NOT NULL,
    "kind" "PriceRuleKind" NOT NULL,
    "thresholdMin" DOUBLE PRECISION,
    "thresholdMax" DOUBLE PRECISION,
    "mode" "AdjustmentMode" NOT NULL,
    "valueKurus" INTEGER,
    "percent" DOUBLE PRECISION,
    "note" TEXT,

    CONSTRAINT "PriceBookRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceCalculation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "companyId" TEXT NOT NULL,
    "priceBookId" TEXT NOT NULL,
    "priceBookVersion" INTEGER NOT NULL,
    "netKurus" INTEGER NOT NULL,
    "bandLowKurus" INTEGER NOT NULL,
    "bandHighKurus" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "engineVersion" INTEGER NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "requestIp" TEXT,

    CONSTRAINT "PriceCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceBook_companyId_status_idx" ON "PriceBook"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PriceBook_companyId_version_key" ON "PriceBook"("companyId", "version");

-- CreateIndex
CREATE INDEX "PriceBookItem_productId_idx" ON "PriceBookItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceBookItem_priceBookId_productId_key" ON "PriceBookItem"("priceBookId", "productId");

-- CreateIndex
CREATE INDEX "PriceBookOptionPrice_optionId_idx" ON "PriceBookOptionPrice"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceBookOptionPrice_priceBookId_optionId_key" ON "PriceBookOptionPrice"("priceBookId", "optionId");

-- CreateIndex
CREATE INDEX "PriceBookRegionAdjustment_priceBookId_idx" ON "PriceBookRegionAdjustment"("priceBookId");

-- CreateIndex
CREATE INDEX "PriceBookRegionAdjustment_cityId_idx" ON "PriceBookRegionAdjustment"("cityId");

-- CreateIndex
CREATE INDEX "PriceBookRegionAdjustment_districtId_idx" ON "PriceBookRegionAdjustment"("districtId");

-- CreateIndex
CREATE INDEX "PriceBookRule_priceBookId_kind_idx" ON "PriceBookRule"("priceBookId", "kind");

-- CreateIndex
CREATE INDEX "PriceCalculation_companyId_calculatedAt_idx" ON "PriceCalculation"("companyId", "calculatedAt");

-- CreateIndex
CREATE INDEX "PriceCalculation_priceBookId_idx" ON "PriceCalculation"("priceBookId");

-- CreateIndex
CREATE INDEX "PriceCalculation_actorUserId_calculatedAt_idx" ON "PriceCalculation"("actorUserId", "calculatedAt");

-- AddForeignKey
ALTER TABLE "PriceBook" ADD CONSTRAINT "PriceBook_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookItem" ADD CONSTRAINT "PriceBookItem_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "PriceBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookItem" ADD CONSTRAINT "PriceBookItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookOptionPrice" ADD CONSTRAINT "PriceBookOptionPrice_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "PriceBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookOptionPrice" ADD CONSTRAINT "PriceBookOptionPrice_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookRegionAdjustment" ADD CONSTRAINT "PriceBookRegionAdjustment_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "PriceBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookRegionAdjustment" ADD CONSTRAINT "PriceBookRegionAdjustment_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookRegionAdjustment" ADD CONSTRAINT "PriceBookRegionAdjustment_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookRule" ADD CONSTRAINT "PriceBookRule_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "PriceBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceCalculation" ADD CONSTRAINT "PriceCalculation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceCalculation" ADD CONSTRAINT "PriceCalculation_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "PriceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One live price book per company — `04-data-model.md` §Indexes.
--
-- Prisma has no partial unique index, so this is hand-written and must survive
-- `migrate diff`: the schema carries no matching `@@unique`, which is why the drift check
-- compares the *database* to the datamodel rather than the migrations to the datamodel.
--
-- It is a constraint rather than a service rule because "which book is live" is read by the
-- matching query on every candidate. Two published books would make the estimate depend on
-- row order, and no amount of care in `publishPriceBook` prevents a concurrent second
-- publish from a second tab.
CREATE UNIQUE INDEX "PriceBook_one_published_per_company"
  ON "PriceBook" ("companyId")
  WHERE "status" = 'PUBLISHED';

-- Turkish collation for the note fields a manufacturer types and later sorts or searches.
ALTER TABLE "PriceBook" ALTER COLUMN "note" TYPE text COLLATE "tr-TR-x-icu";
ALTER TABLE "PriceBookRule" ALTER COLUMN "note" TYPE text COLLATE "tr-TR-x-icu";
