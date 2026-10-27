import { describe, expect, it } from 'vitest'

import {
  gigIdSchema,
  listGigsQuerySchema,
  MAX_GIG_PAGE_SIZE,
} from '../../src/modules/gigs/gigs.schemas.js'

describe('gig request schemas', () => {
  it('applies pagination defaults', () => {
    expect(listGigsQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
    })
  })

  it('coerces and trims valid filters', () => {
    expect(
      listGigsQuerySchema.parse({
        page: '2',
        limit: '10',
        status: 'OPEN',
        city: '  São Paulo  ',
        category: '  Limpeza  ',
      }),
    ).toEqual({
      page: 2,
      limit: 10,
      status: 'OPEN',
      city: 'São Paulo',
      category: 'Limpeza',
    })
  })

  it('rejects invalid pagination and unsupported public statuses', () => {
    expect(() => listGigsQuerySchema.parse({ page: '0' })).toThrow()
    expect(() => listGigsQuerySchema.parse({ limit: `${MAX_GIG_PAGE_SIZE + 1}` })).toThrow()
    expect(() => listGigsQuerySchema.parse({ status: 'DRAFT' })).toThrow()
  })

  it('rejects unknown query parameters', () => {
    expect(() => listGigsQuerySchema.parse({ employerId: 'unexpected' })).toThrow()
  })

  it('validates gig route UUIDs', () => {
    expect(gigIdSchema.parse('b0000000-0000-4000-8000-000000000001')).toBe(
      'b0000000-0000-4000-8000-000000000001',
    )
    expect(() => gigIdSchema.parse('not-a-uuid')).toThrow()
  })
})
