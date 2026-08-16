-- CreateEnum
CREATE TYPE "ProductBasis" AS ENUM ('AREA_M2', 'LENGTH_M', 'UNIT');

-- CreateEnum
CREATE TYPE "AttributeInputType" AS ENUM ('NUMBER', 'SELECT', 'MULTISELECT', 'BOOL', 'TEXT');

-- CreateTable
CREATE TABLE "Seo" (
    "id" TEXT NOT NULL,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "canonicalUrl" TEXT,
    "ogImageId" TEXT,
    "noIndex" BOOLEAN NOT NULL DEFAULT false,
    "jsonLd" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Seo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "seoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryTranslation" (
    "categoryId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "CategoryTranslation_pkey" PRIMARY KEY ("categoryId","locale")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "basisType" "ProductBasis" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "seoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTranslation" (
    "productId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortDescription" TEXT,
    "description" TEXT,

    CONSTRAINT "ProductTranslation_pkey" PRIMARY KEY ("productId","locale")
);

-- CreateTable
CREATE TABLE "ProductAttribute" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "inputType" "AttributeInputType" NOT NULL,
    "unit" TEXT,
    "min" INTEGER,
    "max" INTEGER,
    "step" INTEGER,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "affectsPrice" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "showIfAttributeKey" TEXT,
    "showIfValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAttributeTranslation" (
    "attributeId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,

    CONSTRAINT "ProductAttributeTranslation_pkey" PRIMARY KEY ("attributeId","locale")
);

-- CreateTable
CREATE TABLE "ProductOption" (
    "id" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOptionTranslation" (
    "optionId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ProductOptionTranslation_pkey" PRIMARY KEY ("optionId","locale")
);

-- CreateIndex
CREATE INDEX "Seo_ogImageId_idx" ON "Seo"("ogImageId");

-- CreateIndex
CREATE INDEX "Category_parentId_sortOrder_idx" ON "Category"("parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "Category_isActive_idx" ON "Category"("isActive");

-- CreateIndex
CREATE INDEX "Category_seoId_idx" ON "Category"("seoId");

-- CreateIndex
CREATE INDEX "CategoryTranslation_slug_idx" ON "CategoryTranslation"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryTranslation_locale_slug_key" ON "CategoryTranslation"("locale", "slug");

-- CreateIndex
CREATE INDEX "Product_categoryId_sortOrder_idx" ON "Product"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");

-- CreateIndex
CREATE INDEX "Product_seoId_idx" ON "Product"("seoId");

-- CreateIndex
CREATE INDEX "ProductTranslation_slug_idx" ON "ProductTranslation"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTranslation_locale_slug_key" ON "ProductTranslation"("locale", "slug");

-- CreateIndex
CREATE INDEX "ProductAttribute_productId_sortOrder_idx" ON "ProductAttribute"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttribute_productId_key_key" ON "ProductAttribute"("productId", "key");

-- CreateIndex
CREATE INDEX "ProductOption_attributeId_sortOrder_idx" ON "ProductOption"("attributeId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductOption_isActive_idx" ON "ProductOption"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_attributeId_value_key" ON "ProductOption"("attributeId", "value");

-- AddForeignKey
ALTER TABLE "Seo" ADD CONSTRAINT "Seo_ogImageId_fkey" FOREIGN KEY ("ogImageId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_seoId_fkey" FOREIGN KEY ("seoId") REFERENCES "Seo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryTranslation" ADD CONSTRAINT "CategoryTranslation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_seoId_fkey" FOREIGN KEY ("seoId") REFERENCES "Seo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTranslation" ADD CONSTRAINT "ProductTranslation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttribute" ADD CONSTRAINT "ProductAttribute_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeTranslation" ADD CONSTRAINT "ProductAttributeTranslation_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "ProductAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "ProductAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionTranslation" ADD CONSTRAINT "ProductOptionTranslation_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Turkish collation on the columns a human sorts by (04 §Conventions).
--
-- Prisma cannot express a column collation, so these are hand-written and `migrate diff`
-- stays empty because it does not compare collations either. The cluster is C, which is
-- what keeps slugs, emails and tokens comparing exactly; only display names get the
-- Turkish sort.
--
-- Slugs are deliberately NOT here. `bahce` and `bahçe` must be different slugs, and a
-- Turkish collation would make İ/ı comparisons locale-dependent in a uniqueness index.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "CategoryTranslation"      ALTER COLUMN "name"  TYPE text COLLATE "tr-TR-x-icu";
ALTER TABLE "ProductTranslation"       ALTER COLUMN "name"  TYPE text COLLATE "tr-TR-x-icu";
ALTER TABLE "ProductOptionTranslation" ALTER COLUMN "label" TYPE text COLLATE "tr-TR-x-icu";
