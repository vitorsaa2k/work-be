import { describe, expect, it } from 'vitest'

import {
  createSessionToken,
  hashSessionToken,
  isValidSessionTokenFormat,
} from '../../src/modules/auth/session-token.js'

describe('session tokens', () => {
  it('generates URL-safe opaque tokens and stores only a deterministic hash', () => {
    const first = createSessionToken()
    const second = createSessionToken()

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(first.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(first.tokenHash).toBe(hashSessionToken(first.token))
    expect(first.tokenHash).not.toBe(first.token)
    expect(second.token).not.toBe(first.token)
    expect(second.tokenHash).not.toBe(first.tokenHash)
  })

  it('rejects malformed tokens before database lookup', () => {
    expect(isValidSessionTokenFormat('')).toBe(false)
    expect(isValidSessionTokenFormat('short')).toBe(false)
    expect(isValidSessionTokenFormat('a'.repeat(42))).toBe(false)
    expect(isValidSessionTokenFormat('a'.repeat(44))).toBe(false)
    expect(isValidSessionTokenFormat(`${'a'.repeat(42)}!`)).toBe(false)
    expect(isValidSessionTokenFormat('a'.repeat(43))).toBe(true)
  })
})
