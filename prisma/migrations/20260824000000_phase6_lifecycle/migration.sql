-- CreateEnum
CREATE TYPE "OfferRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'SURVEY_SCHEDULED', 'SURVEY_COMPLETED', 'OFFER_SENT', 'OFFER_ACCEPTED', 'OFFER_REJECTED', 'WON', 'LOST', 'CLOSED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "OfferRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "OfferRequestStatus" NOT NULL DEFAULT 'PENDING',
    "matchResultId" TEXT,
    "priceCalculationId" TEXT,
    "slaExpiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "contactDisclosedAt" TIMESTAMP(3),
    "consentId" TEXT NOT NULL,
    "closedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactDisclosure" (
    "id" TEXT NOT NULL,
    "offerRequestId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "disclosedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disclosedFields" TEXT[],
    "consentId" TEXT NOT NULL,

    CONSTRAINT "ContactDisclosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "offerRequestId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "note" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "offerRequestId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "netKurus" INTEGER NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL,
    "taxKurus" INTEGER NOT NULL,
    "grossKurus" INTEGER NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "sentAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferLine" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPriceKurus" INTEGER NOT NULL,
    "lineNetKurus" INTEGER NOT NULL,

    CONSTRAINT "OfferLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfferRequest_companyId_status_slaExpiresAt_idx" ON "OfferRequest"("companyId", "status", "slaExpiresAt");

-- CreateIndex
CREATE INDEX "OfferRequest_customerId_status_idx" ON "OfferRequest"("customerId", "status");

-- CreateIndex
CREATE INDEX "OfferRequest_status_slaExpiresAt_idx" ON "OfferRequest"("status", "slaExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfferRequest_projectId_companyId_key" ON "OfferRequest"("projectId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactDisclosure_offerRequestId_key" ON "ContactDisclosure"("offerRequestId");

-- CreateIndex
CREATE INDEX "ContactDisclosure_companyId_disclosedAt_idx" ON "ContactDisclosure"("companyId", "disclosedAt");

-- CreateIndex
CREATE INDEX "Appointment_offerRequestId_scheduledAt_idx" ON "Appointment"("offerRequestId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_number_key" ON "Offer"("number");

-- CreateIndex
CREATE INDEX "Offer_offerRequestId_status_idx" ON "Offer"("offerRequestId", "status");

-- CreateIndex
CREATE INDEX "OfferLine_offerId_sortOrder_idx" ON "OfferLine"("offerId", "sortOrder");

-- AddForeignKey
ALTER TABLE "OfferRequest" ADD CONSTRAINT "OfferRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferRequest" ADD CONSTRAINT "OfferRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferRequest" ADD CONSTRAINT "OfferRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferRequest" ADD CONSTRAINT "OfferRequest_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "Consent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferRequest" ADD CONSTRAINT "OfferRequest_matchResultId_fkey" FOREIGN KEY ("matchResultId") REFERENCES "MatchResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferRequest" ADD CONSTRAINT "OfferRequest_priceCalculationId_fkey" FOREIGN KEY ("priceCalculationId") REFERENCES "PriceCalculation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactDisclosure" ADD CONSTRAINT "ContactDisclosure_offerRequestId_fkey" FOREIGN KEY ("offerRequestId") REFERENCES "OfferRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactDisclosure" ADD CONSTRAINT "ContactDisclosure_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactDisclosure" ADD CONSTRAINT "ContactDisclosure_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "Consent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_offerRequestId_fkey" FOREIGN KEY ("offerRequestId") REFERENCES "OfferRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_offerRequestId_fkey" FOREIGN KEY ("offerRequestId") REFERENCES "OfferRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferLine" ADD CONSTRAINT "OfferLine_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

