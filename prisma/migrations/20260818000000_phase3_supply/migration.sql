-- CreateEnum
CREATE TYPE "ServiceAreaKind" AS ENUM ('CITY', 'DISTRICT', 'RADIUS');

-- CreateTable
CREATE TABLE "CompanyProduct" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProductOption" (
    "id" TEXT NOT NULL,
    "companyProductId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "isOffered" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProductOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceArea" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "ServiceAreaKind" NOT NULL,
    "cityId" TEXT,
    "districtId" TEXT,
    "centerPoint" geography(Point, 4326),
    "radiusKm" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "centerLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "productId" TEXT,
    "cityId" TEXT,
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioPhoto" (
    "id" TEXT NOT NULL,
    "portfolioItemId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileVariant" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,

    CONSTRAINT "FileVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyProduct_productId_isActive_idx" ON "CompanyProduct"("productId", "isActive");

-- CreateIndex
CREATE INDEX "CompanyProduct_companyId_idx" ON "CompanyProduct"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProduct_companyId_productId_key" ON "CompanyProduct"("companyId", "productId");

-- CreateIndex
CREATE INDEX "CompanyProductOption_optionId_isOffered_idx" ON "CompanyProductOption"("optionId", "isOffered");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProductOption_companyProductId_optionId_key" ON "CompanyProductOption"("companyProductId", "optionId");

-- CreateIndex
CREATE INDEX "ServiceArea_companyId_isActive_idx" ON "ServiceArea"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "ServiceArea_kind_cityId_idx" ON "ServiceArea"("kind", "cityId");

-- CreateIndex
CREATE INDEX "ServiceArea_kind_districtId_idx" ON "ServiceArea"("kind", "districtId");

-- CreateIndex
CREATE INDEX "ServiceArea_centerPoint_gist" ON "ServiceArea" USING GIST ("centerPoint");

-- CreateIndex
CREATE INDEX "PortfolioItem_companyId_sortOrder_idx" ON "PortfolioItem"("companyId", "sortOrder");

-- CreateIndex
CREATE INDEX "PortfolioItem_productId_idx" ON "PortfolioItem"("productId");

-- CreateIndex
CREATE INDEX "PortfolioPhoto_portfolioItemId_sortOrder_idx" ON "PortfolioPhoto"("portfolioItemId", "sortOrder");

-- CreateIndex
CREATE INDEX "PortfolioPhoto_fileId_idx" ON "PortfolioPhoto"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioPhoto_portfolioItemId_fileId_key" ON "PortfolioPhoto"("portfolioItemId", "fileId");

-- CreateIndex
CREATE UNIQUE INDEX "FileVariant_key_key" ON "FileVariant"("key");

-- CreateIndex
CREATE INDEX "FileVariant_fileId_idx" ON "FileVariant"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "FileVariant_fileId_name_key" ON "FileVariant"("fileId", "name");

-- AddForeignKey
ALTER TABLE "CompanyProduct" ADD CONSTRAINT "CompanyProduct_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyProduct" ADD CONSTRAINT "CompanyProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyProductOption" ADD CONSTRAINT "CompanyProductOption_companyProductId_fkey" FOREIGN KEY ("companyProductId") REFERENCES "CompanyProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyProductOption" ADD CONSTRAINT "CompanyProductOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceArea" ADD CONSTRAINT "ServiceArea_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceArea" ADD CONSTRAINT "ServiceArea_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceArea" ADD CONSTRAINT "ServiceArea_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPhoto" ADD CONSTRAINT "PortfolioPhoto_portfolioItemId_fkey" FOREIGN KEY ("portfolioItemId") REFERENCES "PortfolioItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPhoto" ADD CONSTRAINT "PortfolioPhoto_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileVariant" ADD CONSTRAINT "FileVariant_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Turkish collation on the one column a human sorts by (04 §Conventions).
-- Titles are read in a list; keys, slugs and storage keys stay on the C cluster.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "PortfolioItem" ALTER COLUMN "title" TYPE text COLLATE "tr-TR-x-icu";
