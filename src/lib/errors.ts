import { ZodError } from 'zod'

export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  CANNOT_APPLY_TO_OWN_GIG: 'CANNOT_APPLY_TO_OWN_GIG',
  ALREADY_APPLIED: 'ALREADY_APPLIED',
  APPLICATION_NOT_PENDING: 'APPLICATION_NOT_PENDING',
  GIG_NOT_OPEN: 'GIG_NOT_OPEN',
  GIG_EXPIRED: 'GIG_EXPIRED',
  INVALID_GIG_STATE: 'INVALID_GIG_STATE',
  INVALID_AGREEMENT_STATE: 'INVALID_AGREEMENT_STATE',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export interface ErrorDetail {
  path: string
  message: string
}

export interface ErrorBody {
  error: {
    code: ErrorCode
    message: string
    requestId: string
    details?: ErrorDetail[]
  }
}

export interface AppErrorOptions {
  details?: ErrorDetail[]
  cause?: unknown
  headers?: Record<string, string>
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly statusCode: number
  readonly details?: ErrorDetail[]
  readonly headers?: Record<string, string>

  constructor(code: ErrorCode, message: string, statusCode: number, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause })
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.details = options.details
    this.headers = options.headers
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found.', options: AppErrorOptions = {}) {
    super(ERROR_CODES.NOT_FOUND, message, 404, options)
    this.name = 'NotFoundError'
  }
}

export class AuthenticationRequiredError extends AppError {
  constructor(message = 'Authentication is required.', options: AppErrorOptions = {}) {
    super(ERROR_CODES.AUTHENTICATION_REQUIRED, message, 401, options)
    this.name = 'AuthenticationRequiredError'
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message = 'Invalid email or password.', options: AppErrorOptions = {}) {
    super(ERROR_CODES.INVALID_CREDENTIALS, message, 401, options)
    this.name = 'InvalidCredentialsError'
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'The request is not allowed.', options: AppErrorOptions = {}) {
    super(ERROR_CODES.FORBIDDEN, message, 403, options)
    this.name = 'ForbiddenError'
  }
}

export class EmailAlreadyRegisteredError extends AppError {
  constructor(
    message = 'An account with this email address already exists.',
    options: AppErrorOptions = {},
  ) {
    super(ERROR_CODES.EMAIL_ALREADY_REGISTERED, message, 409, options)
    this.name = 'EmailAlreadyRegisteredError'
  }
}

export class EmailNotVerifiedError extends AppError {
  constructor(
    message = 'Verify your email address before making marketplace changes.',
    options: AppErrorOptions = {},
  ) {
    super(ERROR_CODES.EMAIL_NOT_VERIFIED, message, 403, options)
    this.name = 'EmailNotVerifiedError'
  }
}

export class CannotApplyToOwnGigError extends AppError {
  constructor(message = 'You cannot apply to your own gig.', options: AppErrorOptions = {}) {
    super(ERROR_CODES.CANNOT_APPLY_TO_OWN_GIG, message, 403, options)
    this.name = 'CannotApplyToOwnGigError'
  }
}

export class AlreadyAppliedError extends AppError {
  constructor(
    message = 'You already have an application for this gig.',
    options: AppErrorOptions = {},
  ) {
    super(ERROR_CODES.ALREADY_APPLIED, message, 409, options)
    this.name = 'AlreadyAppliedError'
  }
}

export class ApplicationNotPendingError extends AppError {
  constructor(
    message = 'Only pending applications can be withdrawn.',
    options: AppErrorOptions = {},
  ) {
    super(ERROR_CODES.APPLICATION_NOT_PENDING, message, 409, options)
    this.name = 'ApplicationNotPendingError'
  }
}

export class GigNotOpenError extends AppError {
  constructor(
    message = 'This gig is no longer accepting applications.',
    options: AppErrorOptions = {},
  ) {
    super(ERROR_CODES.GIG_NOT_OPEN, message, 409, options)
    this.name = 'GigNotOpenError'
  }
}

