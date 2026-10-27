import { describe, expect, it } from 'vitest'

import {
  toPublicGigDetailDto,
  toPublicGigSummaryDto,
  type PublicGigDetailDto,
} from '../../src/modules/gigs/gigs.service.js'

const createdAt = new Date('2026-10-01T10:00:00.000Z')
const updatedAt = new Date('2026-10-02T11:00:00.000Z')
const scheduledAt = new Date('2026-11-01T14:00:00.000Z')

const baseRow = {
  id: 'b0000000-0000-4000-8000-000000000001',
  title: 'Montagem de móveis',
  category: 'Montagem de móveis',
  priceAmount: 18_000,
  currency: 'BRL',
  estimatedDurationMinutes: 180,
  scheduledAt,
  city: 'São Paulo',
  location: 'Vila Mariana',
  type: 'PERSONAL',
  status: 'OPEN',
  createdAt,
  employer: {
    id: 'a0000000-0000-4000-8000-000000000001',
    name: 'Ana Ribeiro',
  },
  description: 'Descrição pública do serviço.',
  updatedAt,
  address: {
    street: 'Rua Secreta',
    number: '123',
    complement: 'Apto 42',
    accessInstructions: 'Código do portão 9876',
  },
  employerEmail: 'ana.ribeiro@example.test',
  passwordHash: 'hash-that-must-not-leak',
} as const

describe('public gig DTO mappers', () => {
  it('maps only the public summary fields', () => {
    const dto = toPublicGigSummaryDto(baseRow as never)

    expect(dto).toEqual({
      id: baseRow.id,
      title: 'Montagem de móveis',
      category: 'Montagem de móveis',
      price: {
        amount: 18_000,
        currency: 'BRL',
      },
      estimatedDurationMinutes: 180,
      scheduledAt: scheduledAt.toISOString(),
      city: 'São Paulo',
      location: 'Vila Mariana',
      type: 'PERSONAL',
      status: 'OPEN',
      createdAt: createdAt.toISOString(),
      employer: {
        id: baseRow.employer.id,
        name: 'Ana Ribeiro',
      },
    })

    const serialized = JSON.stringify(dto)
    expect(serialized).not.toContain('Rua Secreta')
    expect(serialized).not.toContain('Código do portão')
    expect(serialized).not.toContain('ana.ribeiro@example.test')
    expect(serialized).not.toContain('hash-that-must-not-leak')
  })

  it('maps detail fields without spreading private data', () => {
    const dto: PublicGigDetailDto = toPublicGigDetailDto(baseRow as never)

    expect(dto.description).toBe('Descrição pública do serviço.')
    expect(dto.updatedAt).toBe(updatedAt.toISOString())
    expect(dto.price.amount).toBe(18_000)

    const serialized = JSON.stringify(dto)
    expect(serialized).not.toContain('Rua Secreta')
    expect(serialized).not.toContain('passwordHash')
    expect(serialized).not.toContain('employerEmail')
  })
})
