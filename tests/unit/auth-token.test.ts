import { describe, expect, it } from 'vitest'

import {
  createAuthToken,
  hashAuthToken,
  isValidAuthTokenFormat,
} from '../../src/modules/auth/auth-token.js'

describe('auth token', () => {
  it('creates 256-bit URL-safe tokens and stores only their SHA-256 hash', () => {
    const first = createAuthToken()
    const second = createAuthToken()

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(first.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(first.tokenHash).toBe(hashAuthToken(first.token))
    expect(first.tokenHash).not.toBe(first.token)
    expect(first.token).not.toBe(second.token)
  })

  it('accepts only the expected token format', () => {
    expect(isValidAuthTokenFormat('a'.repeat(43))).toBe(true)
    expect(isValidAuthTokenFormat('a'.repeat(42))).toBe(false)
    expect(isValidAuthTokenFormat('a'.repeat(44))).toBe(false)
    expect(isValidAuthTokenFormat('a'.repeat(42) + '+')).toBe(false)
  })
})
