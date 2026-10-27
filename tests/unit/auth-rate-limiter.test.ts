import { describe, expect, it } from 'vitest'

import { createAuthRateLimiter } from '../../src/modules/auth/auth-rate-limiter.js'

const allowedRule = { limit: 100, windowMs: 60_000 }

describe('auth rate limiter', () => {
  it('blocks login attempts after the per-IP limit', () => {
    let now = 1_000
    const limiter = createAuthRateLimiter({
      loginIp: { limit: 2, windowMs: 60_000 },
      loginEmail: allowedRule,
      now: () => now,
    })

    expect(limiter.checkLogin('203.0.113.1', 'first@example.test').allowed).toBe(true)
    expect(limiter.checkLogin('203.0.113.1', 'second@example.test').allowed).toBe(true)

    now += 1_000
    expect(limiter.checkLogin('203.0.113.1', 'third@example.test')).toEqual({
      allowed: false,
      retryAfterSeconds: 59,
    })
    expect(limiter.checkLogin('203.0.113.2', 'fourth@example.test').allowed).toBe(true)
  })

  it('blocks repeated attempts for one email independently of other emails', () => {
    const now = 5_000
    const limiter = createAuthRateLimiter({
      loginIp: allowedRule,
      loginEmail: { limit: 2, windowMs: 60_000 },
      now: () => now,
    })

    expect(limiter.checkLogin('203.0.113.1', 'target@example.test').allowed).toBe(true)
    expect(limiter.checkLogin('203.0.113.2', 'target@example.test').allowed).toBe(true)
    expect(limiter.checkLogin('203.0.113.3', 'target@example.test').allowed).toBe(false)
    expect(limiter.checkLogin('203.0.113.3', 'other@example.test').allowed).toBe(true)
  })

  it('limits registration attempts separately per IP', () => {
    const now = 10_000
    const limiter = createAuthRateLimiter({
      loginIp: allowedRule,
      loginEmail: allowedRule,
      registrationIp: { limit: 1, windowMs: 60_000 },
      now: () => now,
    })

    expect(limiter.checkRegistration('203.0.113.1').allowed).toBe(true)
    expect(limiter.checkRegistration('203.0.113.1').allowed).toBe(false)
    expect(limiter.checkRegistration('203.0.113.2').allowed).toBe(true)
  })

  it('limits verification and reset requests independently per email and IP', () => {
    const now = 20_000
    const limiter = createAuthRateLimiter({
      emailVerificationIp: allowedRule,
      emailVerificationEmail: { limit: 2, windowMs: 60_000 },
      passwordResetIp: { limit: 2, windowMs: 60_000 },
      passwordResetEmail: allowedRule,
      now: () => now,
    })

    expect(
      limiter.checkEmailVerificationRequest('203.0.113.1', 'target@example.test').allowed,
    ).toBe(true)
    expect(
      limiter.checkEmailVerificationRequest('203.0.113.2', 'target@example.test').allowed,
    ).toBe(true)
    expect(
      limiter.checkEmailVerificationRequest('203.0.113.3', 'target@example.test').allowed,
    ).toBe(false)
    expect(limiter.checkEmailVerificationRequest('203.0.113.3', 'other@example.test').allowed).toBe(
      true,
    )

    expect(limiter.checkPasswordResetRequest('203.0.113.4', 'first@example.test').allowed).toBe(
      true,
    )
    expect(limiter.checkPasswordResetRequest('203.0.113.4', 'second@example.test').allowed).toBe(
      true,
    )
    expect(limiter.checkPasswordResetRequest('203.0.113.4', 'third@example.test').allowed).toBe(
      false,
    )
    expect(limiter.checkPasswordResetRequest('203.0.113.5', 'third@example.test').allowed).toBe(
      true,
    )
  })

  it('limits token confirmation attempts per IP', () => {
    const now = 30_000
    const limiter = createAuthRateLimiter({
      tokenConfirmationIp: { limit: 1, windowMs: 60_000 },
      now: () => now,
    })

    expect(limiter.checkTokenConfirmation('203.0.113.1').allowed).toBe(true)
    expect(limiter.checkTokenConfirmation('203.0.113.1')).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    })
    expect(limiter.checkTokenConfirmation('203.0.113.2').allowed).toBe(true)
  })

  it('starts a new window after the previous window expires', () => {
    let now = 1_000
    const limiter = createAuthRateLimiter({
      registrationIp: { limit: 1, windowMs: 1_000 },
      loginIp: allowedRule,
      loginEmail: allowedRule,
      now: () => now,
    })

    expect(limiter.checkRegistration('203.0.113.1').allowed).toBe(true)

    now = 1_999
    expect(limiter.checkRegistration('203.0.113.1')).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    })

    now = 2_000
    expect(limiter.checkRegistration('203.0.113.1').allowed).toBe(true)
  })

  it('clears all buckets when reset', () => {
    const limiter = createAuthRateLimiter({
      loginIp: { limit: 1, windowMs: 60_000 },
      loginEmail: { limit: 1, windowMs: 60_000 },
      registrationIp: { limit: 1, windowMs: 60_000 },
    })

    expect(limiter.checkLogin('203.0.113.1', 'user@example.test').allowed).toBe(true)
    expect(limiter.checkRegistration('203.0.113.1').allowed).toBe(true)
    expect(limiter.checkEmailVerificationRequest('203.0.113.1', 'user@example.test').allowed).toBe(
      true,
    )
    expect(limiter.checkPasswordResetRequest('203.0.113.1', 'user@example.test').allowed).toBe(true)
    expect(limiter.checkTokenConfirmation('203.0.113.1').allowed).toBe(true)
    expect(limiter.checkLogin('203.0.113.1', 'user@example.test').allowed).toBe(false)

    limiter.reset()

    expect(limiter.checkLogin('203.0.113.1', 'user@example.test').allowed).toBe(true)
    expect(limiter.checkRegistration('203.0.113.1').allowed).toBe(true)
    expect(limiter.checkEmailVerificationRequest('203.0.113.1', 'user@example.test').allowed).toBe(
      true,
    )
    expect(limiter.checkPasswordResetRequest('203.0.113.1', 'user@example.test').allowed).toBe(true)
    expect(limiter.checkTokenConfirmation('203.0.113.1').allowed).toBe(true)
  })
})
