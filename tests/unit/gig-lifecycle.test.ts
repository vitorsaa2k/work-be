import { describe, expect, it } from 'vitest'

import {
  activeOpenGigWhere,
  GIG_EXPIRY_GRACE_MS,
  getGigExpiryCutoff,
  isFutureSchedule,
  isGigExpired,
} from '../../src/modules/gigs/gig-lifecycle.js'

const NOW = new Date('2026-10-27T12:00:00.000Z')

describe('gig lifecycle', () => {
  it('uses a 24-hour expiry grace period', () => {
    expect(GIG_EXPIRY_GRACE_MS).toBe(24 * 60 * 60 * 1000)
    expect(getGigExpiryCutoff(NOW)).toEqual(new Date('2026-10-26T12:00:00.000Z'))
  })

  it('treats null schedules as legacy non-expiring gigs', () => {
    expect(isGigExpired(null, NOW)).toBe(false)
    expect(isFutureSchedule(null, NOW)).toBe(false)
  })

  it('expires exactly at the grace boundary', () => {
    expect(isGigExpired(new Date('2026-10-26T12:00:00.000Z'), NOW)).toBe(true)
    expect(isGigExpired(new Date('2026-10-26T12:00:00.001Z'), NOW)).toBe(false)
    expect(isGigExpired(new Date('2026-10-27T11:59:59.999Z'), NOW)).toBe(false)
  })

  it('requires a schedule strictly in the future', () => {
    expect(isFutureSchedule(NOW, NOW)).toBe(false)
    expect(isFutureSchedule(new Date(NOW.getTime() - 1), NOW)).toBe(false)
    expect(isFutureSchedule(new Date(NOW.getTime() + 1), NOW)).toBe(true)
  })

  it('builds the public OPEN filter with the expiry cutoff', () => {
    expect(activeOpenGigWhere(NOW)).toEqual({
      status: 'OPEN',
      OR: [{ scheduledAt: null }, { scheduledAt: { gt: new Date('2026-10-26T12:00:00.000Z') } }],
    })
  })
})
