import { createPrismaClient, type DatabaseClient } from '../../src/db/prisma.js'
import { testDatabaseUrl } from '../setup/test-database.js'

export function createTestDatabaseClient(): DatabaseClient {
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for database integration tests.')
  }

  return createPrismaClient(testDatabaseUrl)
}

export async function resetTestDatabase(prisma: DatabaseClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "agreements", "applications", "gig_addresses", "gigs", "profiles", "auth_tokens", "sessions", "users" RESTART IDENTITY CASCADE',
  )
}
