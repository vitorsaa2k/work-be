import type { NodeEnv } from '../../config/env.js'

export const SESSION_COOKIE_NAME = 'work_session'
export const PRODUCTION_SESSION_COOKIE_NAME = `__Host-${SESSION_COOKIE_NAME}`
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
export const EMAIL_VERIFICATION_TTL_SECONDS = 24 * 60 * 60
export const PASSWORD_RESET_TTL_SECONDS = 30 * 60

export interface AuthConfig {
  sessionCookieName: string
  sessionTtlSeconds: number
  emailVerificationTtlSeconds: number
  passwordResetTtlSeconds: number
  secureCookies: boolean
  trustProxy: boolean
}

export function createAuthConfig(nodeEnv: NodeEnv, trustProxy = false): AuthConfig {
  const secureCookies = nodeEnv === 'production'

  return {
    sessionCookieName: secureCookies ? PRODUCTION_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME,
    sessionTtlSeconds: SESSION_TTL_SECONDS,
    emailVerificationTtlSeconds: EMAIL_VERIFICATION_TTL_SECONDS,
    passwordResetTtlSeconds: PASSWORD_RESET_TTL_SECONDS,
    secureCookies,
    trustProxy,
  }
}
