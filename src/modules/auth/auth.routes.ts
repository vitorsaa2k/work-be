import { Hono } from 'hono'

import { TooManyAttemptsError } from '../../lib/errors.js'
import type { AppEnv } from '../../types/app-env.js'
import type { AuthConfig } from './auth.config.js'
import { clearSessionCookie, readSessionToken, setSessionCookie } from './auth.cookies.js'
import { createAuthMiddleware, getAuthenticatedUser } from './auth.middleware.js'
import type { AuthRateLimiter } from './auth-rate-limiter.js'
import {
  emailVerificationConfirmSchema,
  emailVerificationRequestSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
} from './auth.schemas.js'
import type { AuthService } from './auth.service.js'
import { getClientIp } from './client-ip.js'

export function createAuthRoutes(
  authService: AuthService,
  config: AuthConfig,
  authRateLimiter: AuthRateLimiter,
): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()
  const requireAuthentication = createAuthMiddleware(authService, config)

  routes.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    await next()
  })

  routes.post('/register', async (c) => {
    const input = registerSchema.parse(await c.req.json())
    const clientIp = getClientIp(c, config.trustProxy)
    const decision = authRateLimiter.checkRegistration(clientIp)

    if (!decision.allowed) {
      throw new TooManyAttemptsError(decision.retryAfterSeconds)
    }

    const result = await authService.register(input)

    setSessionCookie(c, config, result.token)

    return c.json(
      {
        data: result.user,
      },
      201,
    )
  })

  routes.post('/login', async (c) => {
    const input = loginSchema.parse(await c.req.json())
    const clientIp = getClientIp(c, config.trustProxy)
    const decision = authRateLimiter.checkLogin(clientIp, input.email)

    if (!decision.allowed) {
      throw new TooManyAttemptsError(decision.retryAfterSeconds)
    }

    const result = await authService.login(input)

    setSessionCookie(c, config, result.token)

    return c.json({
      data: result.user,
    })
  })

  routes.post('/logout', async (c) => {
    const token = readSessionToken(c, config)

    if (token) {
      await authService.logout(token)
    }

    clearSessionCookie(c, config)

    return c.body(null, 204)
  })

  routes.get('/me', requireAuthentication, (c) => {
    return c.json({
      data: getAuthenticatedUser(c),
    })
  })

  routes.post('/email-verification/request', async (c) => {
    const input = emailVerificationRequestSchema.parse(await c.req.json())
    const clientIp = getClientIp(c, config.trustProxy)
    const decision = authRateLimiter.checkEmailVerificationRequest(clientIp, input.email)

    if (!decision.allowed) {
      throw new TooManyAttemptsError(decision.retryAfterSeconds)
    }

    await authService.requestEmailVerification(input)

    return c.json(
      {
        data: {
          status: 'accepted',
        },
      },
      202,
    )
  })

  routes.post('/email-verification/confirm', async (c) => {
    const input = emailVerificationConfirmSchema.parse(await c.req.json())
    const clientIp = getClientIp(c, config.trustProxy)
    const decision = authRateLimiter.checkTokenConfirmation(clientIp)

    if (!decision.allowed) {
      throw new TooManyAttemptsError(decision.retryAfterSeconds)
    }

    await authService.confirmEmailVerification(input)

    return c.body(null, 204)
  })

  routes.post('/password-reset/request', async (c) => {
    const input = passwordResetRequestSchema.parse(await c.req.json())
    const clientIp = getClientIp(c, config.trustProxy)
    const decision = authRateLimiter.checkPasswordResetRequest(clientIp, input.email)

    if (!decision.allowed) {
      throw new TooManyAttemptsError(decision.retryAfterSeconds)
    }

    await authService.requestPasswordReset(input)

    return c.json(
      {
        data: {
          status: 'accepted',
        },
      },
      202,
    )
  })

  routes.post('/password-reset/confirm', async (c) => {
    const input = passwordResetConfirmSchema.parse(await c.req.json())
    const clientIp = getClientIp(c, config.trustProxy)
    const decision = authRateLimiter.checkTokenConfirmation(clientIp)

    if (!decision.allowed) {
      throw new TooManyAttemptsError(decision.retryAfterSeconds)
    }

    await authService.resetPassword(input)

    return c.body(null, 204)
  })

  return routes
}
