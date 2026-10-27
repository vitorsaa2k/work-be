import type { MiddlewareHandler } from 'hono'

import type { Logger } from '../lib/logger.js'
import type { AppEnv } from '../types/app-env.js'

export function createRequestLoggerMiddleware(logger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const startedAt = performance.now()
    await next()

    logger.info('request completed', {
      requestId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    })
  }
}
