import { describe, expect, it } from 'vitest'

import {
  createAuthConfig,
  EMAIL_VERIFICATION_TTL_SECONDS,
  PASSWORD_RESET_TTL_SECONDS,
  PRODUCTION_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from '../../src/modules/auth/auth.config.js'

describe('auth configuration', () => {
  it('uses a host-only secure cookie with a 30-day session in production', () => {
    expect(createAuthConfig('production')).toEqual({
      sessionCookieName: PRODUCTION_SESSION_COOKIE_NAME,
      sessionTtlSeconds: SESSION_TTL_SECONDS,
      emailVerificationTtlSeconds: EMAIL_VERIFICATION_TTL_SECONDS,
      passwordResetTtlSeconds: PASSWORD_RESET_TTL_SECONDS,
      secureCookies: true,
      trustProxy: false,
    })
    expect(PRODUCTION_SESSION_COOKIE_NAME).toBe('__Host-work_session')
    expect(SESSION_TTL_SECONDS).toBe(30 * 24 * 60 * 60)
    expect(EMAIL_VERIFICATION_TTL_SECONDS).toBe(24 * 60 * 60)
    expect(PASSWORD_RESET_TTL_SECONDS).toBe(30 * 60)
  })

  it('allows non-secure cookies only outside production', () => {
    expect(createAuthConfig('development')).toEqual({
      sessionCookieName: SESSION_COOKIE_NAME,
      sessionTtlSeconds: SESSION_TTL_SECONDS,
      emailVerificationTtlSeconds: EMAIL_VERIFICATION_TTL_SECONDS,
      passwordResetTtlSeconds: PASSWORD_RESET_TTL_SECONDS,
      secureCookies: false,
      trustProxy: false,
    })
    expect(createAuthConfig('test').secureCookies).toBe(false)
  })

  it('enables trusted proxy handling only when explicitly configured', () => {
    expect(createAuthConfig('production', true).trustProxy).toBe(true)
    expect(createAuthConfig('development').trustProxy).toBe(false)
  })
})
