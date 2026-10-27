import { hash, verify } from '@node-rs/argon2'

const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$fzeP51QYSgsptZlhnWAEzg$JdzffLN8p0qxvueGoewJNEoiil9J5uQAmT8PJo1u4xw'

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  if (!passwordHash) {
    return false
  }

  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}
