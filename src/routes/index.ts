import { Hono } from 'hono'

import type { AuthConfig } from '../modules/auth/auth.config.js'
import { createAuthRoutes } from '../modules/auth/auth.routes.js'
import type { AuthRateLimiter } from '../modules/auth/auth-rate-limiter.js'
import type { AuthService } from '../modules/auth/auth.service.js'
import { createGigsRoutes } from '../modules/gigs/gigs.routes.js'
import type { GigsService } from '../modules/gigs/gigs.service.js'
import { createHealthRoutes } from '../modules/health/health.routes.js'
import type { HealthService } from '../modules/health/health.service.js'
import type { AppEnv } from '../types/app-env.js'

export interface ApiDependencies {
  healthService: HealthService
  gigsService: GigsService
  authService: AuthService
  authConfig: AuthConfig
  authRateLimiter: AuthRateLimiter
}

export function createApiRoutes(dependencies: ApiDependencies): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()

  routes.route('/', createHealthRoutes(dependencies.healthService))
  routes.route(
    '/auth',
    createAuthRoutes(
      dependencies.authService,
      dependencies.authConfig,
      dependencies.authRateLimiter,
    ),
  )
  routes.route('/gigs', createGigsRoutes(dependencies.gigsService))

  return routes
}
