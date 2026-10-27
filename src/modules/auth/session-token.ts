import { createHash, randomBytes } from 'node:crypto'

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export interface GeneratedSessionToken {
  token: string
  tokenHash: string
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function isValidSessionTokenFormat(token: string): boolean {
  return SESSION_TOKEN_PATTERN.test(token)
}

export function createSessionToken(): GeneratedSessionToken {
  const token = randomBytes(32).toString('base64url')

  return {
    token,
    tokenHash: hashSessionToken(token),
  }
}
