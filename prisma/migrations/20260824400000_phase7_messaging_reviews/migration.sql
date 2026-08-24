
-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "analyticsRefreshedAt" TIMESTAMP(3),
ADD COLUMN     "completedEngagements" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "medianResponseMinutes" INTEGER,
ADD COLUMN     "ratingSum" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "offerRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "offerRequestId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "ratingOverall" INTEGER NOT NULL,
    "ratingQuality" INTEGER NOT NULL,
    "ratingCommunication" INTEGER NOT NULL,
    "ratingTimeliness" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "publishedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewResponse" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "responderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Thread_offerRequestId_key" ON "Thread"("offerRequestId");

-- CreateIndex
CREATE INDEX "Message_threadId_sentAt_idx" ON "Message"("threadId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_offerRequestId_key" ON "Review"("offerRequestId");

-- CreateIndex
CREATE INDEX "Review_companyId_status_publishedAt_idx" ON "Review"("companyId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Review_customerId_companyId_createdAt_idx" ON "Review"("customerId", "companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewResponse_reviewId_key" ON "ReviewResponse"("reviewId");

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_offerRequestId_fkey" FOREIGN KEY ("offerRequestId") REFERENCES "OfferRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_offerRequestId_fkey" FOREIGN KEY ("offerRequestId") REFERENCES "OfferRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewResponse" ADD CONSTRAINT "ReviewResponse_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewResponse" ADD CONSTRAINT "ReviewResponse_responderUserId_fkey" FOREIGN KEY ("responderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Hand-written tail — Prisma cannot model CHECK constraints (ADR-025's precedent) ──

-- 16 §Content: every rating dimension is 1..5. The service validates with Zod; the CHECK
-- makes the range a property of the table, so no future writer can store a 0 or a 6.
ALTER TABLE "Review"
  ADD CONSTRAINT "Review_rating_range" CHECK (
    "ratingOverall" BETWEEN 1 AND 5
    AND "ratingQuality" BETWEEN 1 AND 5
    AND "ratingCommunication" BETWEEN 1 AND 5
    AND "ratingTimeliness" BETWEEN 1 AND 5
  );

-- 15 §Rules: plain text, 4000 characters. Same belt-and-braces as the rating range.
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_body_length" CHECK (char_length("body") BETWEEN 1 AND 4000);
