import type { DatabaseClient } from '../../db/prisma.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { GigStatus, GigType } from '../../generated/prisma/enums.js'
import {
  AppError,
  ERROR_CODES,
  GigExpiredError,
  InvalidGigStateError,
  NotFoundError,
} from '../../lib/errors.js'
import { activeOpenGigWhere, isFutureSchedule, isGigExpired, lockGig } from './gig-lifecycle.js'
import type {
  CancelGigInput,
  GigWriteInput,
  ListGigsQuery,
  OwnerGigsQuery,
} from './gigs.schemas.js'

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

const ownerGigSummarySelect = {
  ...publicGigSummarySelect,
  canceledAt: true,
  cancellationReason: true,
  expiredAt: true,
  agreement: {
    select: {
      id: true,
    },
  },
  _count: {
    select: {
      applications: true,
    },
  },
} satisfies Prisma.GigSelect

const ownerGigDetailSelect = {
  ...publicGigDetailSelect,
  canceledAt: true,
  cancellationReason: true,
  expiredAt: true,
  agreement: {
    select: {
      id: true,
    },
  },
  address: {
    select: {
      street: true,
      number: true,
      complement: true,
      accessInstructions: true,
    },
  },
  _count: {
    select: {
      applications: true,
    },
  },
} satisfies Prisma.GigSelect

type GigSummaryRow = Prisma.GigGetPayload<{ select: typeof publicGigSummarySelect }>
type GigDetailRow = Prisma.GigGetPayload<{ select: typeof publicGigDetailSelect }>
type OwnerGigSummaryRow = Prisma.GigGetPayload<{ select: typeof ownerGigSummarySelect }>
type OwnerGigDetailRow = Prisma.GigGetPayload<{ select: typeof ownerGigDetailSelect }>

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

export interface OwnerGigAddressDto {
  street: string
  number: string
  complement: string | null
  accessInstructions: string | null
}

export interface OwnerGigSummaryDto extends PublicGigSummaryDto {
  applicationCount: number
  agreementId: string | null
  canceledAt: string | null
  cancellationReason: string | null
  expiredAt: string | null
}

export interface OwnerGigDetailDto extends OwnerGigSummaryDto {
  description: string
  updatedAt: string
  address: OwnerGigAddressDto | null
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

export interface OwnerGigListResult {
  items: OwnerGigSummaryDto[]
  meta: GigPaginationMeta
}

export interface GigsService {
  listPublicGigs(query: ListGigsQuery): Promise<PublicGigListResult>
  getPublicGig(gigId: string): Promise<PublicGigDetailDto>
  listOwnedGigs(userId: string, query: OwnerGigsQuery): Promise<OwnerGigListResult>
  getOwnedGig(gigId: string, userId: string): Promise<OwnerGigDetailDto>
  createGig(userId: string, input: GigWriteInput): Promise<OwnerGigDetailDto>
  updateGig(gigId: string, userId: string, input: GigWriteInput): Promise<OwnerGigDetailDto>
  cancelGig(gigId: string, userId: string, input: CancelGigInput): Promise<OwnerGigDetailDto>
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

export function toOwnerGigSummaryDto(gig: OwnerGigSummaryRow): OwnerGigSummaryDto {
  return {
    ...toPublicGigSummaryDto(gig),
    applicationCount: gig._count.applications,
    agreementId: gig.agreement?.id ?? null,
    canceledAt: gig.canceledAt?.toISOString() ?? null,
    cancellationReason: gig.cancellationReason,
    expiredAt: gig.expiredAt?.toISOString() ?? null,
  }
}

export function toOwnerGigDetailDto(gig: OwnerGigDetailRow): OwnerGigDetailDto {
  return {
    ...toPublicGigDetailDto(gig),
    applicationCount: gig._count.applications,
    agreementId: gig.agreement?.id ?? null,
    canceledAt: gig.canceledAt?.toISOString() ?? null,
    cancellationReason: gig.cancellationReason,
    expiredAt: gig.expiredAt?.toISOString() ?? null,
    address: gig.address
      ? {
          street: gig.address.street,
          number: gig.address.number,
          complement: gig.address.complement,
          accessInstructions: gig.address.accessInstructions,
        }
      : null,
  }
}

function scheduleValidationError(): AppError {
  return new AppError(
    ERROR_CODES.VALIDATION_ERROR,
    'A future scheduledAt is required to publish a gig.',
    400,
    {
      details: [
        {
          path: 'scheduledAt',
          message: 'Publishing requires a non-null scheduledAt in the future.',
        },
      ],
    },
  )
}

function gigWriteData(
  input: GigWriteInput,
  userId: string,
  publish: boolean,
): Prisma.GigCreateInput {
  return {
    employer: {
      connect: {
        id: userId,
      },
    },
    title: input.title,
    description: input.description,
    category: input.category,
    priceAmount: input.price.amount,
    currency: input.price.currency,
    estimatedDurationMinutes: input.estimatedDurationMinutes,
    scheduledAt: input.scheduledAt,
    city: input.city,
    location: input.location,
    type: input.type,
    status: publish ? 'OPEN' : 'DRAFT',
    address: {
      create: {
        street: input.address.street,
        number: input.address.number,
        complement: input.address.complement ?? null,
        accessInstructions: input.address.accessInstructions ?? null,
      },
    },
  }
}

export function createGigsService(
  prisma: DatabaseClient,
  clock: () => Date = () => new Date(),
): GigsService {
  return {
    async listPublicGigs(query) {
      const now = clock()
      const where: Prisma.GigWhereInput = {
        ...activeOpenGigWhere(now),
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
          ...activeOpenGigWhere(clock()),
        },
        select: publicGigDetailSelect,
      })

      if (!gig) {
        throw new NotFoundError('Gig not found.')
      }

      return toPublicGigDetailDto(gig)
    },

