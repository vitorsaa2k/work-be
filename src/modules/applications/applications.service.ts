import type { DatabaseClient } from '../../db/prisma.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { AgreementStatus, ApplicationStatus } from '../../generated/prisma/enums.js'
import {
  AlreadyAppliedError,
  ApplicationNotPendingError,
  CannotApplyToOwnGigError,
  GigExpiredError,
  GigNotOpenError,
  NotFoundError,
} from '../../lib/errors.js'
import { isGigExpired, lockGig } from '../gigs/gig-lifecycle.js'
import type { PublicGigSummaryDto } from '../gigs/gigs.service.js'
import { toPublicGigSummaryDto } from '../gigs/gigs.service.js'
import type { ApplyToGigInput } from './applications.schemas.js'

const gigSummarySelect = {
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

const applicantSelect = {
  id: true,
  name: true,
  profile: {
    select: {
      bio: true,
      imageUrl: true,
      city: true,
      location: true,
    },
  },
} satisfies Prisma.UserSelect

const applicationSelect = {
  id: true,
  gigId: true,
  message: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  applicant: {
    select: applicantSelect,
  },
} satisfies Prisma.ApplicationSelect

const myApplicationSelect = {
  ...applicationSelect,
  gig: {
    select: {
      ...gigSummarySelect,
      agreement: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  },
} satisfies Prisma.ApplicationSelect

type ApplicationRow = Prisma.ApplicationGetPayload<{ select: typeof applicationSelect }>
type MyApplicationRow = Prisma.ApplicationGetPayload<{ select: typeof myApplicationSelect }>

export interface ApplicantDto {
  id: string
  name: string
  profile: {
    bio: string | null
    imageUrl: string | null
    city: string
    location: string | null
  } | null
}

export interface ApplicationDto {
  id: string
  gigId: string
  message: string | null
  status: ApplicationStatus
  createdAt: string
  updatedAt: string
  applicant: ApplicantDto
}

export interface MyApplicationDto extends ApplicationDto {
  gig: PublicGigSummaryDto
  agreementId: string | null
  agreementStatus: AgreementStatus | null
}

export interface OwnerApplicationsResult {
  gig: PublicGigSummaryDto & {
    agreementId: string | null
  }
  applications: ApplicationDto[]
}

export interface ApplicationsService {
  apply(gigId: string, userId: string, input: ApplyToGigInput): Promise<ApplicationDto>
  listForGig(gigId: string, ownerId: string): Promise<OwnerApplicationsResult>
  listMine(userId: string): Promise<MyApplicationDto[]>
  withdraw(applicationId: string, userId: string): Promise<ApplicationDto>
}

function toApplicantDto(applicant: ApplicationRow['applicant']): ApplicantDto {
  return {
    id: applicant.id,
    name: applicant.name,
    profile: applicant.profile
      ? {
          bio: applicant.profile.bio,
          imageUrl: applicant.profile.imageUrl,
          city: applicant.profile.city,
          location: applicant.profile.location,
        }
      : null,
  }
}

function toApplicationDto(application: ApplicationRow): ApplicationDto {
  return {
    id: application.id,
    gigId: application.gigId,
    message: application.message,
    status: application.status,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    applicant: toApplicantDto(application.applicant),
  }
}

function toMyApplicationDto(application: MyApplicationRow): MyApplicationDto {
  return {
    ...toApplicationDto(application),
    gig: toPublicGigSummaryDto(application.gig),
    agreementId: application.gig.agreement?.id ?? null,
    agreementStatus: application.gig.agreement?.status ?? null,
  }
}

export function createApplicationsService(
  prisma: DatabaseClient,
  clock: () => Date = () => new Date(),
): ApplicationsService {
  return {
    async apply(gigId, userId, input) {
      return prisma.$transaction(async (transaction) => {
        await lockGig(transaction, gigId)

        const gig = await transaction.gig.findUnique({
          where: { id: gigId },
          select: {
            id: true,
            employerId: true,
            status: true,
            scheduledAt: true,
          },
        })

        if (!gig) {
          throw new NotFoundError('Gig not found.')
        }

        if (gig.employerId === userId) {
          throw new CannotApplyToOwnGigError()
        }

        if (gig.status !== 'OPEN') {
          throw new GigNotOpenError()
        }

        if (isGigExpired(gig.scheduledAt, clock())) {
          throw new GigExpiredError()
        }

        const message = input.message?.trim() || null
        const existing = await transaction.application.findUnique({
          where: {
            gigId_applicantId: {
              gigId,
              applicantId: userId,
            },
          },
          select: {
            id: true,
            status: true,
          },
        })

        if (existing) {
          if (existing.status !== 'WITHDRAWN') {
            throw new AlreadyAppliedError()
          }

          const updated = await transaction.application.updateMany({
            where: {
              id: existing.id,
              status: 'WITHDRAWN',
            },
            data: {
              status: 'PENDING',
              message,
            },
          })

          if (updated.count !== 1) {
            throw new AlreadyAppliedError()
          }

          const application = await transaction.application.findUniqueOrThrow({
            where: { id: existing.id },
            select: applicationSelect,
          })

          return toApplicationDto(application)
        }

        const application = await transaction.application.create({
          data: {
            gigId,
            applicantId: userId,
            message,
          },
          select: applicationSelect,
        })

        return toApplicationDto(application)
      })
    },

    async listForGig(gigId, ownerId) {
      const gig = await prisma.gig.findFirst({
        where: {
          id: gigId,
          employerId: ownerId,
        },
        select: {
          ...gigSummarySelect,
          agreement: {
            select: {
              id: true,
            },
          },
        },
      })

      if (!gig) {
        throw new NotFoundError('Gig not found.')
      }

      const applications = await prisma.application.findMany({
        where: {
          gigId,
        },
        select: applicationSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })

      const { agreement, ...gigSummary } = gig

      return {
        gig: {
          ...toPublicGigSummaryDto(gigSummary),
          agreementId: agreement?.id ?? null,
        },
        applications: applications.map(toApplicationDto),
      }
    },

    async listMine(userId) {
      const applications = await prisma.application.findMany({
        where: {
          applicantId: userId,
        },
        select: myApplicationSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })

      return applications.map(toMyApplicationDto)
    },

    async withdraw(applicationId, userId) {
      const existing = await prisma.application.findFirst({
        where: {
          id: applicationId,
          applicantId: userId,
        },
        select: {
          id: true,
          status: true,
        },
      })

      if (!existing) {
        throw new NotFoundError('Application not found.')
      }

      if (existing.status !== 'PENDING') {
        throw new ApplicationNotPendingError()
      }

      const updated = await prisma.application.updateMany({
        where: {
          id: applicationId,
          applicantId: userId,
          status: 'PENDING',
        },
        data: {
          status: 'WITHDRAWN',
        },
      })

      if (updated.count !== 1) {
        throw new ApplicationNotPendingError()
      }

      const application = await prisma.application.findUniqueOrThrow({
        where: { id: applicationId },
        select: applicationSelect,
      })

      return toApplicationDto(application)
    },
  }
}
