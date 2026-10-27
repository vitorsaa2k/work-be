import { randomBytes } from 'node:crypto'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../../src/app.js'
import type { DatabaseClient } from '../../src/db/prisma.js'
import { hashPassword } from '../../src/lib/passwords.js'
import { createApplicationsService } from '../../src/modules/applications/applications.service.js'
import { createAgreementsService } from '../../src/modules/agreements/agreements.service.js'
import { createAuthService } from '../../src/modules/auth/auth.service.js'
import { createGigsService } from '../../src/modules/gigs/gigs.service.js'
import { createHealthService } from '../../src/modules/health/health.service.js'
import { createMaintenanceService } from '../../src/modules/maintenance/maintenance.service.js'
import { login, requestJson, TEST_PASSWORD } from '../helpers/auth.js'
import { silentLogger, testAuthConfig } from '../helpers/app.js'
import { createTestDatabaseClient, resetTestDatabase } from '../helpers/database.js'
import { createAgreement, createApplication, createGig, createUser } from '../helpers/fixtures.js'
import { createCapturingAuthMailer } from '../helpers/mailer.js'
import { hasTestDatabase } from '../setup/test-database.js'

interface ErrorBody {
  error: {
    code: string
    message: string
    details?: Array<{ path: string; message: string }>
  }
}

interface UserFixture {
  id: string
  name: string
  email: string
  Cookie: string
}

interface GigBody {
  data: {
    id: string
    status: string
    title: string
    applicationCount: number
    agreementId: string | null
    address: {
      street: string
      number: string
      complement: string | null
      accessInstructions: string | null
    } | null
  }
}

interface ApplicationBody {
  data: {
    id: string
    status: string
    message: string | null
  }
}

interface AgreementBody {
  data: {
    id: string
    status: string
    startedAt: string | null
    workerStartedAt: string | null
    employerStartedAt: string | null
    completedAt: string | null
    workerCompletedAt: string | null
    employerCompletedAt: string | null
    canceledAt: string | null
    viewerRole: string
    gig: {
      id: string
      status: string
    }
  }
}

function futureIso(hours = 48): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

function gigPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Ajuda para montar uma estante',
    description: 'Preciso de ajuda para montar uma estante de sala com ferramentas simples.',
    category: 'Montagem de mueis',
    price: {
      amount: 18_000,
      currency: 'BRL',
    },
    estimatedDurationMinutes: 120,
    scheduledAt: futureIso(),
    city: 'Sao Paulo',
    location: 'Vila Mariana',
    type: 'PERSONAL',
    address: {
      street: 'Rua Privada',
      number: '123',
      complement: 'Apto 42',
      accessInstructions: 'Usar o portao lateral.',
    },
    publish: true,
    ...overrides,
  }
}

