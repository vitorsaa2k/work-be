import { z } from 'zod'

export const agreementIdSchema = z.uuid('The agreement ID must be a valid UUID.')

export const agreementParamsSchema = z.object({
  agreementId: agreementIdSchema,
})

export const cancelAgreementSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()

export type CancelAgreementInput = z.infer<typeof cancelAgreementSchema>
