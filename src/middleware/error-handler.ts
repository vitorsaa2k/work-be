import { randomUUID } from 'node:crypto'

import type { ErrorHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { AppError, mapError } from '../lib/errors.js'
import type { Logger } from '../lib/logger.js'
import type { AppEnv } from '../types/app-env.js'

export function createErrorHandler(logger: Logger): ErrorHandler<AppEnv> {
  return (error, c) => {
    const requestId = c.get('requestId') || randomUUID()
    const mapped = mapError(error, requestId)

    if (error instanceof AppError && error.headers) {
      for (const [name, value] of Object.entries(error.headers)) {
        c.header(name, value)
      }
    }

    c.header('X-Request-Id', requestId)

    const fields = {
      requestId,
      statusCode: mapped.statusCode,
      code: mapped.body.error.code,
      error,
    }

    if (mapped.logLevel === 'error') {
      logger.error('request failed', fields)
    } else {
      logger.warn('request rejected', fields)
    }

    return c.json(mapped.body, mapped.statusCode as ContentfulStatusCode)
  }
}
