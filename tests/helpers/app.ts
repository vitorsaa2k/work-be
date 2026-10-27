import type { Hono } from 'hono'

import { createApp } from '../../src/app.js'
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  NotFoundError,
} from '../../src/lib/errors.js'
import type { Logger } from '../../src/lib/logger.js'
import type { AuthConfig } from '../../src/modules/auth/auth.config.js'
import type { AuthRateLimiter } from '../../src/modules/auth/auth-rate-limiter.js'
import type { AuthService } from '../../src/modules/auth/auth.service.js'
import type { GigsService } from '../../src/modules/gigs/gigs.service.js'
import type { HealthService } from '../../src/modules/health/health.service.js'
import type { AppEnv } from '../../src/types/app-env.js'

export const testAuthConfig: AuthConfig = {
  sessionCookieName: 'work_session',
  sessionTtlSeconds: 3600,
  emailVerificationTtlSeconds: 3600,
  passwordResetTtlSeconds: 1800,
  secureCookies: false,
  trustProxy: false,
}

export const permissiveAuthRateLimiter: AuthRateLimiter = {
  checkLogin: () => ({ allowed: true, retryAfterSeconds: 0 }),
  checkRegistration: () => ({ allowed: true, retryAfterSeconds: 0 }),
  checkEmailVerificationRequest: () => ({ allowed: true, retryAfterSeconds: 0 }),
  checkPasswordResetRequest: () => ({ allowed: true, retryAfterSeconds: 0 }),
  checkTokenConfirmation: () => ({ allowed: true, retryAfterSeconds: 0 }),
  reset: () => undefined,
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

export const defaultHealthService: HealthService = {
  checkReadiness: async () => undefined,
}

export const defaultGigsService: GigsService = {
  listPublicGigs: async () => ({
    items: [],
    meta: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    },
  }),
  getPublicGig: async () => {
    throw new NotFoundError('Gig not found.')
  },
}

export const defaultAuthService: AuthService = {
  login: async () => {
    throw new InvalidCredentialsError()
  },
  register: async () => {
    throw new EmailAlreadyRegisteredError()
  },
  authenticate: async () => null,
  logout: async () => undefined,
  requestEmailVerification: async () => undefined,
  confirmEmailVerification: async () => undefined,
  requestPasswordReset: async () => undefined,
  resetPassword: async () => undefined,
}

export function createTestApp(
  overrides: {
    healthService?: HealthService
    gigsService?: GigsService
    authService?: AuthService
    authConfig?: AuthConfig
    authRateLimiter?: AuthRateLimiter
  } = {},
): Hono<AppEnv> {
  return createApp({
    config: {
      frontendOrigin: 'http://localhost:5173',
      auth: overrides.authConfig ?? testAuthConfig,
    },
    logger: silentLogger,
    healthService: overrides.healthService ?? defaultHealthService,
    gigsService: overrides.gigsService ?? defaultGigsService,
    authService: overrides.authService ?? defaultAuthService,
    authRateLimiter: overrides.authRateLimiter ?? permissiveAuthRateLimiter,
  })
}
