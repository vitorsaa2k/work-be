import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../../src/app.js'
import type { DatabaseClient } from '../../src/db/prisma.js'
import { createAuthService } from '../../src/modules/auth/auth.service.js'
import { createGigsService } from '../../src/modules/gigs/gigs.service.js'
import { createHealthService } from '../../src/modules/health/health.service.js'
import { silentLogger, testAuthConfig } from '../helpers/app.js'
import { createTestDatabaseClient, resetTestDatabase } from '../helpers/database.js'
import { createGig, createUser } from '../helpers/fixtures.js'
import { readJson } from '../helpers/http.js'
import { createCapturingAuthMailer } from '../helpers/mailer.js'
import { hasTestDatabase } from '../setup/test-database.js'

interface GigSummaryBody {
  id: string
  title: string
  category: string
  price: { amount: number; currency: string }
  estimatedDurationMinutes: number
  scheduledAt: string | null
  city: string
  location: string
  type: string
  status: string
  createdAt: string
  employer: { id: string; name: string }
}

interface GigDetailBody extends GigSummaryBody {
  description: string
  updatedAt: string
}

interface GigListBody {
  data: GigSummaryBody[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

describe.skipIf(!hasTestDatabase)('public gig API with PostgreSQL', () => {
  let prisma: DatabaseClient | undefined
  let app: ReturnType<typeof createApp> | undefined

  const context = (): { prisma: DatabaseClient; app: ReturnType<typeof createApp> } => {
    if (!prisma || !app) {
      throw new Error('The test database context is not initialized.')
    }
    return { prisma, app }
  }

  beforeAll(() => {
    if (!hasTestDatabase) {
      return
    }

    const client = createTestDatabaseClient()
    prisma = client
    app = createApp({
      config: {
        frontendOrigin: 'http://localhost:5173',
        auth: testAuthConfig,
      },
      logger: silentLogger,
      healthService: createHealthService(async () => client.$queryRaw`SELECT 1`),
      gigsService: createGigsService(client),
      authService: createAuthService(client, testAuthConfig, createCapturingAuthMailer()),
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

  it('lists only publicly discoverable gigs with explicit safe DTOs', async () => {
    const { app, prisma } = context()
    const employer = await createUser(prisma, {
      name: 'Empresa Teste',
      email: 'employer-private@example.test',
      passwordHash: 'private-password-hash',
    })

    await createGig(prisma, {
      employerId: employer.id,
      title: 'Gig público',
      category: 'Limpeza',
      city: 'São Paulo',
      location: 'Vila Mariana',
      status: 'OPEN',
      address: {
        street: 'Rua Privada',
        number: '321',
        complement: 'Apto 99',
        accessInstructions: 'Código secreto do portão: 9876',
      },
    })
    await createGig(prisma, {
      employerId: employer.id,
      title: 'Gig em rascunho',
      status: 'DRAFT',
    })
    await createGig(prisma, {
      employerId: employer.id,
      title: 'Gig concluído',
      status: 'COMPLETED',
    })

    const response = await app.request('/api/v1/gigs')
    const body = await readJson<GigListBody>(response)

    expect(response.status).toBe(200)
    expect(body.meta).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    })
    expect(body.data).toHaveLength(1)
    expect(Object.keys(body.data[0] ?? {}).sort()).toEqual(
      [
        'category',
        'city',
        'createdAt',
        'employer',
        'estimatedDurationMinutes',
        'id',
        'location',
        'price',
        'scheduledAt',
        'status',
        'title',
        'type',
      ].sort(),
    )
    expect(body.data[0]).toMatchObject({
      title: 'Gig público',
      category: 'Limpeza',
      city: 'São Paulo',
      location: 'Vila Mariana',
      status: 'OPEN',
      price: {
        amount: 15_000,
        currency: 'BRL',
      },
      employer: {
        id: employer.id,
        name: 'Empresa Teste',
      },
    })

    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('Rua Privada')
    expect(serialized).not.toContain('Código secreto do portão')
    expect(serialized).not.toContain('private-password-hash')
    expect(serialized).not.toContain('employer-private@example.test')
    expect(serialized).not.toContain('Gig em rascunho')
    expect(serialized).not.toContain('Gig concluído')
  })

  it('paginates with stable newest-first ordering', async () => {
    const { app, prisma } = context()
    const employer = await createUser(prisma, { email: 'pagination@example.test' })

    await createGig(prisma, {
      employerId: employer.id,
      title: 'Oldest',
      createdAt: new Date('2026-01-01T10:00:00.000Z'),
    })
    await createGig(prisma, {
      employerId: employer.id,
      title: 'Middle',
      createdAt: new Date('2026-01-02T10:00:00.000Z'),
    })
    await createGig(prisma, {
      employerId: employer.id,
      title: 'Newest',
      createdAt: new Date('2026-01-03T10:00:00.000Z'),
    })

    const firstResponse = await app.request('/api/v1/gigs?page=1&limit=2')
    const firstPage = await readJson<GigListBody>(firstResponse)

    expect(firstPage.meta).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    })
    expect(firstPage.data.map((gig) => gig.title)).toEqual(['Newest', 'Middle'])

    const secondResponse = await app.request('/api/v1/gigs?page=2&limit=2')
    const secondPage = await readJson<GigListBody>(secondResponse)

    expect(secondPage.data.map((gig) => gig.title)).toEqual(['Oldest'])
  })

  it('filters by city and category case-insensitively and enforces public status', async () => {
    const { app, prisma } = context()
    const employer = await createUser(prisma, { email: 'filters@example.test' })

    await createGig(prisma, {
      employerId: employer.id,
      title: 'Limpeza em São Paulo',
      city: 'São Paulo',
      category: 'Limpeza',
    })
    await createGig(prisma, {
      employerId: employer.id,
      title: 'Limpeza em Curitiba',
      city: 'Curitiba',
      category: 'Limpeza',
    })
    await createGig(prisma, {
      employerId: employer.id,
      title: 'Elétrica em São Paulo',
      city: 'São Paulo',
      category: 'Elétrica',
    })
    await createGig(prisma, {
      employerId: employer.id,
      title: 'Rascunho em São Paulo',
      city: 'São Paulo',
      category: 'Limpeza',
      status: 'DRAFT',
    })

    const response = await app.request(
      '/api/v1/gigs?city=S%C3%A3o%20Paulo&category=limpeza&status=OPEN',
    )
    const body = await readJson<GigListBody>(response)

    expect(response.status).toBe(200)
    expect(body.data.map((gig) => gig.title)).toEqual(['Limpeza em São Paulo'])

    const invalidStatus = await app.request('/api/v1/gigs?status=DRAFT')
    const invalidBody = await readJson<{
      error: { code: string; details: Array<{ path: string }> }
    }>(invalidStatus)

    expect(invalidStatus.status).toBe(400)
    expect(invalidBody.error.code).toBe('VALIDATION_ERROR')
    expect(invalidBody.error.details[0]?.path).toBe('status')
  })

  it('returns public gig details without private address data', async () => {
    const { app, prisma } = context()
    const employer = await createUser(prisma, {
      email: 'detail@example.test',
      passwordHash: 'detail-private-hash',
    })
    const gig = await createGig(prisma, {
      employerId: employer.id,
      title: 'Detalhe público',
      description: 'Descrição completa e pública do serviço.',
      address: {
        street: 'Rua Ultra Secreta',
        number: '777',
        complement: 'Fundos',
        accessInstructions: 'Instrução privada de acesso',
      },
    })

    const response = await app.request(`/api/v1/gigs/${gig.id}`)
    const body = await readJson<{ data: GigDetailBody }>(response)

    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({
      id: gig.id,
      title: 'Detalhe público',
      description: 'Descrição completa e pública do serviço.',
      status: 'OPEN',
    })
    expect(Object.keys(body.data).sort()).toEqual(
      [
        'category',
        'city',
        'createdAt',
        'description',
        'employer',
        'estimatedDurationMinutes',
        'id',
        'location',
        'price',
        'scheduledAt',
        'status',
        'title',
        'type',
        'updatedAt',
      ].sort(),
    )

    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('Rua Ultra Secreta')
    expect(serialized).not.toContain('Instrução privada de acesso')
    expect(serialized).not.toContain('detail-private-hash')
    expect(serialized).not.toContain(employer.email)
  })

  it('returns 404 for non-discoverable or missing gigs and 400 for invalid IDs', async () => {
    const { app, prisma } = context()
    const employer = await createUser(prisma, { email: 'missing@example.test' })
    const draft = await createGig(prisma, {
      employerId: employer.id,
      title: 'Draft privado',
      status: 'DRAFT',
    })

    const draftResponse = await app.request(`/api/v1/gigs/${draft.id}`)
    expect(draftResponse.status).toBe(404)

    const missingResponse = await app.request('/api/v1/gigs/00000000-0000-4000-8000-000000000000')
    expect(missingResponse.status).toBe(404)

    const invalidResponse = await app.request('/api/v1/gigs/not-a-uuid')
    const invalidBody = await readJson<{
      error: { code: string; details: Array<{ path: string }> }
    }>(invalidResponse)

    expect(invalidResponse.status).toBe(400)
    expect(invalidBody.error.code).toBe('VALIDATION_ERROR')
    expect(invalidBody.error.details[0]?.path).toBe('gigId')
  })

  it('reports readiness against the real database', async () => {
    const { app } = context()

    const response = await app.request('/api/v1/ready')
    const body = await readJson<{
      data: { status: string; checks: { database: string } }
    }>(response)

    expect(response.status).toBe(200)
    expect(body.data).toEqual({
      status: 'ready',
      checks: {
        database: 'up',
      },
    })
  })
})
