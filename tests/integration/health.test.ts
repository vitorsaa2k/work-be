import { describe, expect, it, vi } from 'vitest'

import { ServiceUnavailableError } from '../../src/lib/errors.js'
import { createTestApp } from '../helpers/app.js'

describe('health endpoints', () => {
  it('reports process liveness without checking dependencies', async () => {
    const checkReadiness = vi.fn()
    const app = createTestApp({ healthService: { checkReadiness } })

    const response = await app.request('/api/v1/health')
    const body = (await response.json()) as {
      data: { status: string; timestamp: string }
    }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      data: {
        status: 'ok',
      },
    })
    expect(body.data.timestamp).toEqual(expect.any(String))
    expect(checkReadiness).not.toHaveBeenCalled()
  })

  it('reports readiness when the database check succeeds', async () => {
    const checkReadiness = vi.fn().mockResolvedValue(undefined)
    const app = createTestApp({ healthService: { checkReadiness } })

    const response = await app.request('/api/v1/ready')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      data: {
        status: 'ready',
        checks: {
          database: 'up',
        },
      },
    })
    expect(checkReadiness).toHaveBeenCalledOnce()
  })

  it('returns a sanitized 503 when readiness fails', async () => {
    const app = createTestApp({
      healthService: {
        checkReadiness: async () => {
          throw new ServiceUnavailableError('A required service dependency is unavailable.', {
            cause: new Error('postgresql://postgres:secret@localhost:5432/work-be'),
          })
        },
      },
    })

    const response = await app.request('/api/v1/ready', {
      headers: { 'x-request-id': 'ready-test-1' },
    })
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(response.headers.get('x-request-id')).toBe('ready-test-1')
    expect(body).toEqual({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'A required service dependency is unavailable.',
        requestId: 'ready-test-1',
      },
    })
    expect(JSON.stringify(body)).not.toContain('secret')
  })
})
