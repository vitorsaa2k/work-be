import { describe, expect, it } from 'vitest'

import {
  emailVerificationConfirmSchema,
  emailVerificationRequestSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
} from '../../src/modules/auth/auth.schemas.js'

describe('loginSchema', () => {
  it('normalizes email casing and whitespace without altering the password', () => {
    const result = loginSchema.parse({
      email: '  User.Name@Example.Test  ',
      password: ' password with spaces ',
    })

    expect(result).toEqual({
      email: 'user.name@example.test',
      password: ' password with spaces ',
    })
  })

  it('rejects invalid emails and empty passwords', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'password' }).success).toBe(
      false,
    )
    expect(loginSchema.safeParse({ email: 'user@example.test', password: '' }).success).toBe(false)
  })

  it('rejects oversized credentials and unknown fields', () => {
    expect(
      loginSchema.safeParse({
        email: 'user@example.test',
        password: 'a'.repeat(1025),
      }).success,
    ).toBe(false)
    expect(
      loginSchema.safeParse({
        email: 'user@example.test',
        password: 'password',
        role: 'admin',
      }).success,
    ).toBe(false)
  })
})

describe('registerSchema', () => {
  it('normalizes the name and email without altering the password', () => {
    const result = registerSchema.parse({
      name: '  New User  ',
      email: 'New.User@Example.Test',
      password: ' password with spaces ',
    })

    expect(result).toEqual({
      name: 'New User',
      email: 'new.user@example.test',
      password: ' password with spaces ',
    })
  })

  it('enforces password, name, and email requirements', () => {
    const valid = {
      name: 'New User',
      email: 'new@example.test',
      password: 'A'.repeat(12),
    }

    expect(registerSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...valid, password: ' '.repeat(12) }).success).toBe(false)
    expect(registerSchema.safeParse({ ...valid, password: 'A'.repeat(129) }).success).toBe(false)
    expect(registerSchema.safeParse({ ...valid, name: ' ' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...valid, name: 'A'.repeat(121) }).success).toBe(false)
    expect(registerSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false)
  })

  it('rejects unknown fields', () => {
    expect(
      registerSchema.safeParse({
        name: 'New User',
        email: 'new@example.test',
        password: 'A'.repeat(12),
        role: 'admin',
      }).success,
    ).toBe(false)
  })
})

describe('email verification schemas', () => {
  it('normalizes request emails and validates one-time tokens', () => {
    expect(
      emailVerificationRequestSchema.parse({
        email: '  User@Example.Test ',
      }),
    ).toEqual({
      email: 'user@example.test',
    })
    expect(
      emailVerificationConfirmSchema.parse({
        token: ` ${'a'.repeat(43)} `,
      }),
    ).toEqual({
      token: 'a'.repeat(43),
    })
    expect(
      emailVerificationConfirmSchema.safeParse({
        token: 'short',
      }).success,
    ).toBe(false)
    expect(
      emailVerificationRequestSchema.safeParse({
        email: 'user@example.test',
        role: 'admin',
      }).success,
    ).toBe(false)
  })
})

describe('password reset schemas', () => {
  it('uses the registration password policy and rejects unknown fields', () => {
    const valid = {
      token: 'a'.repeat(43),
      password: 'A'.repeat(12),
    }

    expect(passwordResetRequestSchema.parse({ email: ' User@Example.Test ' })).toEqual({
      email: 'user@example.test',
    })
    expect(passwordResetConfirmSchema.parse(valid)).toEqual(valid)
    expect(passwordResetConfirmSchema.safeParse({ ...valid, password: 'short' }).success).toBe(
      false,
    )
    expect(
      passwordResetConfirmSchema.safeParse({ ...valid, password: ' '.repeat(12) }).success,
    ).toBe(false)
    expect(
      passwordResetConfirmSchema.safeParse({ ...valid, password: 'A'.repeat(129) }).success,
    ).toBe(false)
    expect(passwordResetConfirmSchema.safeParse({ ...valid, role: 'admin' }).success).toBe(false)
    expect(passwordResetConfirmSchema.safeParse({ ...valid, token: 'short' }).success).toBe(false)
  })
})
