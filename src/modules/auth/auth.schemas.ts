import { z } from 'zod'

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(320, 'The email address is too long.')
  .pipe(z.email('The email address is invalid.'))

const passwordSchema = z
  .string()
  .min(12, 'The password must contain at least 12 characters.')
  .max(128, 'The password must contain at most 128 characters.')
  .refine(
    (value) => value.trim().length > 0,
    'The password must contain a non-whitespace character.',
  )

const authTokenSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'The token is invalid.')

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, 'The password is required.').max(1024, 'The password is too long.'),
  })
  .strict()

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'The name must contain at least 2 characters.')
      .max(120, 'The name must contain at most 120 characters.'),
    email: emailSchema,
    password: passwordSchema,
  })
  .strict()

export const emailVerificationRequestSchema = z
  .object({
    email: emailSchema,
  })
  .strict()

export const emailVerificationConfirmSchema = z
  .object({
    token: authTokenSchema,
  })
  .strict()

export const passwordResetRequestSchema = z
  .object({
    email: emailSchema,
  })
  .strict()

export const passwordResetConfirmSchema = z
  .object({
    token: authTokenSchema,
    password: passwordSchema,
  })
  .strict()

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type EmailVerificationRequestInput = z.infer<typeof emailVerificationRequestSchema>
export type EmailVerificationConfirmInput = z.infer<typeof emailVerificationConfirmSchema>
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>
