-- AlterTable
ALTER TABLE "ServiceArea" ADD COLUMN     "precision" "PointPrecision";

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