    async listOwnedGigs(userId, query) {
      const where: Prisma.GigWhereInput = {
        employerId: userId,
        ...(query.status ? { status: query.status } : {}),
      }

      const skip = (query.page - 1) * query.limit

      const [rows, total] = await prisma.$transaction([
        prisma.gig.findMany({
          where,
          select: ownerGigSummarySelect,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          skip,
          take: query.limit,
        }),
        prisma.gig.count({ where }),
      ])

      return {
        items: rows.map(toOwnerGigSummaryDto),
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
        },
      }
    },

    async getOwnedGig(gigId, userId) {
      const gig = await prisma.gig.findFirst({
        where: {
          id: gigId,
          employerId: userId,
        },
        select: ownerGigDetailSelect,
      })

      if (!gig) {
        throw new NotFoundError('Gig not found.')
      }

      return toOwnerGigDetailDto(gig)
    },

    async createGig(userId, input) {
      if (input.publish && !isFutureSchedule(input.scheduledAt, clock())) {
        throw scheduleValidationError()
      }

      const gig = await prisma.gig.create({
        data: gigWriteData(input, userId, input.publish),
        select: ownerGigDetailSelect,
      })

      return toOwnerGigDetailDto(gig)
    },

    async updateGig(gigId, userId, input) {
      return prisma.$transaction(async (transaction) => {
        await lockGig(transaction, gigId)

        const existing = await transaction.gig.findFirst({
          where: {
            id: gigId,
            employerId: userId,
          },
          select: {
            id: true,
            status: true,
          },
        })

        if (!existing) {
          throw new NotFoundError('Gig not found.')
        }

        if (existing.status !== 'DRAFT') {
          throw new InvalidGigStateError('Only draft gigs can be edited.')
        }

        if (input.publish && !isFutureSchedule(input.scheduledAt, clock())) {
          throw scheduleValidationError()
        }

        const gig = await transaction.gig.update({
          where: { id: gigId },
          data: {
            title: input.title,
            description: input.description,
            category: input.category,
            priceAmount: input.price.amount,
            currency: input.price.currency,
            estimatedDurationMinutes: input.estimatedDurationMinutes,
            scheduledAt: input.scheduledAt,
            city: input.city,
            location: input.location,
            type: input.type,
            ...(input.publish ? { status: 'OPEN' } : {}),
            address: {
              upsert: {
                create: {
                  street: input.address.street,
                  number: input.address.number,
                  complement: input.address.complement ?? null,
                  accessInstructions: input.address.accessInstructions ?? null,
                },
                update: {
                  street: input.address.street,
                  number: input.address.number,
                  complement: input.address.complement ?? null,
                  accessInstructions: input.address.accessInstructions ?? null,
                },
              },
            },
          },
          select: ownerGigDetailSelect,
        })

        return toOwnerGigDetailDto(gig)
      })
    },

    async cancelGig(gigId, userId, input) {
      return prisma.$transaction(async (transaction) => {
        await lockGig(transaction, gigId)

        const existing = await transaction.gig.findFirst({
          where: {
            id: gigId,
            employerId: userId,
          },
          select: {
            id: true,
            status: true,
            scheduledAt: true,
          },
        })

        if (!existing) {
          throw new NotFoundError('Gig not found.')
        }

        if (existing.status !== 'DRAFT' && existing.status !== 'OPEN') {
          throw new InvalidGigStateError('Only draft or open gigs can be canceled directly.')
        }

        if (existing.status === 'OPEN' && isGigExpired(existing.scheduledAt, clock())) {
          throw new GigExpiredError()
        }

        const now = clock()

        if (existing.status === 'OPEN') {
          await transaction.application.updateMany({
            where: {
              gigId,
              status: 'PENDING',
            },
            data: {
              status: 'REJECTED',
            },
          })
        }

        const gig = await transaction.gig.update({
          where: { id: gigId },
          data: {
            status: 'CANCELED',
            canceledAt: now,
            canceledById: userId,
            cancellationReason: input.reason ?? null,
          },
          select: ownerGigDetailSelect,
        })

        return toOwnerGigDetailDto(gig)
      })
    },
  }
}
