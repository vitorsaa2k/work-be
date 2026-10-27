import type { Context, MiddlewareHandler } from 'hono'

import { AuthenticationRequiredError } from '../../lib/errors.js'
import type { AppEnv } from '../../types/app-env.js'
import type { AuthConfig } from './auth.config.js'
import { readSessionToken } from './auth.cookies.js'
import type { AuthService, AuthenticatedUserDto } from './auth.service.js'

export function createAuthMiddleware(
  authService: AuthService,
  config: AuthConfig,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = readSessionToken(c, config)

    if (!token) {
      throw new AuthenticationRequiredError()
    }

    const user = await authService.authenticate(token)

    if (!user) {
      throw new AuthenticationRequiredError()
    }

    c.set('user', user)
    await next()
  }
}

export function getAuthenticatedUser(c: Context<AppEnv>): AuthenticatedUserDto {
  const user = c.get('user')

  if (!user) {
    throw new AuthenticationRequiredError()
  }

  return user
}
