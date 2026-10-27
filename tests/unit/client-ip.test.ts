import { describe, expect, it } from 'vitest'

import { resolveClientIp } from '../../src/modules/auth/client-ip.js'

describe('resolveClientIp', () => {
  it('uses the forwarded address only when the proxy is trusted', () => {
    expect(
      resolveClientIp({
        forwardedFor: '203.0.113.9, 10.0.0.1',
        remoteAddress: '198.51.100.7',
        trustProxy: true,
      }),
    ).toBe('203.0.113.9')

    expect(
      resolveClientIp({
        forwardedFor: '203.0.113.9, 10.0.0.1',
        remoteAddress: '198.51.100.7',
        trustProxy: false,
      }),
    ).toBe('198.51.100.7')
  })

  it('falls back to the socket address for missing or invalid forwarded addresses', () => {
    expect(
      resolveClientIp({
        forwardedFor: 'not-an-ip',
        remoteAddress: '198.51.100.7',
        trustProxy: true,
      }),
    ).toBe('198.51.100.7')

    expect(
      resolveClientIp({
        forwardedFor: 'not-an-ip',
        remoteAddress: undefined,
        trustProxy: true,
      }),
    ).toBe('unknown')
  })

  it('normalizes IPv4-mapped and uppercase IPv6 addresses', () => {
    expect(
      resolveClientIp({
        remoteAddress: '::ffff:198.51.100.7',
        trustProxy: false,
      }),
    ).toBe('198.51.100.7')

    expect(
      resolveClientIp({
        remoteAddress: '2001:DB8::1',
        trustProxy: false,
      }),
    ).toBe('2001:db8::1')
  })

  it('returns a stable fallback when no address is available', () => {
    expect(resolveClientIp({ trustProxy: false })).toBe('unknown')
  })
})
