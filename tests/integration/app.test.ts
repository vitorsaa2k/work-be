import { describe, expect, it, vi } from 'vitest'

import { NotFoundError } from '../../src/lib/errors.js'
import type { GigsService } from '../../src/modules/gigs/gigs.service.js'
import { createTestApp } from '../helpers/app.js'

describe('application infrastructure', () => {
  it('returns a consistent not-found response with a request ID', async () => {
    const app = createTestApp()

    const response = await app.request('/api/v1/does-not-exist', {
      headers: { 'x-request-id': 'not-found-1' },
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(response.headers.get('x-request-id')).toBe('not-found-1')
    expect(body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
        requestId: 'not-found-1',
      },
    })
  })

  it('generates a request ID when none is provided', async () => {
    const app = createTestApp()

    const response = await app.request('/api/v1/health')
    const requestId = response.headers.get('x-request-id')

    expect(requestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('rejects unsafe incoming request IDs', async () => {
    const app = createTestApp()

    const response = await app.request('/api/v1/health', {
      headers: { 'x-request-id': 'unsafe id with spaces' },
    })
    const requestId = response.headers.get('x-request-id')

    expect(requestId).not.toBe('unsafe id with spaces')
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('returns a generic 500 without leaking internal error messages', async () => {
    const app = createTestApp({
      healthService: {
        checkReadiness: async () => {
          throw new Error('internal database password secret')
        },
      },
    })

    const response = await app.request('/api/v1/ready')
    const body = (await response.json()) as {
      error: { code: string; message: string; requestId: string }
    }

    expect(response.status).toBe(500)
    expect(body.error).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
      requestId: expect.any(String),
    })
    expect(JSON.stringify(body)).not.toContain('secret')
  })

  it('allows the configured frontend origin with credentials', async () => {
    const app = createTestApp()

    const response = await app.request('/api/v1/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'content-type',
      },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
    expect(response.headers.get('access-control-expose-headers')).toContain('X-Request-Id')
  })

  it('does not allow arbitrary origins', async () => {
    const app = createTestApp()

    const response = await app.request('/api/v1/health', {
      headers: { Origin: 'https://malicious.example' },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('rejects invalid gig query parameters before calling the service', async () => {
    const listPublicGigs = vi.fn<GigsService['listPublicGigs']>()
    const app = createTestApp({
      gigsService: {
        listPublicGigs,
        getPublicGig: async () => {
          throw new NotFoundError('Gig not found.')
        },
      },
    })

    const response = await app.request('/api/v1/gigs?limit=51')
    const body = (await response.json()) as {
      error: { code: string; details: Array<{ path: string }> }
    }

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details.some((detail) => detail.path === 'limit')).toBe(true)
    expect(listPublicGigs).not.toHaveBeenCalled()
  })

  it('rejects invalid gig IDs before calling the service', async () => {
    const getPublicGig = vi.fn<GigsService['getPublicGig']>()
    const app = createTestApp({
      gigsService: {
        listPublicGigs: async () => ({
          items: [],
          meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
        }),
        getPublicGig,
      },
    })

    const response = await app.request('/api/v1/gigs/not-a-uuid')
    const body = (await response.json()) as {
      error: { code: string; details: Array<{ path: string }> }
    }

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details[0]?.path).toBe('gigId')
    expect(getPublicGig).not.toHaveBeenCalled()
  })

  it('returns a sanitized 404 for missing gigs', async () => {
    const app = createTestApp()

    const response = await app.request('/api/v1/gigs/00000000-0000-4000-8000-000000000000')
    const body = (await response.json()) as {
      error: { code: string; message: string; requestId: string }
    }

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
    expect(body.error.message).toBe('Gig not found.')
  })

  it('returns a generic 500 when the gig service fails', async () => {
    const app = createTestApp({
      gigsService: {
        listPublicGigs: async () => {
          throw new Error('database connection secret')
        },
        getPublicGig: async () => {
          throw new NotFoundError('Gig not found.')
        },
      },
    })

    const response = await app.request('/api/v1/gigs')
    const body = (await response.json()) as {
      error: { code: string; message: string; requestId: string }
    }

    expect(response.status).toBe(500)
    expect(body.error).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
      requestId: expect.any(String),
    })
    expect(JSON.stringify(body)).not.toContain('secret')
  })
})
