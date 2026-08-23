-- AlterTable
ALTER TABLE "ServiceArea" ADD COLUMN     "precision" "PointPrecision";

-- Hand-written tail, like migration 6's XOR constraint: Prisma cannot model a CHECK.
--
-- The eligibility query's GiST pre-filter uses a constant 500 km expansion (ADR-025) and is
-- correct only if no row can exceed it. Until this constraint, the 5..500 range lived only
-- in a Zod schema — one raw insert away from a service area that silently drops out of
-- every match, presenting as "no manufacturers in your area". The bounds are the ones
-- addServiceAreaSchema has always enforced.
ALTER TABLE "ServiceArea"
  ADD CONSTRAINT "ServiceArea_radiusKm_range"
  CHECK ("radiusKm" IS NULL OR ("radiusKm" BETWEEN 5 AND 500));

-- CreateTable
CREATE TABLE "MatchRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "weightsVersion" INTEGER NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchRun_pkey" PRIMARY KEY ("id")
);

-- CreateEnum
CREATE TYPE "MatchPriceState" AS ENUM ('PRICED', 'ON_REQUEST', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL,
    "matchRunId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "scoreBreakdown" JSONB NOT NULL,
    "priceCalculationId" TEXT,
    "priceOnRequest" BOOLEAN NOT NULL DEFAULT false,
    "priceState" "MatchPriceState" NOT NULL DEFAULT 'ON_REQUEST',
    "distanceKm" DOUBLE PRECISION,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchRun_projectId_createdAt_idx" ON "MatchRun"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchResult_matchRunId_rank_idx" ON "MatchResult"("matchRunId", "rank");

-- CreateIndex
CREATE INDEX "MatchResult_companyId_idx" ON "MatchResult"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchResult_matchRunId_companyId_key" ON "MatchResult"("matchRunId", "companyId");

-- AddForeignKey
ALTER TABLE "MatchRun" ADD CONSTRAINT "MatchRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_matchRunId_fkey" FOREIGN KEY ("matchRunId") REFERENCES "MatchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_priceCalculationId_fkey" FOREIGN KEY ("priceCalculationId") REFERENCES "PriceCalculation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable · 04 §Messaging's Notification, pulled forward by 5.7's zero-result
-- subscription (09 §Zero-result handling). NotificationPreference stays with Phase 7.
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

