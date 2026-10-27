import { z } from 'zod'

export const PUBLIC_GIG_STATUSES = ['OPEN'] as const

export const DEFAULT_GIG_PAGE_SIZE = 20
export const MAX_GIG_PAGE_SIZE = 50

export const gigIdSchema = z.uuid('The gig ID must be a valid UUID.')

export const gigParamsSchema = z.object({
  gigId: gigIdSchema,
})

export const listGigsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_GIG_PAGE_SIZE).default(DEFAULT_GIG_PAGE_SIZE),
    status: z.enum(PUBLIC_GIG_STATUSES).optional(),
    city: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().min(1).max(80).optional(),
  })
  .strict()

export type ListGigsQuery = z.infer<typeof listGigsQuerySchema>
export type PublicGigStatus = (typeof PUBLIC_GIG_STATUSES)[number]
