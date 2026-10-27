import { Hono } from 'hono'

import type { AppEnv } from '../../types/app-env.js'
import { gigParamsSchema, listGigsQuerySchema } from './gigs.schemas.js'
import type { GigsService } from './gigs.service.js'

export function createGigsRoutes(gigsService: GigsService): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()

  routes.get('/', async (c) => {
    const query = listGigsQuerySchema.parse(c.req.query())
    const result = await gigsService.listPublicGigs(query)

    return c.json({
      data: result.items,
      meta: result.meta,
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
