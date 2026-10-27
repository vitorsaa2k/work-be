import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'

import type { Logger } from './lib/logger.js'
import { createCsrfProtection } from './middleware/csrf.js'
import { createErrorHandler } from './middleware/error-handler.js'
import { notFoundHandler } from './middleware/not-found.js'
import { createRequestIdMiddleware } from './middleware/request-id.js'
import { createRequestLoggerMiddleware } from './middleware/request-logger.js'
import type { ApplicationsService } from './modules/applications/applications.service.js'
import type { AgreementsService } from './modules/agreements/agreements.service.js'
import type { AuthConfig } from './modules/auth/auth.config.js'
import { createAuthRateLimiter, type AuthRateLimiter } from './modules/auth/auth-rate-limiter.js'
import type { AuthService } from './modules/auth/auth.service.js'
import type { GigsService } from './modules/gigs/gigs.service.js'
import type { HealthService } from './modules/health/health.service.js'
import { createApiRoutes } from './routes/index.js'
import type { AppEnv } from './types/app-env.js'

export interface AppConfig {
  frontendOrigin: string
  auth: AuthConfig
}

export interface AppDependencies {
  config: AppConfig
  logger: Logger
  healthService: HealthService
  gigsService: GigsService
  applicationsService: ApplicationsService
  agreementsService: AgreementsService
  authService: AuthService
  authRateLimiter?: AuthRateLimiter
}

export function createApp(dependencies: AppDependencies): Hono<AppEnv> {
  const {
    config,
    logger,
    healthService,
    gigsService,
    applicationsService,
    agreementsService,
    authService,
  } = dependencies
  const authRateLimiter = dependencies.authRateLimiter ?? createAuthRateLimiter()
  const app = new Hono<AppEnv>()

  app.use('*', createRequestIdMiddleware())
  app.use('*', createRequestLoggerMiddleware(logger))
  app.use('*', secureHeaders())
  app.use(
    '*',
    cors({
      origin: config.frontendOrigin,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposeHeaders: ['X-Request-Id', 'Retry-After'],
      credentials: true,
      maxAge: 600,
    }),
  )
  app.use('*', createCsrfProtection(config.frontendOrigin))

  app.route(
    '/api/v1',
    createApiRoutes({
      healthService,
      gigsService,
      applicationsService,
      agreementsService,
      authService,
      authConfig: config.auth,
      authRateLimiter,
    }),
  )

  app.notFound(notFoundHandler)
  app.onError(createErrorHandler(logger))

  return app
}
