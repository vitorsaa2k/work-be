import type { Prisma } from '../../generated/prisma/client.js'

export async function lockGig(transaction: Prisma.TransactionClient, gigId: string): Promise<void> {
  await transaction.$queryRaw`SELECT "id" FROM "gigs" WHERE "id" = ${gigId}::uuid FOR UPDATE`
}

export const GIG_EXPIRY_GRACE_MS = 24 * 60 * 60 * 1000

export function getGigExpiryCutoff(now: Date): Date {
  return new Date(now.getTime() - GIG_EXPIRY_GRACE_MS)
}

export function isGigExpired(scheduledAt: Date | null, now: Date): boolean {
  return scheduledAt !== null && scheduledAt.getTime() + GIG_EXPIRY_GRACE_MS <= now.getTime()
}

export function isFutureSchedule(scheduledAt: Date | null, now: Date): boolean {
  return scheduledAt !== null && scheduledAt.getTime() > now.getTime()
}

export function activeOpenGigWhere(now: Date): Prisma.GigWhereInput {
  const cutoff = getGigExpiryCutoff(now)

  return {
    status: 'OPEN',
    OR: [{ scheduledAt: null }, { scheduledAt: { gt: cutoff } }],
  }
}
