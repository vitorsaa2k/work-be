import type { DatabaseClient } from '../../db/prisma.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { AgreementStatus, GigStatus, GigType } from '../../generated/prisma/enums.js'
import {
  ApplicationNotPendingError,
  GigExpiredError,
  InvalidAgreementStateError,
  InvalidGigStateError,
  NotFoundError,
} from '../../lib/errors.js'
import { isGigExpired, lockGig } from '../gigs/gig-lifecycle.js'
import type { CancelAgreementInput } from './agreements.schemas.js'

const agreementSelect = {
  id: true,
  gigId: true,
  employerId: true,
  workerId: true,
  agreedPriceAmount: true,
  currency: true,
  status: true,
  employerStartedAt: true,
  workerStartedAt: true,
  startedAt: true,
  employerCompletedAt: true,
  workerCompletedAt: true,
  completedAt: true,
  canceledAt: true,
  canceledById: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
  employer: {
    select: {
      id: true,
      name: true,
    },
  },
  worker: {
    select: {
      id: true,
      name: true,
    },
  },
  gig: {
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      priceAmount: true,
      currency: true,
      estimatedDurationMinutes: true,
      scheduledAt: true,
      city: true,
      location: true,
      type: true,
      status: true,
    },
  },
} satisfies Prisma.AgreementSelect

type AgreementRow = Prisma.AgreementGetPayload<{ select: typeof agreementSelect }>

export type AgreementRole = 'EMPLOYER' | 'WORKER'

export interface AgreementGigDto {
  id: string
  title: string
  description: string
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
}

export interface AgreementDto {
  id: string
  gigId: string
  status: AgreementStatus
  price: {
    amount: number
    currency: string
  }
  employerStartedAt: string | null
  workerStartedAt: string | null
  startedAt: string | null
  employerCompletedAt: string | null
  workerCompletedAt: string | null
  completedAt: string | null
  canceledAt: string | null
  canceledById: string | null
  cancellationReason: string | null
  createdAt: string
  updatedAt: string
  viewerRole: AgreementRole
  employer: {
    id: string
    name: string
  }
  worker: {
    id: string
    name: string
  }
  gig: AgreementGigDto
}

export interface AgreementAddressDto {
  street: string
  number: string
  complement: string | null
  accessInstructions: string | null
  city: string
  location: string
}

export interface AgreementsService {
  selectWorker(gigId: string, applicationId: string, employerId: string): Promise<AgreementDto>
  get(agreementId: string, userId: string): Promise<AgreementDto>
  getAddress(agreementId: string, userId: string): Promise<AgreementAddressDto>
  confirmStart(agreementId: string, userId: string): Promise<AgreementDto>
  confirmCompletion(agreementId: string, userId: string): Promise<AgreementDto>
  cancel(agreementId: string, userId: string, input: CancelAgreementInput): Promise<AgreementDto>
}

function roleFor(
  agreement: Pick<AgreementRow, 'employerId' | 'workerId'>,
  userId: string,
): AgreementRole {
  return agreement.employerId === userId ? 'EMPLOYER' : 'WORKER'
}

function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null
}

function toAgreementDto(agreement: AgreementRow, userId: string): AgreementDto {
  return {
    id: agreement.id,
    gigId: agreement.gigId,
    status: agreement.status,
    price: {
      amount: agreement.agreedPriceAmount,
      currency: agreement.currency,
    },
    employerStartedAt: toIso(agreement.employerStartedAt),
    workerStartedAt: toIso(agreement.workerStartedAt),
    startedAt: toIso(agreement.startedAt),
    employerCompletedAt: toIso(agreement.employerCompletedAt),
    workerCompletedAt: toIso(agreement.workerCompletedAt),
    completedAt: toIso(agreement.completedAt),
    canceledAt: toIso(agreement.canceledAt),
    canceledById: agreement.canceledById,
    cancellationReason: agreement.cancellationReason,
    createdAt: agreement.createdAt.toISOString(),
    updatedAt: agreement.updatedAt.toISOString(),
    viewerRole: roleFor(agreement, userId),
    employer: {
      id: agreement.employer.id,
      name: agreement.employer.name,
    },
    worker: {
      id: agreement.worker.id,
      name: agreement.worker.name,
    },
    gig: {
      id: agreement.gig.id,
      title: agreement.gig.title,
      description: agreement.gig.description,
      category: agreement.gig.category,
      price: {
        amount: agreement.gig.priceAmount,
        currency: agreement.gig.currency,
      },
      estimatedDurationMinutes: agreement.gig.estimatedDurationMinutes,
      scheduledAt: toIso(agreement.gig.scheduledAt),
      city: agreement.gig.city,
      location: agreement.gig.location,
      type: agreement.gig.type,
      status: agreement.gig.status,
    },
  }
}

