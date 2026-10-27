import { z } from 'zod'

export const PUBLIC_GIG_STATUSES = ['OPEN'] as const
export const OWNER_GIG_STATUSES = [
  'DRAFT',
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELED',
  'EXPIRED',
] as const

export const DEFAULT_GIG_PAGE_SIZE = 20
export const MAX_GIG_PAGE_SIZE = 50

export const gigIdSchema = z.uuid('The gig ID must be a valid UUID.')
export const applicationIdSchema = z.uuid('The application ID must be a valid UUID.')

export const gigParamsSchema = z.object({
  gigId: gigIdSchema,
})

export const selectWorkerParamsSchema = gigParamsSchema

export const listGigsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_GIG_PAGE_SIZE).default(DEFAULT_GIG_PAGE_SIZE),
    status: z.enum(PUBLIC_GIG_STATUSES).optional(),
    city: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().min(1).max(80).optional(),
  })
  .strict()

export const ownerGigsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_GIG_PAGE_SIZE).default(DEFAULT_GIG_PAGE_SIZE),
    status: z.enum(OWNER_GIG_STATUSES).optional(),
  })
  .strict()

const addressSchema = z
  .object({
    street: z.string().trim().min(3, 'The street must contain at least 3 characters.').max(200),
    number: z.string().trim().min(1, 'The address number is required.').max(20),
    complement: z.string().trim().max(120).nullable().optional(),
    accessInstructions: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()

export const gigWriteSchema = z
  .object({
    title: z.string().trim().min(5, 'The title must contain at least 5 characters.').max(200),
    description: z
      .string()
      .trim()
      .min(20, 'The description must contain at least 20 characters.')
      .max(2000),
    category: z.string().trim().min(1, 'The category is required.').max(80),
    price: z
      .object({
        amount: z.number().int().positive().max(100_000_000),
        currency: z
          .string()
          .trim()
          .regex(/^[A-Z]{3}$/, 'The currency must be an uppercase ISO code.'),
      })
      .strict(),
    estimatedDurationMinutes: z.number().int().min(30).max(720),
    scheduledAt: z.iso
      .datetime({ offset: true })
      .nullable()
      .optional()
      .transform((value) => (value === null || value === undefined ? null : new Date(value))),
    city: z.string().trim().min(1, 'The city is required.').max(120),
    location: z.string().trim().min(1, 'The area is required.').max(120),
    type: z.enum(['PERSONAL', 'BUSINESS']),
    address: addressSchema,
    publish: z.boolean().default(false),
  })
  .strict()

export const cancelGigSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()

export const selectWorkerSchema = z
  .object({
    applicationId: applicationIdSchema,
  })
  .strict()

export type ListGigsQuery = z.infer<typeof listGigsQuerySchema>
export type OwnerGigsQuery = z.infer<typeof ownerGigsQuerySchema>
export type GigWriteInput = z.infer<typeof gigWriteSchema>
export type CancelGigInput = z.infer<typeof cancelGigSchema>
export type SelectWorkerInput = z.infer<typeof selectWorkerSchema>
export type PublicGigStatus = (typeof PUBLIC_GIG_STATUSES)[number]
