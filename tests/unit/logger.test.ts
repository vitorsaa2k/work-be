import { describe, expect, it } from 'vitest'

import { sanitizeLogValue } from '../../src/lib/logger.js'

describe('sanitizeLogValue', () => {
  it('redacts database connection URLs', () => {
    const sanitized = sanitizeLogValue({
      message: 'failed postgresql://postgres:qwe12345@localhost:5432/work-be',
    })

    expect(JSON.stringify(sanitized)).not.toContain('qwe12345')
    expect(sanitized).toEqual({
      message: 'failed postgresql://[redacted]',
    })
  })

  it('redacts sensitive keys and credential pairs recursively', () => {
    const sanitized = sanitizeLogValue({
      password: 'plain-text',
      nested: {
        authorization: 'Bearer token',
        info: 'token=abc123&safe=yes',
      },
    })

    expect(sanitized).toEqual({
      password: '[redacted]',
      nested: {
        authorization: '[redacted]',
        info: 'token=[redacted]&safe=yes',
      },
    })
  })

  it('sanitizes error objects and handles circular references', () => {
    const circular: Record<string, unknown> = { name: 'circular' }
    circular.self = circular

    const sanitized = sanitizeLogValue({
      error: new Error('connection postgresql://user:secret@localhost/db'),
      circular,
    })

    expect(JSON.stringify(sanitized)).not.toContain('secret')
    expect(JSON.stringify(sanitized)).toContain('[circular]')
  })
})
