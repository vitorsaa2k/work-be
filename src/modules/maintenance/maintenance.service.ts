import type { DatabaseClient } from '../../db/prisma.js'
import { getGigExpiryCutoff } from '../gigs/gig-lifecycle.js'

export interface MaintenanceResult {
  expiredGigs: number
  rejectedApplications: number
  deletedSessions: number
  deletedAuthTokens: number
}

export interface MaintenanceService {
  run(at?: Date): Promise<MaintenanceResult>
}

export function createMaintenanceService(
  prisma: DatabaseClient,
  clock: () => Date = () => new Date(),
): MaintenanceService {
  return {
    async run(at) {
      const now = at ?? clock()
      const cutoff = getGigExpiryCutoff(now)

      const [rejectedApplications, expiredGigs, deletedSessions, deletedAuthTokens] =
        await prisma.$transaction([
          prisma.application.updateMany({
            where: {
              status: 'PENDING',
              gig: {
                status: 'OPEN',
                scheduledAt: {
                  lte: cutoff,
                },
              },
            },
            data: {
              status: 'REJECTED',
            },
          }),
          prisma.gig.updateMany({
            where: {
              status: 'OPEN',
              scheduledAt: {
                lte: cutoff,
              },
            },
            data: {
              status: 'EXPIRED',
              expiredAt: now,
            },
          }),
          prisma.session.deleteMany({
            where: {
              expiresAt: {
                lte: now,
              },
            },
          }),
          prisma.authToken.deleteMany({
            where: {
              expiresAt: {
                lte: now,
              },
            },
          }),
        ])

      return {
        expiredGigs: expiredGigs.count,
        rejectedApplications: rejectedApplications.count,
        deletedSessions: deletedSessions.count,
        deletedAuthTokens: deletedAuthTokens.count,
      }
    },
  }
}
