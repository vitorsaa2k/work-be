import type { DatabaseClient } from '../../db/prisma.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { GigStatus, GigType } from '../../generated/prisma/enums.js'
import { NotFoundError } from '../../lib/errors.js'
import type { ListGigsQuery } from './gigs.schemas.js'

const publicGigSummarySelect = {
  id: true,
  title: true,
  category: true,
  priceAmount: true,
  currency: true,
  estimatedDurationMinutes: true,
  scheduledAt: true,
  city: true,
  location: true,
  type: true,
  status: true,
  createdAt: true,
  employer: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.GigSelect

const publicGigDetailSelect = {
  ...publicGigSummarySelect,
  description: true,
  updatedAt: true,
} satisfies Prisma.GigSelect

type GigSummaryRow = Prisma.GigGetPayload<{ select: typeof publicGigSummarySelect }>
type GigDetailRow = Prisma.GigGetPayload<{ select: typeof publicGigDetailSelect }>

export interface PublicGigSummaryDto {
  id: string
  title: string
  category: string
  price: {
    amount: number
    currency: string
  }
  estimatedDurationMinutes: number
  scheduledAt: string | null
  city: string
  location: string
  type: GigType
  status: GigStatus
  createdAt: string
  employer: {
    id: string
    name: string
  }
}

export interface PublicGigDetailDto extends PublicGigSummaryDto {
  description: string
  updatedAt: string
}

export interface GigPaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PublicGigListResult {
  items: PublicGigSummaryDto[]
  meta: GigPaginationMeta
}

export interface GigsService {
  listPublicGigs(query: ListGigsQuery): Promise<PublicGigListResult>
  getPublicGig(gigId: string): Promise<PublicGigDetailDto>
}

export function toPublicGigSummaryDto(gig: GigSummaryRow): PublicGigSummaryDto {
  return {
    id: gig.id,
    title: gig.title,
    category: gig.category,
    price: {
      amount: gig.priceAmount,
      currency: gig.currency,
    },
    estimatedDurationMinutes: gig.estimatedDurationMinutes,
    scheduledAt: gig.scheduledAt?.toISOString() ?? null,
    city: gig.city,
    location: gig.location,
    type: gig.type,
    status: gig.status,
    createdAt: gig.createdAt.toISOString(),
    employer: {
      id: gig.employer.id,
      name: gig.employer.name,
    },
  }
}

export function toPublicGigDetailDto(gig: GigDetailRow): PublicGigDetailDto {
  return {
    ...toPublicGigSummaryDto(gig),
    description: gig.description,
    updatedAt: gig.updatedAt.toISOString(),
  }
}

export function createGigsService(prisma: DatabaseClient): GigsService {
  return {
    async listPublicGigs(query) {
      const where: Prisma.GigWhereInput = {
        status: query.status ?? 'OPEN',
        ...(query.city
          ? {
              city: {
                equals: query.city,
                mode: 'insensitive',
              },
            }
          : {}),
        ...(query.category
          ? {
              category: {
                equals: query.category,
                mode: 'insensitive',
              },
            }
          : {}),
      }

      const skip = (query.page - 1) * query.limit

      const [rows, total] = await prisma.$transaction([
        prisma.gig.findMany({
          where,
          select: publicGigSummarySelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take: query.limit,
        }),
        prisma.gig.count({ where }),
      ])

      return {
        items: rows.map(toPublicGigSummaryDto),
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
        },
      }
    },

    async getPublicGig(gigId) {
      const gig = await prisma.gig.findFirst({
        where: {
          id: gigId,
          status: 'OPEN',
        },
        select: publicGigDetailSelect,
      })

      if (!gig) {
        throw new NotFoundError('Gig not found.')
      }

      return toPublicGigDetailDto(gig)
    },
  }
}
