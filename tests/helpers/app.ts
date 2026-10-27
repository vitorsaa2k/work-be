import type { Hono } from 'hono'

import { createApp } from '../../src/app.js'
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  NotFoundError,
} from '../../src/lib/errors.js'
import type { Logger } from '../../src/lib/logger.js'
import type { ApplicationsService } from '../../src/modules/applications/applications.service.js'
import type { AgreementsService } from '../../src/modules/agreements/agreements.service.js'
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

const emptyGigPage = {
  items: [],
  meta: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
}

export const defaultGigsService: GigsService = {
  listPublicGigs: async () => emptyGigPage,
  getPublicGig: async () => {
    throw new NotFoundError('Gig not found.')
  },
  listOwnedGigs: async () => emptyGigPage,
  getOwnedGig: async () => {
    throw new NotFoundError('Gig not found.')
  },
  createGig: async () => {
    throw new NotFoundError('Gig not found.')
  },
  updateGig: async () => {
    throw new NotFoundError('Gig not found.')
  },
  cancelGig: async () => {
    throw new NotFoundError('Gig not found.')
  },
}

export const defaultApplicationsService: ApplicationsService = {
  apply: async () => {
    throw new NotFoundError('Gig not found.')
  },
  listForGig: async () => {
    throw new NotFoundError('Gig not found.')
  },
  listMine: async () => [],
  withdraw: async () => {
    throw new NotFoundError('Application not found.')
  },
}

export const defaultAgreementsService: AgreementsService = {
  selectWorker: async () => {
    throw new NotFoundError('Gig not found.')
  },
  get: async () => {
    throw new NotFoundError('Agreement not found.')
  },
  getAddress: async () => {
    throw new NotFoundError('Agreement not found.')
  },
  confirmStart: async () => {
    throw new NotFoundError('Agreement not found.')
  },
  confirmCompletion: async () => {
    throw new NotFoundError('Agreement not found.')
  },
  cancel: async () => {
    throw new NotFoundError('Agreement not found.')
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
    applicationsService?: ApplicationsService
    agreementsService?: AgreementsService
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
    applicationsService: overrides.applicationsService ?? defaultApplicationsService,
    agreementsService: overrides.agreementsService ?? defaultAgreementsService,
    authService: overrides.authService ?? defaultAuthService,
    authRateLimiter: overrides.authRateLimiter ?? permissiveAuthRateLimiter,
  })
}
