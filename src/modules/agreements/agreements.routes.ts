import { Hono } from 'hono'

import type { AppEnv } from '../../types/app-env.js'
import type { AuthConfig } from '../auth/auth.config.js'
import {
  createAuthMiddleware,
  createVerifiedEmailMiddleware,
  getAuthenticatedUser,
} from '../auth/auth.middleware.js'
import type { AuthService } from '../auth/auth.service.js'
import { agreementParamsSchema, cancelAgreementSchema } from './agreements.schemas.js'
import type { AgreementsService } from './agreements.service.js'

export function createAgreementsRoutes(
  agreementsService: AgreementsService,
  authService: AuthService,
  config: AuthConfig,
): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()
  const requireAuthentication = createAuthMiddleware(authService, config)
  const requireVerifiedEmail = createVerifiedEmailMiddleware()

  routes.get('/:agreementId', requireAuthentication, async (c) => {
    const { agreementId } = agreementParamsSchema.parse({
      agreementId: c.req.param('agreementId'),
    })
    const agreement = await agreementsService.get(agreementId, getAuthenticatedUser(c).id)

    return c.json({
      data: agreement,
    })
  })

  routes.get('/:agreementId/address', requireAuthentication, async (c) => {
    const { agreementId } = agreementParamsSchema.parse({
      agreementId: c.req.param('agreementId'),
    })
    const address = await agreementsService.getAddress(agreementId, getAuthenticatedUser(c).id)

    return c.json({
      data: address,
    })
  })

  routes.post('/:agreementId/start', requireAuthentication, requireVerifiedEmail, async (c) => {
    const { agreementId } = agreementParamsSchema.parse({
      agreementId: c.req.param('agreementId'),
    })
    const agreement = await agreementsService.confirmStart(agreementId, getAuthenticatedUser(c).id)

    return c.json({
      data: agreement,
    })
  })

  routes.post(
    '/:agreementId/confirm-completion',
    requireAuthentication,
    requireVerifiedEmail,
    async (c) => {
      const { agreementId } = agreementParamsSchema.parse({
        agreementId: c.req.param('agreementId'),
      })
      const agreement = await agreementsService.confirmCompletion(
        agreementId,
        getAuthenticatedUser(c).id,
      )

      return c.json({
        data: agreement,
      })
    },
  )

  routes.post('/:agreementId/cancel', requireAuthentication, requireVerifiedEmail, async (c) => {
    const { agreementId } = agreementParamsSchema.parse({
      agreementId: c.req.param('agreementId'),
    })
    const input = cancelAgreementSchema.parse(await c.req.json().catch(() => ({})))
    const agreement = await agreementsService.cancel(agreementId, getAuthenticatedUser(c).id, input)

    return c.json({
      data: agreement,
    })
  })

  return routes
}
