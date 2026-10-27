import { createHash, randomBytes } from 'node:crypto'

const AUTH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export interface GeneratedAuthToken {
  token: string
  tokenHash: string
}

export function hashAuthToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function isValidAuthTokenFormat(token: string): boolean {
  return AUTH_TOKEN_PATTERN.test(token)
}

export function createAuthToken(): GeneratedAuthToken {
  const token = randomBytes(32).toString('base64url')

  return {
    token,
    tokenHash: hashAuthToken(token),
  }
}
