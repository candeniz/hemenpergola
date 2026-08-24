CREATE TABLE "SlugRedirect" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "oldSlug" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlugRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlugRedirect_entityId_idx" ON "SlugRedirect"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SlugRedirect_entityType_locale_oldSlug_key" ON "SlugRedirect"("entityType", "locale", "oldSlug");

