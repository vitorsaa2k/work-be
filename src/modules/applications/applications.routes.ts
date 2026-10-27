import { Hono } from 'hono'

import type { AppEnv } from '../../types/app-env.js'
import type { AuthConfig } from '../auth/auth.config.js'
import {
  createAuthMiddleware,
  createVerifiedEmailMiddleware,
  getAuthenticatedUser,
} from '../auth/auth.middleware.js'
import type { AuthService } from '../auth/auth.service.js'
import { applicationParamsSchema } from './applications.schemas.js'
import type { ApplicationsService } from './applications.service.js'

export function createApplicationsRoutes(
  applicationsService: ApplicationsService,
  authService: AuthService,
  config: AuthConfig,
): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()
  const requireAuthentication = createAuthMiddleware(authService, config)
  const requireVerifiedEmail = createVerifiedEmailMiddleware()

  routes.get('/me', requireAuthentication, async (c) => {
    const applications = await applicationsService.listMine(getAuthenticatedUser(c).id)

    return c.json({
      data: applications,
    })
  })

  routes.post(
    '/:applicationId/withdraw',
    requireAuthentication,
    requireVerifiedEmail,
    async (c) => {
      const { applicationId } = applicationParamsSchema.parse({
        applicationId: c.req.param('applicationId'),
      })
      const application = await applicationsService.withdraw(
        applicationId,
        getAuthenticatedUser(c).id,
      )

      return c.json({
        data: application,
      })
    },
  )

  return routes
}
