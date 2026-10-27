import { describe, expect, it } from 'vitest'

import { cancelAgreementSchema } from '../../src/modules/agreements/agreements.schemas.js'
import { applyToGigSchema } from '../../src/modules/applications/applications.schemas.js'
import {
  cancelGigSchema,
  gigWriteSchema,
  listGigsQuerySchema,
  ownerGigsQuerySchema,
  selectWorkerSchema,
} from '../../src/modules/gigs/gigs.schemas.js'

const VALID_GIG = {
  title: 'Ajuda para montar uma estante',
  description: 'Preciso de ajuda para montar uma estante de sala com ferramentas simples.',
  category: 'Montagem de moveis',
  price: {
    amount: 18_000,
    currency: 'BRL',
  },
  estimatedDurationMinutes: 120,
  scheduledAt: '2026-10-29T12:00:00.000Z',
  city: 'Sao Paulo',
  location: 'Vila Mariana',
  type: 'PERSONAL',
  address: {
    street: 'Rua Privada',
    number: '123',
    complement: 'Apto 42',
    accessInstructions: 'Usar o portao lateral.',
  },
  publish: true,
}

describe('marketplace schemas', () => {
  it('parses gig writes and normalizes dates', () => {
    const parsed = gigWriteSchema.parse(VALID_GIG)

    expect(parsed.scheduledAt).toEqual(new Date('2026-10-29T12:00:00.000Z'))
    expect(parsed.publish).toBe(true)
    expect(parsed.price.amount).toBe(18_000)
  })

  it('defaults publish to false and accepts an unscheduled draft', () => {
    const parsed = gigWriteSchema.parse({
      ...VALID_GIG,
      scheduledAt: null,
      publish: undefined,
    })

    expect(parsed.scheduledAt).toBeNull()
    expect(parsed.publish).toBe(false)
  })

  it('rejects invalid durations, prices, and unknown fields', () => {
    expect(gigWriteSchema.safeParse({ ...VALID_GIG, estimatedDurationMinutes: 29 }).success).toBe(
      false,
    )
    expect(
      gigWriteSchema.safeParse({
        ...VALID_GIG,
        price: { amount: 0, currency: 'BRL' },
      }).success,
    ).toBe(false)
    expect(gigWriteSchema.safeParse({ ...VALID_GIG, extra: true }).success).toBe(false)
    expect(
      gigWriteSchema.safeParse({
        ...VALID_GIG,
        price: { amount: 100, currency: 'brl' },
      }).success,
    ).toBe(false)
  })

  it('validates public and owner pagination filters', () => {
    expect(listGigsQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
    })
    expect(listGigsQuerySchema.parse({ page: '2', limit: '50' })).toEqual({
      page: 2,
      limit: 50,
    })
    expect(listGigsQuerySchema.safeParse({ limit: '51' }).success).toBe(false)
    expect(listGigsQuerySchema.safeParse({ status: 'DRAFT' }).success).toBe(false)
    expect(ownerGigsQuerySchema.safeParse({ status: 'EXPIRED' }).success).toBe(true)
    expect(ownerGigsQuerySchema.safeParse({ status: 'OPEN', extra: true }).success).toBe(false)
  })

  it('validates application, selection, and cancellation payloads', () => {
    expect(applyToGigSchema.parse({})).toEqual({})
    expect(applyToGigSchema.parse({ message: '  I can help.  ' })).toEqual({
      message: 'I can help.',
    })
    expect(applyToGigSchema.safeParse({ message: 'x'.repeat(2001) }).success).toBe(false)
    expect(selectWorkerSchema.safeParse({ applicationId: 'not-a-uuid' }).success).toBe(false)
    expect(cancelGigSchema.parse({})).toEqual({})
    expect(cancelGigSchema.safeParse({ reason: '' }).success).toBe(false)
    expect(cancelAgreementSchema.parse({ reason: 'Plans changed' })).toEqual({
      reason: 'Plans changed',
    })
    expect(cancelAgreementSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false)
  })
})
