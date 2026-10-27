import { z } from 'zod'

const nodeEnvSchema = z.enum(['development', 'test', 'production'])

const databaseUrlSchema = z
  .string()
  .min(1, 'DATABASE_URL is required.')
  .refine(
    (value) => {
      try {
        const url = new URL(value)
        return url.protocol === 'postgres:' || url.protocol === 'postgresql:'
      } catch {
        return false
      }
    },
    { message: 'DATABASE_URL must be a valid PostgreSQL connection URL.' },
  )

const frontendOriginSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value, ctx) => {
    if (value === '*') {
      ctx.addIssue({ code: 'custom', message: 'FRONTEND_ORIGIN cannot be a wildcard.' })
      return z.NEVER
    }

    try {
      const url = new URL(value)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        ctx.addIssue({
          code: 'custom',
          message: 'FRONTEND_ORIGIN must use http or https.',
        })
        return z.NEVER
      }
      if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
        ctx.addIssue({
          code: 'custom',
          message: 'FRONTEND_ORIGIN must contain only an origin without a path or query.',
        })
        return z.NEVER
      }
      return url.origin
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'FRONTEND_ORIGIN must be a valid URL origin.',
      })
      return z.NEVER
    }
  })
  .optional()

const smtpUrlSchema = z
  .string()
  .trim()
  .min(1, 'SMTP_URL cannot be empty.')
  .refine(
    (value) => {
      try {
        const url = new URL(value)
        return url.protocol === 'smtp:' || url.protocol === 'smtps:'
      } catch {
        return false
      }
    },
    { message: 'SMTP_URL must be a valid smtp:// or smtps:// URL.' },
  )

const mailFromSchema = z
  .string()
  .trim()
  .min(1, 'MAIL_FROM is required.')
  .max(320, 'MAIL_FROM is too long.')
  .refine((value) => !/[\r\n]/.test(value), 'MAIL_FROM cannot contain line breaks.')

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  DATABASE_URL: databaseUrlSchema,
  FRONTEND_ORIGIN: frontendOriginSchema,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  MAIL_DELIVERY: z.enum(['file', 'smtp']).default('file'),
  MAIL_FROM: mailFromSchema.default('Work <no-reply@work.local>'),
  MAIL_OUTBOX_DIR: z.string().trim().min(1).default('.mail-outbox'),
  SMTP_URL: smtpUrlSchema.optional(),
})

export type NodeEnv = z.infer<typeof nodeEnvSchema>
export type LogLevel = z.infer<typeof envSchema>['LOG_LEVEL']
export type MailDelivery = z.infer<typeof envSchema>['MAIL_DELIVERY']

export interface Env {
  NODE_ENV: NodeEnv
  PORT: number
  HOST: string
  DATABASE_URL: string
  FRONTEND_ORIGIN: string
  LOG_LEVEL: LogLevel
  TRUST_PROXY: boolean
  MAIL_DELIVERY: MailDelivery
  MAIL_FROM: string
  MAIL_OUTBOX_DIR: string
  SMTP_URL?: string
}

export interface EnvIssue {
  path: string
  message: string
}

export class EnvValidationError extends Error {
  readonly issues: EnvIssue[]

  constructor(issues: EnvIssue[]) {
    super('Invalid environment configuration')
    this.name = 'EnvValidationError'
    this.issues = issues
  }
}

export function parseEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(raw)

  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    )
  }

  if (!result.data.FRONTEND_ORIGIN && result.data.NODE_ENV === 'production') {
    throw new EnvValidationError([
      {
        path: 'FRONTEND_ORIGIN',
        message: 'FRONTEND_ORIGIN is required in production.',
      },
    ])
  }

  if (result.data.MAIL_DELIVERY === 'smtp' && !result.data.SMTP_URL) {
    throw new EnvValidationError([
      {
        path: 'SMTP_URL',
        message: 'SMTP_URL is required when MAIL_DELIVERY is smtp.',
      },
    ])
  }

  return Object.freeze({
    ...result.data,
    FRONTEND_ORIGIN: result.data.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  })
}
