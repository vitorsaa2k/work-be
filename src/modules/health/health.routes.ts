import { Hono } from 'hono'

import type { AppEnv } from '../../types/app-env.js'
import type { HealthService } from './health.service.js'

export function createHealthRoutes(healthService: HealthService): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()

  routes.get('/health', (c) => {
    c.header('Cache-Control', 'no-store')
    return c.json({
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
      },
    })
  })

  routes.get('/ready', async (c) => {
    c.header('Cache-Control', 'no-store')
    await healthService.checkReadiness()

    return c.json({
      data: {
        status: 'ready',
        checks: {
          database: 'up',
        },
      },
    })
  })

  return routes
}
