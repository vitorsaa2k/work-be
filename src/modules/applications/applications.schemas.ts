import { z } from 'zod'

export const applicationIdSchema = z.uuid('The application ID must be a valid UUID.')

export const applicationParamsSchema = z.object({
  applicationId: applicationIdSchema,
})

export const applyToGigSchema = z
  .object({
    message: z.string().trim().max(2000).optional(),
  })
  .strict()

export type ApplyToGigInput = z.infer<typeof applyToGigSchema>
