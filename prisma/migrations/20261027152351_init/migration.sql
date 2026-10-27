-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "gig_type" AS ENUM ('PERSONAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "gig_status" AS ENUM ('DRAFT', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "application_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "agreement_status" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'DISPUTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255),
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bio" TEXT,
    "image_url" VARCHAR(2048),
    "city" VARCHAR(120) NOT NULL,
    "location" VARCHAR(120),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gigs" (
    "id" UUID NOT NULL,
    "employer_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "price_amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "estimated_duration_minutes" INTEGER NOT NULL,
    "scheduled_at" TIMESTAMPTZ(3),
    "city" VARCHAR(120) NOT NULL,
    "location" VARCHAR(120) NOT NULL,
    "type" "gig_type" NOT NULL,
    "status" "gig_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "gigs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gig_addresses" (
    "id" UUID NOT NULL,
    "gig_id" UUID NOT NULL,
    "street" VARCHAR(200) NOT NULL,
    "number" VARCHAR(20) NOT NULL,
    "complement" VARCHAR(120),
    "access_instructions" TEXT,

    CONSTRAINT "gig_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "gig_id" UUID NOT NULL,
    "applicant_id" UUID NOT NULL,
    "message" VARCHAR(2000),
    "status" "application_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreements" (
    "id" UUID NOT NULL,
    "gig_id" UUID NOT NULL,
    "employer_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "agreed_price_amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "agreement_status" NOT NULL DEFAULT 'ASSIGNED',
    "employer_confirmed_at" TIMESTAMPTZ(3),
    "worker_confirmed_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE INDEX "gigs_employer_id_idx" ON "gigs"("employer_id");

-- CreateIndex
CREATE INDEX "gigs_status_created_at_idx" ON "gigs"("status", "created_at");

-- CreateIndex
CREATE INDEX "gigs_status_city_idx" ON "gigs"("status", "city");

-- CreateIndex
CREATE INDEX "gigs_status_category_idx" ON "gigs"("status", "category");

-- CreateIndex
CREATE UNIQUE INDEX "gig_addresses_gig_id_key" ON "gig_addresses"("gig_id");

-- CreateIndex
CREATE INDEX "applications_applicant_id_status_idx" ON "applications"("applicant_id", "status");

-- CreateIndex
CREATE INDEX "applications_gig_id_status_idx" ON "applications"("gig_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "applications_gig_id_applicant_id_key" ON "applications"("gig_id", "applicant_id");

-- CreateIndex
CREATE UNIQUE INDEX "agreements_gig_id_key" ON "agreements"("gig_id");

-- CreateIndex
CREATE INDEX "agreements_employer_id_status_idx" ON "agreements"("employer_id", "status");

-- CreateIndex
CREATE INDEX "agreements_worker_id_status_idx" ON "agreements"("worker_id", "status");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gigs" ADD CONSTRAINT "gigs_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gig_addresses" ADD CONSTRAINT "gig_addresses_gig_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "gigs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_gig_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "gigs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_gig_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "gigs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants
ALTER TABLE "gigs" ADD CONSTRAINT "gigs_price_amount_positive_check" CHECK ("price_amount" > 0);
ALTER TABLE "gigs" ADD CONSTRAINT "gigs_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "gigs" ADD CONSTRAINT "gigs_estimated_duration_minutes_positive_check" CHECK ("estimated_duration_minutes" > 0);
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_agreed_price_amount_positive_check" CHECK ("agreed_price_amount" > 0);
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_worker_not_employer_check" CHECK ("worker_id" <> "employer_id");
