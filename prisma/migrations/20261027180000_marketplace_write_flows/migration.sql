-- Rename completion confirmations so start and completion are explicit.
ALTER TABLE "agreements" RENAME COLUMN "employer_confirmed_at" TO "employer_completed_at";
ALTER TABLE "agreements" RENAME COLUMN "worker_confirmed_at" TO "worker_completed_at";

-- AlterTable
ALTER TABLE "agreements"
ADD COLUMN     "canceled_at" TIMESTAMPTZ(3),
ADD COLUMN     "canceled_by_id" UUID,
ADD COLUMN     "cancellation_reason" VARCHAR(500),
ADD COLUMN     "employer_started_at" TIMESTAMPTZ(3),
ADD COLUMN     "started_at" TIMESTAMPTZ(3),
ADD COLUMN     "worker_started_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "gigs"
ADD COLUMN     "canceled_at" TIMESTAMPTZ(3),
ADD COLUMN     "canceled_by_id" UUID,
ADD COLUMN     "cancellation_reason" VARCHAR(500),
ADD COLUMN     "expired_at" TIMESTAMPTZ(3);

-- Backfill legacy completed agreements so start timestamps precede completion.
UPDATE "agreements"
SET
    "employer_started_at" = COALESCE("employer_started_at", "created_at"),
    "worker_started_at" = COALESCE("worker_started_at", "created_at"),
    "started_at" = COALESCE("started_at", "created_at")
WHERE "completed_at" IS NOT NULL;

-- CreateIndex
CREATE INDEX "gigs_status_scheduled_at_idx" ON "gigs"("status", "scheduled_at");

-- AddForeignKey
ALTER TABLE "gigs" ADD CONSTRAINT "gigs_canceled_by_id_fkey" FOREIGN KEY ("canceled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_canceled_by_id_fkey" FOREIGN KEY ("canceled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants
ALTER TABLE "gigs" ADD CONSTRAINT "gigs_canceled_metadata_check" CHECK (
    ("canceled_at" IS NULL AND "canceled_by_id" IS NULL)
    OR ("canceled_at" IS NOT NULL AND "canceled_by_id" IS NOT NULL)
);
ALTER TABLE "gigs" ADD CONSTRAINT "gigs_expired_at_status_check" CHECK (
    "expired_at" IS NULL OR "status" = 'EXPIRED'
);
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_started_at_consistency_check" CHECK (
    "started_at" IS NULL
    OR ("employer_started_at" IS NOT NULL AND "worker_started_at" IS NOT NULL)
);
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_completed_at_consistency_check" CHECK (
    "completed_at" IS NULL
    OR (
        "started_at" IS NOT NULL
        AND "employer_completed_at" IS NOT NULL
        AND "worker_completed_at" IS NOT NULL
    )
);
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_canceled_metadata_check" CHECK (
    ("canceled_at" IS NULL AND "canceled_by_id" IS NULL)
    OR ("canceled_at" IS NOT NULL AND "canceled_by_id" IS NOT NULL)
);
