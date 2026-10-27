import type { NotFoundHandler } from 'hono'

import { createErrorBody } from '../lib/errors.js'
import type { AppEnv } from '../types/app-env.js'

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) => {
  const requestId = c.get('requestId')
  c.header('X-Request-Id', requestId)

  return c.json(
    createErrorBody('NOT_FOUND', 'The requested resource was not found.', requestId),
    404,
  )
}
