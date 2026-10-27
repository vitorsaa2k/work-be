import { Hono } from 'hono'

import type { AppEnv } from '../../types/app-env.js'
import type { ApplicationsService } from '../applications/applications.service.js'
import { applyToGigSchema } from '../applications/applications.schemas.js'
import type { AgreementsService } from '../agreements/agreements.service.js'
import type { AuthConfig } from '../auth/auth.config.js'
import {
  createAuthMiddleware,
  createVerifiedEmailMiddleware,
  getAuthenticatedUser,
} from '../auth/auth.middleware.js'
import type { AuthService } from '../auth/auth.service.js'
import {
  cancelGigSchema,
  gigParamsSchema,
  gigWriteSchema,
  listGigsQuerySchema,
  ownerGigsQuerySchema,
  selectWorkerSchema,
} from './gigs.schemas.js'
import type { GigsService } from './gigs.service.js'

export function createGigsRoutes(
  gigsService: GigsService,
  applicationsService: ApplicationsService,
  agreementsService: AgreementsService,
  authService: AuthService,
  config: AuthConfig,
): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()
  const requireAuthentication = createAuthMiddleware(authService, config)
  const requireVerifiedEmail = createVerifiedEmailMiddleware()

  routes.get('/', async (c) => {
    const query = listGigsQuerySchema.parse(c.req.query())
    const result = await gigsService.listPublicGigs(query)

    return c.json({
      data: result.items,
      meta: result.meta,
    })
  })

  routes.get('/mine', requireAuthentication, async (c) => {
    const query = ownerGigsQuerySchema.parse(c.req.query())
    const result = await gigsService.listOwnedGigs(getAuthenticatedUser(c).id, query)

    return c.json({
      data: result.items,
      meta: result.meta,
    })
  })

  routes.post('/', requireAuthentication, requireVerifiedEmail, async (c) => {
    const input = gigWriteSchema.parse(await c.req.json())
    const gig = await gigsService.createGig(getAuthenticatedUser(c).id, input)

    return c.json(
      {
        data: gig,
      },
      201,
    )
  })

  routes.get('/:gigId/private', requireAuthentication, async (c) => {
    const { gigId } = gigParamsSchema.parse({ gigId: c.req.param('gigId') })
    const gig = await gigsService.getOwnedGig(gigId, getAuthenticatedUser(c).id)

    return c.json({
      data: gig,
    })
  })

  routes.get('/:gigId/applications', requireAuthentication, async (c) => {
    const { gigId } = gigParamsSchema.parse({ gigId: c.req.param('gigId') })
    const result = await applicationsService.listForGig(gigId, getAuthenticatedUser(c).id)

    return c.json({
      data: result,
    })
  })

  routes.post('/:gigId/applications', requireAuthentication, requireVerifiedEmail, async (c) => {
    const { gigId } = gigParamsSchema.parse({ gigId: c.req.param('gigId') })
    const input = applyToGigSchema.parse(await c.req.json().catch(() => ({})))
    const application = await applicationsService.apply(gigId, getAuthenticatedUser(c).id, input)

    return c.json(
      {
        data: application,
      },
      201,
    )
  })

  routes.post('/:gigId/select-worker', requireAuthentication, requireVerifiedEmail, async (c) => {
    const { gigId } = gigParamsSchema.parse({ gigId: c.req.param('gigId') })
    const input = selectWorkerSchema.parse(await c.req.json())
    const agreement = await agreementsService.selectWorker(
      gigId,
      input.applicationId,
      getAuthenticatedUser(c).id,
    )

    return c.json(
      {
        data: agreement,
      },
      201,
    )
  })

  routes.post('/:gigId/cancel', requireAuthentication, requireVerifiedEmail, async (c) => {
    const { gigId } = gigParamsSchema.parse({ gigId: c.req.param('gigId') })
    const input = cancelGigSchema.parse(await c.req.json().catch(() => ({})))
    const gig = await gigsService.cancelGig(gigId, getAuthenticatedUser(c).id, input)

    return c.json({
      data: gig,
    })
  })

  routes.patch('/:gigId', requireAuthentication, requireVerifiedEmail, async (c) => {
    const { gigId } = gigParamsSchema.parse({ gigId: c.req.param('gigId') })
    const input = gigWriteSchema.parse(await c.req.json())
    const gig = await gigsService.updateGig(gigId, getAuthenticatedUser(c).id, input)

    return c.json({
      data: gig,
    })
  })

  routes.get('/:gigId', async (c) => {
    const { gigId } = gigParamsSchema.parse({ gigId: c.req.param('gigId') })
    const gig = await gigsService.getPublicGig(gigId)

    return c.json({
      data: gig,
    })
  })

  return routes
}
