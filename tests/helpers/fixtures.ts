import type { DatabaseClient } from '../../src/db/prisma.js'

export interface CreateUserOptions {
  name?: string
  email?: string
  passwordHash?: string | null
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  emailVerifiedAt?: Date | null
}

const DEFAULT_EMAIL_VERIFIED_AT = new Date('2026-01-01T00:00:00.000Z')

export async function createUser(
  prisma: DatabaseClient,
  options: CreateUserOptions = {},
): Promise<{ id: string; name: string; email: string }> {
  return prisma.user.create({
    data: {
      name: options.name ?? 'Test User',
      email: options.email ?? `test-${crypto.randomUUID()}@example.test`,
      passwordHash: options.passwordHash ?? null,
      status: options.status ?? 'ACTIVE',
      emailVerifiedAt:
        options.emailVerifiedAt === undefined ? DEFAULT_EMAIL_VERIFIED_AT : options.emailVerifiedAt,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  })
}

export interface CreateGigOptions {
  employerId: string
  title?: string
  description?: string
  category?: string
  priceAmount?: number
  currency?: string
  estimatedDurationMinutes?: number
  scheduledAt?: Date | null
  city?: string
  location?: string
  type?: 'PERSONAL' | 'BUSINESS'
  status?: 'DRAFT' | 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED' | 'EXPIRED'
  createdAt?: Date
  address?: {
    street?: string
    number?: string
    complement?: string | null
    accessInstructions?: string | null
  }
}

export async function createGig(
  prisma: DatabaseClient,
  options: CreateGigOptions,
): Promise<{ id: string; title: string }> {
  return prisma.gig.create({
    data: {
      employerId: options.employerId,
      title: options.title ?? 'Test gig',
      description: options.description ?? 'A public test gig description.',
      category: options.category ?? 'Limpeza',
      priceAmount: options.priceAmount ?? 15_000,
      currency: options.currency ?? 'BRL',
      estimatedDurationMinutes: options.estimatedDurationMinutes ?? 120,
      scheduledAt: options.scheduledAt ?? null,
      city: options.city ?? 'São Paulo',
      location: options.location ?? 'Centro',
      type: options.type ?? 'PERSONAL',
      status: options.status ?? 'OPEN',
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      ...(options.address
        ? {
            address: {
              create: {
                street: options.address.street ?? 'Rua Privada',
                number: options.address.number ?? '123',
                complement: options.address.complement ?? 'Apto 42',
                accessInstructions:
                  options.address.accessInstructions ?? 'Código secreto do portão: 9876',
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      title: true,
    },
  })
}
