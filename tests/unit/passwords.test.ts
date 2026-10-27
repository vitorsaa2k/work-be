import { describe, expect, it } from 'vitest'

import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../../src/lib/passwords.js'

describe('password hashing', () => {
  it('hashes passwords with Argon2id and verifies only the original value', async () => {
    const password = 'correct horse battery staple'
    const passwordHash = await hashPassword(password)

    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    expect(passwordHash.length).toBeLessThanOrEqual(255)
    await expect(verifyPassword(passwordHash, password)).resolves.toBe(true)
    await expect(verifyPassword(passwordHash, 'wrong password')).resolves.toBe(false)
  })

  it('uses a distinct salt for every hash', async () => {
    const firstHash = await hashPassword('same password')
    const secondHash = await hashPassword('same password')

    expect(firstHash).not.toBe(secondHash)
    await expect(verifyPassword(firstHash, 'same password')).resolves.toBe(true)
    await expect(verifyPassword(secondHash, 'same password')).resolves.toBe(true)
  })

  it('fails closed for missing or malformed password hashes', async () => {
    await expect(verifyPassword('', 'password')).resolves.toBe(false)
    await expect(verifyPassword('$argon2id$invalid', 'password')).resolves.toBe(false)
    await expect(verifyPassword(DUMMY_PASSWORD_HASH, 'password')).resolves.toBe(false)
  })
})
