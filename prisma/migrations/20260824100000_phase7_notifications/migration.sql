-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dispatchedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_channel_type_key" ON "NotificationPreference"("userId", "channel", "type");

-- CreateIndex
CREATE INDEX "Notification_dispatchedAt_idx" ON "Notification"("dispatchedAt");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written tail: rows written before dispatch existed are stamped as dispatched at
-- their creation time. Their moment has passed — the recipients saw (or will see) them
-- in-app, and a retroactive email flood months after the fact serves nobody. Without this,
-- the first dispatch sweep would send every notification Phase 5 and 6 ever wrote.
UPDATE "Notification" SET "dispatchedAt" = "createdAt" WHERE "dispatchedAt" IS NULL;
