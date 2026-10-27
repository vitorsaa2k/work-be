import { randomUUID } from 'node:crypto'

import type { MiddlewareHandler } from 'hono'

import type { AppEnv } from '../types/app-env.js'

const safeRequestIdPattern = /^[A-Za-z0-9._-]{1,128}$/

export function createRequestIdMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const incomingRequestId = c.req.header('x-request-id')
    const requestId =
      incomingRequestId && safeRequestIdPattern.test(incomingRequestId)
        ? incomingRequestId
        : randomUUID()

    c.set('requestId', requestId)
    c.header('X-Request-Id', requestId)

    await next()
  }
}
