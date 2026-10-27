import { describe, expect, it } from 'vitest'

import { EnvValidationError, parseEnv } from '../../src/config/env.js'

const databaseUrl = 'postgresql://user:password@localhost:5432/work-be'

describe('parseEnv', () => {
  it('applies development defaults', () => {
    const env = parseEnv({ DATABASE_URL: databaseUrl })

    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      HOST: '127.0.0.1',
      DATABASE_URL: databaseUrl,
      FRONTEND_ORIGIN: 'http://localhost:5173',
      LOG_LEVEL: 'info',
      TRUST_PROXY: false,
      MAIL_DELIVERY: 'file',
      MAIL_FROM: 'Work <no-reply@work.local>',
      MAIL_OUTBOX_DIR: '.mail-outbox',
    })
  })

  it('requires SMTP configuration when SMTP delivery is selected', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: databaseUrl,
        MAIL_DELIVERY: 'smtp',
      }),
    ).toThrowError(EnvValidationError)

    const env = parseEnv({
      DATABASE_URL: databaseUrl,
      MAIL_DELIVERY: 'smtp',
      MAIL_FROM: 'Work <no-reply@example.test>',
      SMTP_URL: 'smtps://user:password@smtp.example.test:465',
    })

    expect(env.MAIL_DELIVERY).toBe('smtp')
    expect(env.SMTP_URL).toBe('smtps://user:password@smtp.example.test:465')

    expect(() =>
      parseEnv({
        DATABASE_URL: databaseUrl,
        MAIL_DELIVERY: 'smtp',
        SMTP_URL: 'https://smtp.example.test',
      }),
    ).toThrowError(EnvValidationError)
  })

  it('enables proxy trust only with an explicit boolean string', () => {
    const env = parseEnv({
      DATABASE_URL: databaseUrl,
      TRUST_PROXY: 'true',
    })

    expect(env.TRUST_PROXY).toBe(true)
    expect(() =>
      parseEnv({
        DATABASE_URL: databaseUrl,
        TRUST_PROXY: '1',
      }),
    ).toThrowError(EnvValidationError)
  })

  it('coerces a valid port and normalizes the frontend origin', () => {
    const env = parseEnv({
      NODE_ENV: 'development',
      PORT: '4000',
      DATABASE_URL: databaseUrl,
      FRONTEND_ORIGIN: 'http://localhost:3001/',
    })

    expect(env.PORT).toBe(4000)
    expect(env.FRONTEND_ORIGIN).toBe('http://localhost:3001')
  })

  it('requires an explicit frontend origin in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL: databaseUrl,
      }),
    ).toThrowError(EnvValidationError)
  })

  it('rejects wildcard and path-bearing frontend origins', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: databaseUrl,
        FRONTEND_ORIGIN: '*',
      }),
    ).toThrowError(EnvValidationError)

    expect(() =>
      parseEnv({
        DATABASE_URL: databaseUrl,
        FRONTEND_ORIGIN: 'http://localhost:5173/app',
      }),
    ).toThrowError(EnvValidationError)
  })

  it('rejects invalid ports and non-PostgreSQL database URLs', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: databaseUrl,
        PORT: '70000',
      }),
    ).toThrowError(EnvValidationError)

    expect(() =>
      parseEnv({
        DATABASE_URL: 'https://example.com',
      }),
    ).toThrowError(EnvValidationError)
  })

  it('never includes environment values in configuration errors', () => {
    try {
      parseEnv({
        DATABASE_URL: 'postgresql://user:super-secret@localhost:5432/work-be',
        PORT: 'not-a-number',
      })
      throw new Error('Expected parseEnv to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError)
      const serialized = JSON.stringify(error)
      expect(serialized).not.toContain('super-secret')
      expect(serialized).not.toContain('not-a-number')
      expect(serialized).toContain('PORT')
    }
  })
})