describe.skipIf(!hasTestDatabase)('marketplace write flows with PostgreSQL', () => {
  let prisma: DatabaseClient | undefined
  let app: ReturnType<typeof createApp> | undefined
  let passwordHash: string | undefined

  const context = (): {
    prisma: DatabaseClient
    app: ReturnType<typeof createApp>
    passwordHash: string
  } => {
    if (!prisma || !app || !passwordHash) {
      throw new Error('The test context is not initialized.')
    }

    return { prisma, app, passwordHash }
  }

  beforeAll(async () => {
    if (!hasTestDatabase) {
      return
    }

    const client = createTestDatabaseClient()
    const hash = await hashPassword(TEST_PASSWORD)
    const authConfig = testAuthConfig
    const authService = createAuthService(client, authConfig, createCapturingAuthMailer())

    prisma = client
    passwordHash = hash
    app = createApp({
      config: {
        frontendOrigin: 'http://localhost:5173',
        auth: authConfig,
      },
      logger: silentLogger,
      healthService: createHealthService(async () => client.$queryRaw`SELECT 1`),
      gigsService: createGigsService(client),
      applicationsService: createApplicationsService(client),
      agreementsService: createAgreementsService(client),
      authService,
    })
  })

  beforeEach(async () => {
    if (prisma) {
      await resetTestDatabase(prisma)
    }
  })

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect()
    }
  })

  async function createSessionUser(
    name: string,
    email: string,
    verified = true,
  ): Promise<UserFixture> {
    const { prisma, app, passwordHash } = context()
    const user = await createUser(prisma, {
      name,
      email,
      passwordHash,
      emailVerifiedAt: verified ? new Date() : null,
    })
    const session = await login(app, email)

    return {
      ...user,
      ...session,
    }
  }

  async function createOpenGig(employer: UserFixture, overrides: Record<string, unknown> = {}) {
    const { app } = context()
    const result = await requestJson<GigBody>(
      app,
      'POST',
      '/api/v1/gigs',
      gigPayload(overrides),
      employer,
    )

    expect(result.response.status).toBe(201)

    return result.body.data
  }

  it('allows unverified accounts to log in but blocks marketplace writes', async () => {
    const { app } = context()
    const unverified = await createSessionUser('Unverified User', 'unverified@example.test', false)
    const verified = await createSessionUser('Verified User', 'verified@example.test')

    const blocked = await requestJson<ErrorBody>(
      app,
      'POST',
      '/api/v1/gigs',
      gigPayload(),
      unverified,
    )

    expect(blocked.response.status).toBe(403)
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED')

    const allowed = await requestJson<GigBody>(app, 'POST', '/api/v1/gigs', gigPayload(), verified)

    expect(allowed.response.status).toBe(201)
    expect(allowed.body.data.status).toBe('OPEN')
  })

  it('supports draft creation, draft-only editing, publishing, privacy, and cancellation', async () => {
    const { prisma, app } = context()
    const employer = await createSessionUser('Employer', 'employer@example.test')
    const other = await createSessionUser('Other', 'other@example.test')

    const draft = await requestJson<GigBody>(
      app,
      'POST',
      '/api/v1/gigs',
      gigPayload({ publish: false, scheduledAt: null }),
      employer,
    )

    expect(draft.response.status).toBe(201)
    expect(draft.body.data.status).toBe('DRAFT')
    expect(draft.body.data.address?.street).toBe('Rua Privada')

    const privateDraft = await requestJson<GigBody>(
      app,
      'GET',
      `/api/v1/gigs/${draft.body.data.id}/private`,
      undefined,
      employer,
    )
    expect(privateDraft.response.status).toBe(200)
    expect(privateDraft.body.data.address?.street).toBe('Rua Privada')

    const otherPrivate = await requestJson<ErrorBody>(
      app,
      'GET',
      `/api/v1/gigs/${draft.body.data.id}/private`,
      undefined,
      other,
    )
    expect(otherPrivate.response.status).toBe(404)

    const hiddenDraft = await requestJson<{ data: unknown[] }>(app, 'GET', '/api/v1/gigs')
    expect(hiddenDraft.body.data).toHaveLength(0)

    const published = await requestJson<GigBody>(
      app,
      'PATCH',
      `/api/v1/gigs/${draft.body.data.id}`,
      gigPayload(),
      employer,
    )
    expect(published.response.status).toBe(200)
    expect(published.body.data.status).toBe('OPEN')

    const publicList = await requestJson<{ data: Array<Record<string, unknown>> }>(
      app,
      'GET',
      '/api/v1/gigs',
    )
    expect(publicList.body.data).toHaveLength(1)
    expect(JSON.stringify(publicList.body)).not.toContain('Rua Privada')
    expect(JSON.stringify(publicList.body)).not.toContain('Usar o portao lateral')

    const publicDetail = await requestJson<{ data: Record<string, unknown> }>(
      app,
      'GET',
      `/api/v1/gigs/${draft.body.data.id}`,
    )
    expect(publicDetail.response.status).toBe(200)
    expect(JSON.stringify(publicDetail.body)).not.toContain('Rua Privada')

    const editPublished = await requestJson<ErrorBody>(
      app,
      'PATCH',
      `/api/v1/gigs/${draft.body.data.id}`,
      gigPayload(),
      employer,
    )
    expect(editPublished.response.status).toBe(409)
    expect(editPublished.body.error.code).toBe('INVALID_GIG_STATE')

    const pendingApplication = await requestJson<ApplicationBody>(
      app,
      'POST',
      `/api/v1/gigs/${draft.body.data.id}/applications`,
      {},
      other,
    )
    expect(pendingApplication.response.status).toBe(201)

    const canceled = await requestJson<GigBody>(
      app,
      'POST',
      `/api/v1/gigs/${draft.body.data.id}/cancel`,
      { reason: 'Schedule changed' },
      employer,
    )
    expect(canceled.response.status).toBe(200)
    expect(canceled.body.data.status).toBe('CANCELED')

    const rejectedApplication = await prisma.application.findUniqueOrThrow({
      where: { id: pendingApplication.body.data.id },
      select: { status: true },
    })
    expect(rejectedApplication.status).toBe('REJECTED')

    const canceledDetail = await requestJson<ErrorBody>(
      app,
      'GET',
      `/api/v1/gigs/${draft.body.data.id}`,
    )
    expect(canceledDetail.response.status).toBe(404)

    const cancelAgain = await requestJson<ErrorBody>(
      app,
      'POST',
      `/api/v1/gigs/${draft.body.data.id}/cancel`,
      {},
      employer,
    )
    expect(cancelAgain.response.status).toBe(409)
    expect(cancelAgain.body.error.code).toBe('INVALID_GIG_STATE')

    const pastPublish = await requestJson<ErrorBody>(
      app,
      'POST',
      '/api/v1/gigs',
      gigPayload({ scheduledAt: new Date(Date.now() - 60_000).toISOString() }),
      employer,
    )
    expect(pastPublish.response.status).toBe(400)
    expect(pastPublish.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('handles applications, withdrawal, and transactional worker selection', async () => {
    const { prisma, app } = context()
    const employer = await createSessionUser('Employer', 'employer@example.test')
    const worker = await createSessionUser('Worker', 'worker@example.test')
    const otherWorker = await createSessionUser('Other Worker', 'other-worker@example.test')
    const outsider = await createSessionUser('Outsider', 'outsider@example.test')
    const gig = await createOpenGig(employer)

    const ownApplication = await requestJson<ErrorBody>(
      app,
      'POST',
      `/api/v1/gigs/${gig.id}/applications`,
      { message: 'I can do it.' },
      employer,
    )
    expect(ownApplication.response.status).toBe(403)
    expect(ownApplication.body.error.code).toBe('CANNOT_APPLY_TO_OWN_GIG')

    const workerApplication = await requestJson<ApplicationBody>(
      app,
      'POST',
      `/api/v1/gigs/${gig.id}/applications`,
      { message: 'I can help.' },
      worker,
    )
    expect(workerApplication.response.status).toBe(201)
    expect(workerApplication.body.data.status).toBe('PENDING')

    const duplicate = await requestJson<ErrorBody>(
      app,
      'POST',
      `/api/v1/gigs/${gig.id}/applications`,
      { message: 'Again.' },
      worker,
    )
    expect(duplicate.response.status).toBe(409)
    expect(duplicate.body.error.code).toBe('ALREADY_APPLIED')

    const otherApplication = await requestJson<ApplicationBody>(
      app,
      'POST',
      `/api/v1/gigs/${gig.id}/applications`,
      { message: 'Me too.' },
      otherWorker,
    )
    expect(otherApplication.response.status).toBe(201)

    const ownerList = await requestJson<{
      data: {
        gig: { agreementId: string | null }
        applications: Array<{ id: string; status: string }>
      }
    }>(app, 'GET', `/api/v1/gigs/${gig.id}/applications`, undefined, employer)
    expect(ownerList.response.status).toBe(200)
    expect(ownerList.body.data.applications).toHaveLength(2)
    expect(ownerList.body.data.gig.agreementId).toBeNull()

    const outsiderList = await requestJson<ErrorBody>(
      app,
      'GET',
      `/api/v1/gigs/${gig.id}/applications`,
      undefined,
      outsider,
    )
    expect(outsiderList.response.status).toBe(404)

    const withdrawn = await requestJson<ApplicationBody>(
      app,
      'POST',
      `/api/v1/applications/${workerApplication.body.data.id}/withdraw`,
      undefined,
      worker,
    )
    expect(withdrawn.response.status).toBe(200)
    expect(withdrawn.body.data.status).toBe('WITHDRAWN')

    const reapplied = await requestJson<ApplicationBody>(
      app,
      'POST',
      `/api/v1/gigs/${gig.id}/applications`,
      { message: 'I am available again.' },
      worker,
    )
    expect(reapplied.response.status).toBe(201)
    expect(reapplied.body.data.status).toBe('PENDING')

    const unauthorizedSelection = await requestJson<ErrorBody>(
      app,
      'POST',
      `/api/v1/gigs/${gig.id}/select-worker`,
      { applicationId: workerApplication.body.data.id },
      outsider,
    )
    expect(unauthorizedSelection.response.status).toBe(404)

    const selected = await requestJson<AgreementBody>(
      app,
      'POST',
      `/api/v1/gigs/${gig.id}/select-worker`,
      { applicationId: workerApplication.body.data.id },
      employer,
    )
    expect(selected.response.status).toBe(201)
    expect(selected.body.data.status).toBe('ASSIGNED')
    expect(selected.body.data.viewerRole).toBe('EMPLOYER')
    expect(selected.body.data.gig.status).toBe('ASSIGNED')

    const gigAfterSelection = await prisma.gig.findUniqueOrThrow({
      where: { id: gig.id },
      select: { status: true },
    })
    expect(gigAfterSelection.status).toBe('ASSIGNED')

    const applicationsAfterSelection = await prisma.application.findMany({
      where: { gigId: gig.id },
      select: { id: true, status: true },
    })
    expect(
      applicationsAfterSelection.find(
        (application) => application.id === workerApplication.body.data.id,
      )?.status,
    ).toBe('ACCEPTED')
    expect(
      applicationsAfterSelection.find(
        (application) => application.id === otherApplication.body.data.id,
      )?.status,
    ).toBe('REJECTED')

    const secondSelection = await requestJson<ErrorBody>(
      app,
      'POST',
      `/api/v1/gigs/${gig.id}/select-worker`,
      { applicationId: otherApplication.body.data.id },
      employer,
    )
    expect(secondSelection.response.status).toBe(409)

    const agreementForWorker = await requestJson<AgreementBody>(
      app,
      'GET',
      `/api/v1/agreements/${selected.body.data.id}`,
      undefined,
      worker,
    )
    expect(agreementForWorker.response.status).toBe(200)
    expect(agreementForWorker.body.data.viewerRole).toBe('WORKER')

    const agreementForOutsider = await requestJson<ErrorBody>(
      app,
      'GET',
      `/api/v1/agreements/${selected.body.data.id}`,
      undefined,
      outsider,
    )
    expect(agreementForOutsider.response.status).toBe(404)

    const address = await requestJson<{ data: { street: string } }>(
      app,
      'GET',
      `/api/v1/agreements/${selected.body.data.id}/address`,
      undefined,
      worker,
    )
    expect(address.response.status).toBe(200)
    expect(address.body.data.street).toBe('Rua Privada')

    const outsiderAddress = await requestJson<ErrorBody>(
      app,
      'GET',
      `/api/v1/agreements/${selected.body.data.id}/address`,
      undefined,
      outsider,
    )
    expect(outsiderAddress.response.status).toBe(404)

    const withdrawAccepted = await requestJson<ErrorBody>(
      app,
      'POST',
      `/api/v1/applications/${workerApplication.body.data.id}/withdraw`,
      undefined,
      worker,
    )
    expect(withdrawAccepted.response.status).toBe(409)
    expect(withdrawAccepted.body.error.code).toBe('APPLICATION_NOT_PENDING')
  })

  it('requires both parties to start and complete, and allows pre-start cancellation', async () => {
    const { prisma, app } = context()
    const employer = await createSessionUser('Employer', 'employer@example.test')
    const worker = await createSessionUser('Worker', 'worker@example.test')

    const gig = await createGig(prisma, {
      employerId: employer.id,
      status: 'ASSIGNED',
      scheduledAt: new Date(futureIso()),
      address: { street: 'Rua do Acordo', number: '10' },
    })
    const agreement = await createAgreement(prisma, {
      gigId: gig.id,
      employerId: employer.id,
      workerId: worker.id,
    })

    const completionBeforeStart = await requestJson<ErrorBody>(
      app,
      'POST',
      `/api/v1/agreements/${agreement.id}/confirm-completion`,
      undefined,
      worker,
    )
    expect(completionBeforeStart.response.status).toBe(409)
    expect(completionBeforeStart.body.error.code).toBe('INVALID_AGREEMENT_STATE')

    const workerStart = await requestJson<AgreementBody>(
      app,
      'POST',
      `/api/v1/agreements/${agreement.id}/start`,
      undefined,
      worker,
    )
    expect(workerStart.response.status).toBe(200)
    expect(workerStart.body.data.status).toBe('ASSIGNED')
    expect(workerStart.body.data.workerStartedAt).not.toBeNull()
    expect(workerStart.body.data.startedAt).toBeNull()

    const employerStart = await requestJson<AgreementBody>(
      app,
      'POST',
      `/api/v1/agreements/${agreement.id}/start`,
      undefined,
      employer,
    )
    expect(employerStart.response.status).toBe(200)
    expect(employerStart.body.data.status).toBe('IN_PROGRESS')
    expect(employerStart.body.data.startedAt).not.toBeNull()
    expect(employerStart.body.data.gig.status).toBe('IN_PROGRESS')

    const cancelAfterStart = await requestJson<ErrorBody>(
      app,
      'POST',
      `/api/v1/agreements/${agreement.id}/cancel`,
      {},
      worker,
    )
    expect(cancelAfterStart.response.status).toBe(409)
    expect(cancelAfterStart.body.error.code).toBe('INVALID_AGREEMENT_STATE')

    const workerCompletion = await requestJson<AgreementBody>(
      app,
      'POST',
      `/api/v1/agreements/${agreement.id}/confirm-completion`,
      undefined,
      worker,
    )
    expect(workerCompletion.response.status).toBe(200)
    expect(workerCompletion.body.data.status).toBe('IN_PROGRESS')
    expect(workerCompletion.body.data.workerCompletedAt).not.toBeNull()
    expect(workerCompletion.body.data.completedAt).toBeNull()

    const employerCompletion = await requestJson<AgreementBody>(
      app,
      'POST',
      `/api/v1/agreements/${agreement.id}/confirm-completion`,
      undefined,
      employer,
    )
    expect(employerCompletion.response.status).toBe(200)
    expect(employerCompletion.body.data.status).toBe('COMPLETED')
    expect(employerCompletion.body.data.completedAt).not.toBeNull()
    expect(employerCompletion.body.data.gig.status).toBe('COMPLETED')

    const completedGig = await prisma.gig.findUniqueOrThrow({
      where: { id: gig.id },
      select: { status: true },
    })
    expect(completedGig.status).toBe('COMPLETED')

    const secondGig = await createGig(prisma, {
      employerId: employer.id,
      status: 'ASSIGNED',
      scheduledAt: new Date(futureIso()),
      address: { street: 'Rua Cancelada', number: '20' },
    })
    const secondAgreement = await createAgreement(prisma, {
      gigId: secondGig.id,
      employerId: employer.id,
      workerId: worker.id,
    })

    const canceled = await requestJson<AgreementBody>(
      app,
      'POST',
      `/api/v1/agreements/${secondAgreement.id}/cancel`,
      { reason: 'Plans changed' },
      worker,
    )
    expect(canceled.response.status).toBe(200)
    expect(canceled.body.data.status).toBe('CANCELED')
    expect(canceled.body.data.canceledAt).not.toBeNull()
    expect(canceled.body.data.gig.status).toBe('CANCELED')

    const canceledGig = await prisma.gig.findUniqueOrThrow({
      where: { id: secondGig.id },
      select: { status: true, canceledById: true },
    })
    expect(canceledGig.status).toBe('CANCELED')
    expect(canceledGig.canceledById).toBe(worker.id)

    const addressAfterCancel = await requestJson<{ data: { street: string } }>(
      app,
      'GET',
      `/api/v1/agreements/${secondAgreement.id}/address`,
      undefined,
      employer,
    )
    expect(addressAfterCancel.response.status).toBe(200)
    expect(addressAfterCancel.body.data.street).toBe('Rua Cancelada')

    const startAfterCancel = await requestJson<ErrorBody>(
      app,
      'POST',
      `/api/v1/agreements/${secondAgreement.id}/start`,
      undefined,
      employer,
    )
    expect(startAfterCancel.response.status).toBe(409)
    expect(startAfterCancel.body.error.code).toBe('INVALID_AGREEMENT_STATE')
  })

  it('expires stale open gigs, rejects their applications, and cleans expired credentials', async () => {
    const { prisma, app } = context()
    const employer = await createSessionUser('Employer', 'employer@example.test')
    const worker = await createSessionUser('Worker', 'worker@example.test')
    const now = new Date()
    const staleScheduledAt = new Date(now.getTime() - 25 * 60 * 60 * 1000)

    const staleGig = await createGig(prisma, {
      employerId: employer.id,
      status: 'OPEN',
      scheduledAt: staleScheduledAt,
      address: { street: 'Rua Expirada', number: '30' },
    })
    const pending = await createApplication(prisma, {
      gigId: staleGig.id,
      applicantId: worker.id,
    })
    const canceledGig = await createGig(prisma, {
      employerId: employer.id,
      status: 'CANCELED',
      scheduledAt: staleScheduledAt,
      canceledAt: now,
      canceledById: employer.id,
    })
    const draftGig = await createGig(prisma, {
      employerId: employer.id,
      status: 'DRAFT',
      scheduledAt: staleScheduledAt,
    })
    const assignedGig = await createGig(prisma, {
      employerId: employer.id,
      status: 'ASSIGNED',
      scheduledAt: staleScheduledAt,
    })
    await createAgreement(prisma, {
      gigId: assignedGig.id,
      employerId: employer.id,
      workerId: worker.id,
    })

    const publicBeforeSweep = await requestJson<{ data: Array<{ id: string }> }>(
      app,
      'GET',
      '/api/v1/gigs',
    )
    expect(publicBeforeSweep.body.data.some((gig) => gig.id === staleGig.id)).toBe(false)

    const staleDetailBeforeSweep = await requestJson<ErrorBody>(
      app,
      'GET',
      `/api/v1/gigs/${staleGig.id}`,
    )
    expect(staleDetailBeforeSweep.response.status).toBe(404)

    const staleApplication = await requestJson<ErrorBody>(
      app,
      'POST',
      `/api/v1/gigs/${staleGig.id}/applications`,
      {},
      worker,
    )
    expect(staleApplication.response.status).toBe(409)
    expect(staleApplication.body.error.code).toBe('GIG_EXPIRED')

    const expiredSessionHash = randomBytes(32).toString('hex')
    const expiredTokenHash = randomBytes(32).toString('hex')
    await prisma.session.create({
      data: {
        tokenHash: expiredSessionHash,
        userId: worker.id,
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
      },
    })
    await prisma.authToken.create({
      data: {
        tokenHash: expiredTokenHash,
        userId: worker.id,
        purpose: 'EMAIL_VERIFICATION',
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
      },
    })

    const maintenance = createMaintenanceService(prisma)
    const result = await maintenance.run(now)

    expect(result.expiredGigs).toBe(1)
    expect(result.rejectedApplications).toBe(1)
    expect(result.deletedSessions).toBe(1)
    expect(result.deletedAuthTokens).toBe(1)

    const expired = await prisma.gig.findUniqueOrThrow({
      where: { id: staleGig.id },
      select: { status: true, expiredAt: true },
    })
    expect(expired.status).toBe('EXPIRED')
    expect(expired.expiredAt).not.toBeNull()

    const rejected = await prisma.application.findUniqueOrThrow({
      where: { id: pending.id },
      select: { status: true },
    })
    expect(rejected.status).toBe('REJECTED')

    const unchanged = await prisma.gig.findMany({
      where: { id: { in: [canceledGig.id, draftGig.id, assignedGig.id] } },
      select: { id: true, status: true },
    })
    expect(Object.fromEntries(unchanged.map((gig) => [gig.id, gig.status]))).toEqual({
      [canceledGig.id]: 'CANCELED',
      [draftGig.id]: 'DRAFT',
      [assignedGig.id]: 'ASSIGNED',
    })

    const ownerGigs = await requestJson<{
      data: Array<{ id: string; status: string; expiredAt: string | null }>
    }>(app, 'GET', '/api/v1/gigs/mine', undefined, employer)
    expect(ownerGigs.body.data.find((gig) => gig.id === staleGig.id)?.status).toBe('EXPIRED')

    const expiredApplication = await requestJson<ErrorBody>(
      app,
      'POST',
      `/api/v1/gigs/${staleGig.id}/applications`,
      {},
      worker,
    )
    expect(expiredApplication.response.status).toBe(409)
    expect(expiredApplication.body.error.code).toBe('GIG_NOT_OPEN')
  })
})
