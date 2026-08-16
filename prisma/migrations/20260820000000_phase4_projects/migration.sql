-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'READY', 'SUBMITTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('NEW_BUILD', 'RENOVATION');

-- CreateEnum
CREATE TYPE "InstallationType" AS ENUM ('WALL_MOUNTED', 'FREESTANDING', 'ROOF', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectTiming" AS ENUM ('ASAP', 'M1_3', 'M3_6', 'PLANNING');

-- CreateEnum
CREATE TYPE "PointPrecision" AS ENUM ('EXACT', 'DISTRICT', 'CITY');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('PHOTO', 'DOCUMENT');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "anonymousKey" TEXT,
    "productId" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "widthMm" INTEGER,
    "depthMm" INTEGER,
    "heightMm" INTEGER,
    "areaM2" DOUBLE PRECISION,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "projectType" "ProjectType",
    "installationType" "InstallationType",
    "cityId" TEXT,
    "districtId" TEXT,
    "addressNote" TEXT,
    "point" geography(Point, 4326),
    "pointPrecision" "PointPrecision",
    "timing" "ProjectTiming",
    "budgetHintKurus" INTEGER,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAttributeValue" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "optionId" TEXT,
    "numberValue" DOUBLE PRECISION,
    "boolValue" BOOLEAN,
    "textValue" TEXT,

    CONSTRAINT "ProjectAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAttachment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_point_gist" ON "Project" USING GIST ("point");

-- CreateIndex
CREATE INDEX "Project_customerId_status_idx" ON "Project"("customerId", "status");

-- CreateIndex
CREATE INDEX "Project_anonymousKey_idx" ON "Project"("anonymousKey");

-- CreateIndex
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");

-- CreateIndex
CREATE INDEX "ProjectAttributeValue_projectId_idx" ON "ProjectAttributeValue"("projectId");

-- CreateIndex
CREATE INDEX "ProjectAttributeValue_attributeId_idx" ON "ProjectAttributeValue"("attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAttributeValue_projectId_attributeId_optionId_key" ON "ProjectAttributeValue"("projectId", "attributeId", "optionId");

-- CreateIndex
CREATE INDEX "ProjectAttachment_projectId_sortOrder_idx" ON "ProjectAttachment"("projectId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAttachment_projectId_fileId_key" ON "ProjectAttachment"("projectId", "fileId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttributeValue" ADD CONSTRAINT "ProjectAttributeValue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttributeValue" ADD CONSTRAINT "ProjectAttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "ProductAttribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttributeValue" ADD CONSTRAINT "ProjectAttributeValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Exactly one of `customerId` / `anonymousKey` is set — `04-data-model.md` §Project.
--
-- Prisma cannot express it, and it is not a rule a service can be trusted with: a project
-- with neither belongs to nobody and can never be claimed or purged; a project with both is
-- reachable two ways, and `10` §Anonymous drafts caps a key at three drafts by counting
-- rows. Both states are unrecoverable once written, which is what makes this a constraint
-- rather than a validation.
--
-- `<>` on two booleans is XOR, so this reads as "one and only one is null".
ALTER TABLE "Project"
  ADD CONSTRAINT "Project_exactly_one_owner"
  CHECK (("customerId" IS NULL) <> ("anonymousKey" IS NULL));

-- Turkish collation on the fields a customer types and later sorts or searches
-- (`04` §Conventions; the cluster stays `--locale=C`).
ALTER TABLE "Project" ALTER COLUMN "title" TYPE text COLLATE "tr-TR-x-icu";
ALTER TABLE "Project" ALTER COLUMN "note" TYPE text COLLATE "tr-TR-x-icu";
ALTER TABLE "Project" ALTER COLUMN "addressNote" TYPE text COLLATE "tr-TR-x-icu";
