-- CreateEnum
CREATE TYPE "auth_token_purpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMPTZ(3);

-- Existing accounts were created before email verification existed.
UPDATE "users" SET "email_verified_at" = CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "auth_token_purpose" NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_tokens_token_hash_format_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "auth_tokens_expiry_after_creation_check" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "auth_tokens_used_at_after_creation_check" CHECK ("used_at" IS NULL OR "used_at" >= "created_at")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_expires_at_idx" ON "auth_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_user_id_purpose_key" ON "auth_tokens"("user_id", "purpose");

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
