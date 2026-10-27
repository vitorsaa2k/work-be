import type { MiddlewareHandler } from 'hono'

import { ForbiddenError } from '../lib/errors.js'
import type { AppEnv } from '../types/app-env.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function createCsrfProtection(frontendOrigin: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) {
      await next()
      return
    }

    const origin = c.req.header('origin')

    if (origin !== undefined && origin !== frontendOrigin) {
      throw new ForbiddenError('The request origin is not allowed.')
    }

    const fetchSite = c.req.header('sec-fetch-site')

    if (fetchSite?.toLowerCase() === 'cross-site') {
      throw new ForbiddenError('Cross-site requests are not allowed.')
    }

    await next()
  }
}