export class GigExpiredError extends AppError {
  constructor(message = 'This gig has expired.', options: AppErrorOptions = {}) {
    super(ERROR_CODES.GIG_EXPIRED, message, 409, options)
    this.name = 'GigExpiredError'
  }
}

export class InvalidGigStateError extends AppError {
  constructor(
    message = 'The gig is not in a state that allows this action.',
    options: AppErrorOptions = {},
  ) {
    super(ERROR_CODES.INVALID_GIG_STATE, message, 409, options)
    this.name = 'InvalidGigStateError'
  }
}

export class InvalidAgreementStateError extends AppError {
  constructor(
    message = 'The agreement is not in a state that allows this action.',
    options: AppErrorOptions = {},
  ) {
    super(ERROR_CODES.INVALID_AGREEMENT_STATE, message, 409, options)
    this.name = 'InvalidAgreementStateError'
  }
}

export class InvalidTokenError extends AppError {
  constructor(message = 'The token is invalid or has expired.', options: AppErrorOptions = {}) {
    super(ERROR_CODES.INVALID_TOKEN, message, 400, options)
    this.name = 'InvalidTokenError'
  }
}

export class TooManyAttemptsError extends AppError {
  readonly retryAfterSeconds: number

  constructor(
    retryAfterSeconds: number,
    message = 'Too many authentication attempts. Try again later.',
    options: AppErrorOptions = {},
  ) {
    const safeRetryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds))

    super(ERROR_CODES.TOO_MANY_ATTEMPTS, message, 429, {
      ...options,
      headers: {
        ...options.headers,
        'Retry-After': String(safeRetryAfterSeconds),
      },
    })
    this.name = 'TooManyAttemptsError'
    this.retryAfterSeconds = safeRetryAfterSeconds
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'The service is temporarily unavailable.', options: AppErrorOptions = {}) {
    super(ERROR_CODES.SERVICE_UNAVAILABLE, message, 503, options)
    this.name = 'ServiceUnavailableError'
  }
}

export interface ErrorMapping {
  statusCode: number
  body: ErrorBody
  logLevel: 'warn' | 'error'
}

interface PrismaLikeError {
  code: string
}

function isPrismaLikeError(error: unknown): error is PrismaLikeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    /^P\d{4}$/.test((error as { code: string }).code)
  )
}

function createBody(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: ErrorDetail[],
): ErrorBody {
  return {
    error: {
      code,
      message,
      requestId,
      ...(details && details.length > 0 ? { details } : {}),
    },
  }
}

export function createErrorBody(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: ErrorDetail[],
): ErrorBody {
  return createBody(code, message, requestId, details)
}

export function mapError(error: unknown, requestId: string): ErrorMapping {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: createBody(
        error.code,
        error.message,
        requestId,
        error.statusCode >= 500 ? undefined : error.details,
      ),
      logLevel: error.statusCode >= 500 ? 'error' : 'warn',
    }
  }

  if (error instanceof ZodError) {
    const details = error.issues.slice(0, 20).map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    }))

    return {
      statusCode: 400,
      body: createBody(
        ERROR_CODES.VALIDATION_ERROR,
        'The request contains invalid data.',
        requestId,
        details,
      ),
      logLevel: 'warn',
    }
  }

  if (error instanceof SyntaxError) {
    return {
      statusCode: 400,
      body: createBody(ERROR_CODES.BAD_REQUEST, 'The request body is not valid JSON.', requestId),
      logLevel: 'warn',
    }
  }

  if (isPrismaLikeError(error)) {
    if (error.code === 'P2025') {
      return {
        statusCode: 404,
        body: createBody(ERROR_CODES.NOT_FOUND, 'The requested resource was not found.', requestId),
        logLevel: 'warn',
      }
    }

    if (error.code === 'P2002' || error.code === 'P2003') {
      return {
        statusCode: 409,
        body: createBody(
          ERROR_CODES.CONFLICT,
          'The operation conflicts with existing data.',
          requestId,
        ),
        logLevel: 'warn',
      }
    }
  }

  return {
    statusCode: 500,
    body: createBody(ERROR_CODES.INTERNAL_SERVER_ERROR, 'An unexpected error occurred.', requestId),
    logLevel: 'error',
  }
}
