import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  AppError,
  AuthenticationRequiredError,
  EmailAlreadyRegisteredError,
  ForbiddenError,
  InvalidCredentialsError,
  InvalidTokenError,
  mapError,
  ServiceUnavailableError,
  TooManyAttemptsError,
} from '../../src/lib/errors.js'

const requestId = 'request-123'

describe('mapError', () => {
  it('maps application errors without exposing causes', () => {
    const error = new ServiceUnavailableError('A required dependency is unavailable.', {
      cause: new Error('postgresql://user:secret@localhost:5432/work-be'),
    })

    const mapped = mapError(error, requestId)

    expect(mapped.statusCode).toBe(503)
    expect(mapped.logLevel).toBe('error')
    expect(mapped.body).toEqual({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'A required dependency is unavailable.',
        requestId,
      },
    })
    expect(JSON.stringify(mapped.body)).not.toContain('secret')
  })

  it('maps authentication and authorization failures with stable codes', () => {
    const missingSession = mapError(new AuthenticationRequiredError(), requestId)
    const invalidCredentials = mapError(new InvalidCredentialsError(), requestId)
    const forbidden = mapError(new ForbiddenError(), requestId)

    expect(missingSession.statusCode).toBe(401)
    expect(missingSession.body.error.code).toBe('AUTHENTICATION_REQUIRED')
    expect(invalidCredentials.statusCode).toBe(401)
    expect(invalidCredentials.body.error.code).toBe('INVALID_CREDENTIALS')
    expect(forbidden.statusCode).toBe(403)
    expect(forbidden.body.error.code).toBe('FORBIDDEN')
  })

  it('maps registration conflicts, invalid tokens, and authentication throttling', () => {
    const conflict = mapError(new EmailAlreadyRegisteredError(), requestId)
    const invalidToken = mapError(new InvalidTokenError(), requestId)
    const throttled = new TooManyAttemptsError(12.1)
    const mapped = mapError(throttled, requestId)

    expect(conflict.statusCode).toBe(409)
    expect(conflict.body.error.code).toBe('EMAIL_ALREADY_REGISTERED')
    expect(invalidToken.statusCode).toBe(400)
    expect(invalidToken.body.error.code).toBe('INVALID_TOKEN')
    expect(mapped.statusCode).toBe(429)
    expect(mapped.body.error.code).toBe('TOO_MANY_ATTEMPTS')
    expect(throttled.headers).toEqual({ 'Retry-After': '13' })
  })

  it('includes sanitized details for client errors', () => {
    const error = new AppError('VALIDATION_ERROR', 'The request contains invalid data.', 400, {
      details: [{ path: 'page', message: 'Too small' }],
    })

    const mapped = mapError(error, requestId)

    expect(mapped.statusCode).toBe(400)
    expect(mapped.logLevel).toBe('warn')
    expect(mapped.body.error.details).toEqual([{ path: 'page', message: 'Too small' }])
  })

  it('maps Zod errors to field details', () => {
    const result = z.object({ page: z.number().int().min(1) }).safeParse({ page: 0 })
    expect(result.success).toBe(false)

    const mapped = mapError(result.error, requestId)

    expect(mapped.statusCode).toBe(400)
    expect(mapped.body.error.code).toBe('VALIDATION_ERROR')
    expect(mapped.body.error.details?.[0]?.path).toBe('page')
  })

  it('maps Prisma record errors to safe HTTP responses', () => {
    expect(mapError({ code: 'P2025' }, requestId).statusCode).toBe(404)
    expect(mapError({ code: 'P2002' }, requestId).statusCode).toBe(409)
    expect(mapError({ code: 'P2003' }, requestId).statusCode).toBe(409)

    const mapped = mapError(
      { code: 'P2002', meta: { target: ['email'], password: 'secret' } },
      requestId,
    )
    expect(JSON.stringify(mapped.body)).not.toContain('secret')
  })

  it('maps malformed JSON to a bad request', () => {
    const mapped = mapError(new SyntaxError('Unexpected token'), requestId)

    expect(mapped.statusCode).toBe(400)
    expect(mapped.body.error.code).toBe('BAD_REQUEST')
    expect(mapped.body.error.message).toBe('The request body is not valid JSON.')
  })

  it('hides unexpected error messages behind a generic 500 response', () => {
    const mapped = mapError(new Error('database password is secret'), requestId)

    expect(mapped.statusCode).toBe(500)
    expect(mapped.logLevel).toBe('error')
    expect(mapped.body).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
        requestId,
      },
    })
  })
})