function participantWhere(agreementId: string, userId: string): Prisma.AgreementWhereInput {
  return {
    id: agreementId,
    OR: [{ employerId: userId }, { workerId: userId }],
  }
}

async function lockAgreement(
  transaction: Prisma.TransactionClient,
  agreementId: string,
): Promise<void> {
  await transaction.$queryRaw`SELECT "id" FROM "agreements" WHERE "id" = ${agreementId}::uuid FOR UPDATE`
}

async function findParticipantAgreement(
  transaction: Prisma.TransactionClient,
  agreementId: string,
  userId: string,
): Promise<AgreementRow> {
  const agreement = await transaction.agreement.findFirst({
    where: participantWhere(agreementId, userId),
    select: agreementSelect,
  })

  if (!agreement) {
    throw new NotFoundError('Agreement not found.')
  }

  return agreement
}

export function createAgreementsService(
  prisma: DatabaseClient,
  clock: () => Date = () => new Date(),
): AgreementsService {
  return {
    async selectWorker(gigId, applicationId, employerId) {
      return prisma.$transaction(async (transaction) => {
        await lockGig(transaction, gigId)

        const gig = await transaction.gig.findUnique({
          where: { id: gigId },
          select: {
            id: true,
            employerId: true,
            status: true,
            scheduledAt: true,
            priceAmount: true,
            currency: true,
          },
        })

        if (!gig || gig.employerId !== employerId) {
          throw new NotFoundError('Gig not found.')
        }

        if (gig.status !== 'OPEN') {
          throw new InvalidGigStateError('Only open gigs can be assigned.')
        }

        if (isGigExpired(gig.scheduledAt, clock())) {
          throw new GigExpiredError()
        }

        const application = await transaction.application.findFirst({
          where: {
            id: applicationId,
            gigId,
          },
          select: {
            id: true,
            applicantId: true,
            status: true,
          },
        })

        if (!application) {
          throw new NotFoundError('Application not found.')
        }

        if (application.status !== 'PENDING') {
          throw new ApplicationNotPendingError('Only pending applications can be selected.')
        }

        if (application.applicantId === employerId) {
          throw new InvalidGigStateError('The gig owner cannot be selected as the worker.')
        }

        const accepted = await transaction.application.updateMany({
          where: {
            id: applicationId,
            gigId,
            status: 'PENDING',
          },
          data: {
            status: 'ACCEPTED',
          },
        })

        if (accepted.count !== 1) {
          throw new ApplicationNotPendingError('Only pending applications can be selected.')
        }

        await transaction.application.updateMany({
          where: {
            gigId,
            status: 'PENDING',
            id: { not: applicationId },
          },
          data: {
            status: 'REJECTED',
          },
        })

        await transaction.gig.update({
          where: { id: gigId },
          data: {
            status: 'ASSIGNED',
          },
        })

        const agreement = await transaction.agreement.create({
          data: {
            gigId,
            employerId,
            workerId: application.applicantId,
            agreedPriceAmount: gig.priceAmount,
            currency: gig.currency,
          },
          select: agreementSelect,
        })

        return toAgreementDto(agreement, employerId)
      })
    },

    async get(agreementId, userId) {
      const agreement = await prisma.agreement.findFirst({
        where: participantWhere(agreementId, userId),
        select: agreementSelect,
      })

      if (!agreement) {
        throw new NotFoundError('Agreement not found.')
      }

      return toAgreementDto(agreement, userId)
    },

    async getAddress(agreementId, userId) {
      const agreement = await prisma.agreement.findFirst({
        where: participantWhere(agreementId, userId),
        select: {
          gig: {
            select: {
              city: true,
              location: true,
              address: {
                select: {
                  street: true,
                  number: true,
                  complement: true,
                  accessInstructions: true,
                },
              },
            },
          },
        },
      })

      if (!agreement) {
        throw new NotFoundError('Agreement not found.')
      }

      if (!agreement.gig.address) {
        throw new NotFoundError('Address not found.')
      }

      return {
        street: agreement.gig.address.street,
        number: agreement.gig.address.number,
        complement: agreement.gig.address.complement,
        accessInstructions: agreement.gig.address.accessInstructions,
        city: agreement.gig.city,
        location: agreement.gig.location,
      }
    },

    async confirmStart(agreementId, userId) {
      return prisma.$transaction(async (transaction) => {
        await lockAgreement(transaction, agreementId)
        const agreement = await findParticipantAgreement(transaction, agreementId, userId)

        if (agreement.status === 'IN_PROGRESS') {
          return toAgreementDto(agreement, userId)
        }

        if (agreement.status !== 'ASSIGNED') {
          throw new InvalidAgreementStateError('Only assigned agreements can be started.')
        }

        if (agreement.gig.status !== 'ASSIGNED') {
          throw new InvalidAgreementStateError('The gig is not ready to start.')
        }

        const now = clock()
        const role = roleFor(agreement, userId)
        const employerStartedAt =
          role === 'EMPLOYER' && agreement.employerStartedAt === null
            ? now
            : agreement.employerStartedAt
        const workerStartedAt =
          role === 'WORKER' && agreement.workerStartedAt === null ? now : agreement.workerStartedAt
        const bothStarted = employerStartedAt !== null && workerStartedAt !== null
        const updateData: Prisma.AgreementUncheckedUpdateInput = {
          employerStartedAt,
          workerStartedAt,
          ...(bothStarted
            ? {
                status: 'IN_PROGRESS',
                startedAt: agreement.startedAt ?? now,
              }
            : {}),
        }

        await transaction.agreement.update({
          where: { id: agreementId },
          data: updateData,
        })

        if (bothStarted) {
          await transaction.gig.update({
            where: { id: agreement.gigId },
            data: {
              status: 'IN_PROGRESS',
            },
          })
        }

        const updated = await transaction.agreement.findUniqueOrThrow({
          where: { id: agreementId },
          select: agreementSelect,
        })

        return toAgreementDto(updated, userId)
      })
    },

    async confirmCompletion(agreementId, userId) {
      return prisma.$transaction(async (transaction) => {
        await lockAgreement(transaction, agreementId)
        const agreement = await findParticipantAgreement(transaction, agreementId, userId)

        if (agreement.status === 'COMPLETED') {
          return toAgreementDto(agreement, userId)
        }

        if (agreement.status !== 'IN_PROGRESS') {
          throw new InvalidAgreementStateError('Only in-progress agreements can be completed.')
        }

        if (agreement.gig.status !== 'IN_PROGRESS') {
          throw new InvalidAgreementStateError('The gig is not in progress.')
        }

        if (agreement.startedAt === null) {
          throw new InvalidAgreementStateError('The agreement has not started.')
        }

        const now = clock()
        const role = roleFor(agreement, userId)
        const employerCompletedAt =
          role === 'EMPLOYER' && agreement.employerCompletedAt === null
            ? now
            : agreement.employerCompletedAt
        const workerCompletedAt =
          role === 'WORKER' && agreement.workerCompletedAt === null
            ? now
            : agreement.workerCompletedAt
        const bothCompleted = employerCompletedAt !== null && workerCompletedAt !== null
        const updateData: Prisma.AgreementUncheckedUpdateInput = {
          employerCompletedAt,
          workerCompletedAt,
          ...(bothCompleted
            ? {
                status: 'COMPLETED',
                completedAt: agreement.completedAt ?? now,
              }
            : {}),
        }

        await transaction.agreement.update({
          where: { id: agreementId },
          data: updateData,
        })

        if (bothCompleted) {
          await transaction.gig.update({
            where: { id: agreement.gigId },
            data: {
              status: 'COMPLETED',
            },
          })
        }

        const updated = await transaction.agreement.findUniqueOrThrow({
          where: { id: agreementId },
          select: agreementSelect,
        })

        return toAgreementDto(updated, userId)
      })
    },

    async cancel(agreementId, userId, input) {
      return prisma.$transaction(async (transaction) => {
        await lockAgreement(transaction, agreementId)
        const agreement = await findParticipantAgreement(transaction, agreementId, userId)

        if (agreement.status !== 'ASSIGNED' || agreement.startedAt !== null) {
          throw new InvalidAgreementStateError(
            'Only agreements that have not started can be canceled.',
          )
        }

        if (agreement.gig.status !== 'ASSIGNED') {
          throw new InvalidAgreementStateError('The gig cannot be canceled.')
        }

        const now = clock()

        await transaction.agreement.update({
          where: { id: agreementId },
          data: {
            status: 'CANCELED',
            canceledAt: now,
            canceledById: userId,
            cancellationReason: input.reason ?? null,
          },
        })

        await transaction.gig.update({
          where: { id: agreement.gigId },
          data: {
            status: 'CANCELED',
            canceledAt: now,
            canceledById: userId,
            cancellationReason: input.reason ?? null,
          },
        })

        await transaction.application.updateMany({
          where: {
            gigId: agreement.gigId,
            status: 'PENDING',
          },
          data: {
            status: 'REJECTED',
          },
        })

        const updated = await transaction.agreement.findUniqueOrThrow({
          where: { id: agreementId },
          select: agreementSelect,
        })

        return toAgreementDto(updated, userId)
      })
    },
  }
}
