-- Savora initial schema (generated with `prisma migrate diff`, then extended
-- by hand with the exclusion constraint below).
--
-- The one piece of non-generated SQL lives at the bottom. Prisma's schema
-- language cannot express GiST exclusion constraints, and this constraint is
-- what makes double bookings impossible rather than merely unlikely.

-- CreateEnum
CREATE TYPE "Zone" AS ENUM ('INDOOR', 'OUTDOOR', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "DietaryTag" AS ENUM ('VEGAN', 'VEGETARIAN', 'GLUTEN_FREE', 'DAIRY_FREE', 'SPICY', 'NUT_FREE', 'PORK_FREE', 'SHELLFISH');

-- CreateEnum
CREATE TYPE "MenuCategory" AS ENUM ('STARTERS', 'MAINS', 'DESSERTS', 'DRINKS');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    -- bcrypt hash for the Credentials provider. Nullable because OAuth-only
    -- accounts (managed by the Prisma adapter) never have one.
    "password" TEXT,
    "staffNotes" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("sessionToken")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "RestaurantTable" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "zone" "Zone" NOT NULL DEFAULT 'INDOOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sectionId" TEXT,

    CONSTRAINT "RestaurantTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorSection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zone" "Zone" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FloorSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    -- GENERATED ALWAYS, so the range can never drift out of sync with the
    -- timestamps it is derived from. See the note at the end of this file.
    "slot" tstzrange GENERATED ALWAYS AS (tstzrange("startsAt", "endsAt", '[)')) STORED,
    "partySize" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "zonePref" "Zone",
    "specialRequests" TEXT,
    "occasion" TEXT,
    "userId" TEXT,
    "tableId" TEXT,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT NOT NULL,
    "guestPhone" TEXT,
    "confirmationCode" TEXT NOT NULL,
    "manageToken" TEXT NOT NULL,
    "reminderSentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "category" "MenuCategory" NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tags" "DietaryTag"[] DEFAULT ARRAY[]::"DietaryTag"[],
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isSoldOut" BOOLEAN NOT NULL DEFAULT false,
    "ingredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "calories" INTEGER,
    "isSignature" BOOLEAN NOT NULL DEFAULT false,
    "chefNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "userId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId","menuItemId")
);

-- CreateTable
CREATE TABLE "RestaurantSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT 'Savora',
    "tagline" TEXT NOT NULL DEFAULT 'Seasonal Mediterranean cooking in the heart of the city',
    "address" TEXT NOT NULL DEFAULT '18 Alder Lane, Colchester, CO1 1SP',
    "phone" TEXT NOT NULL DEFAULT '+44 1206 555 0188',
    "email" TEXT NOT NULL DEFAULT 'reservations@savora.example',
    "openingHours" jsonb NOT NULL DEFAULT '{}',
    "holidays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxPartySize" INTEGER NOT NULL DEFAULT 12,
    "bookingWindowDays" INTEGER NOT NULL DEFAULT 30,
    "diningDurationMin" INTEGER NOT NULL DEFAULT 90,
    "holdDurationMin" INTEGER NOT NULL DEFAULT 10,
    "minNoticeHours" INTEGER NOT NULL DEFAULT 2,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "isAcceptingReservations" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTable_number_key" ON "RestaurantTable"("number");

-- CreateIndex
CREATE INDEX "RestaurantTable_zone_idx" ON "RestaurantTable"("zone");

-- CreateIndex
CREATE INDEX "RestaurantTable_capacity_idx" ON "RestaurantTable"("capacity");

-- CreateIndex
CREATE INDEX "Reservation_date_idx" ON "Reservation"("date");

-- CreateIndex
CREATE INDEX "Reservation_startsAt_idx" ON "Reservation"("startsAt");

-- CreateIndex
CREATE INDEX "Reservation_status_idx" ON "Reservation"("status");

-- CreateIndex
CREATE INDEX "Reservation_userId_idx" ON "Reservation"("userId");

-- CreateIndex
CREATE INDEX "Reservation_guestEmail_idx" ON "Reservation"("guestEmail");

-- CreateIndex
CREATE INDEX "Reservation_tableId_startsAt_idx" ON "Reservation"("tableId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_confirmationCode_key" ON "Reservation"("confirmationCode");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_manageToken_key" ON "Reservation"("manageToken");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_slug_key" ON "MenuItem"("slug");

-- CreateIndex
CREATE INDEX "MenuItem_category_idx" ON "MenuItem"("category");

-- CreateIndex
CREATE INDEX "MenuItem_isAvailable_idx" ON "MenuItem"("isAvailable");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "FloorSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "RestaurantTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- The double-booking guarantee.
--
-- `slot` is a tstzrange holding [startsAt, endsAt) for a booking. EXCLUDE USING
-- gist rejects any row whose range overlaps an existing range for the SAME
-- table, but ignores other tables and â€” via the partial WHERE clause â€” ignores
-- cancelled, completed and no-show bookings, so cancelling a reservation frees
-- its table immediately with no cleanup job.
--
-- Because this lives in the database, two concurrent HTTP requests that both
-- believe table T4 is free at 19:30 cannot both commit: the second fails with
-- SQLSTATE 23P01 (exclusion_violation) and the API layer retries with a
-- different table.
-- ---------------------------------------------------------------------------

-- btree_gist lets a GiST index compare the scalar tableId alongside the range.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Reservation"
    ADD CONSTRAINT "Reservation_no_overlapping_slot_per_table"
    EXCLUDE USING gist (
        "tableId" WITH =,
        "slot" WITH &&
    )
    WHERE ("tableId" IS NOT NULL AND "status" IN ('PENDING', 'CONFIRMED', 'SEATED'));

-- Supports the availability engine's per-day scans.
CREATE INDEX "Reservation_date_status_idx" ON "Reservation" ("date", "status");

