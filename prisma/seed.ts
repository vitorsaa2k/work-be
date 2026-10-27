import 'dotenv/config'

import { parseEnv } from '../src/config/env.js'
import { createPrismaClient } from '../src/db/prisma.js'
import { createLogger } from '../src/lib/logger.js'
import { hashPassword } from '../src/lib/passwords.js'

const DEVELOPMENT_PASSWORD = 'WorkDev123!'
const SEED_EMAIL_VERIFIED_AT = new Date('2026-01-01T00:00:00.000Z')

const users = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    name: 'Ana Ribeiro',
    email: 'ana.ribeiro@example.test',
    profile: {
      id: 'f0000000-0000-4000-8000-000000000001',
      bio: 'Organizo minha rotina entre trabalho e reformas em casa.',
      city: 'São Paulo',
      location: 'Vila Mariana',
    },
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    name: 'Bruno Costa',
    email: 'bruno.costa@example.test',
    profile: {
      id: 'f0000000-0000-4000-8000-000000000002',
      bio: 'Pequenos negócios locais, sempre precisando de uma mão.',
      city: 'Curitiba',
      location: 'Batel',
    },
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    name: 'Carla Mendes',
    email: 'carla.mendes@example.test',
    profile: {
      id: 'f0000000-0000-4000-8000-000000000003',
      bio: 'Trabalho com organização, limpeza e apoio em mudanças.',
      city: 'São Paulo',
      location: 'Pinheiros',
    },
  },
  {
    id: 'a0000000-0000-4000-8000-000000000004',
    name: 'Diego Alves',
    email: 'diego.alves@example.test',
    profile: {
      id: 'f0000000-0000-4000-8000-000000000004',
      bio: 'Assistência técnica e montagem de móveis.',
      city: 'Rio de Janeiro',
      location: 'Tijuca',
    },
  },
] as const

const gigs = [
  {
    id: 'b0000000-0000-4000-8000-000000000001',
    employerId: users[0].id,
    title: 'Montagem de estante e dois armários',
    description:
      'Preciso montar uma estante de sala e dois armários de quarto. As caixas já estão no apartamento e as ferramentas básicas estão disponíveis.',
    category: 'Montagem de móveis',
    priceAmount: 18_000,
    estimatedDurationMinutes: 180,
    scheduledAt: new Date('2026-11-05T14:00:00-03:00'),
    city: 'São Paulo',
    location: 'Vila Mariana',
    type: 'PERSONAL',
    status: 'OPEN',
    address: {
      id: 'e0000000-0000-4000-8000-000000000001',
      street: 'Rua Sabará',
      number: '123',
      complement: 'Apto 42',
      accessInstructions: 'Falar com a portaria e usar o elevador de serviço.',
    },
  },
  {
    id: 'b0000000-0000-4000-8000-000000000002',
    employerId: users[1].id,
    title: 'Limpeza pós-obra em apartamento',
    description:
      'Apartamento de 70 m² precisa de limpeza pesada após pintura. Fornecemos todos os produtos e equipamentos.',
    category: 'Limpeza',
    priceAmount: 25_000,
    estimatedDurationMinutes: 240,
    scheduledAt: new Date('2026-11-07T08:30:00-03:00'),
    city: 'Curitiba',
    location: 'Batel',
    type: 'BUSINESS',
    status: 'OPEN',
    address: {
      id: 'e0000000-0000-4000-8000-000000000002',
      street: 'Avenida do Batel',
      number: '890',
      complement: 'Apto 71',
      accessInstructions: 'Retirar a chave na administração do edifício.',
    },
  },
  {
    id: 'b0000000-0000-4000-8000-000000000003',
    employerId: users[0].id,
    title: 'Instalação de duas luminárias',
    description:
      'Instalação de duas luminárias de teto já compradas. O imóvel tem escada disponível.',
    category: 'Elétrica',
    priceAmount: 9_000,
    estimatedDurationMinutes: 90,
    scheduledAt: new Date('2026-11-03T18:00:00-03:00'),
    city: 'São Paulo',
    location: 'Pinheiros',
    type: 'PERSONAL',
    status: 'OPEN',
    address: {
      id: 'e0000000-0000-4000-8000-000000000003',
      street: 'Rua dos Pinheiros',
      number: '455',
      complement: 'Casa 2',
      accessInstructions: 'O portão azul fica ao lado da padaria.',
    },
  },
  {
    id: 'b0000000-0000-4000-8000-000000000004',
    employerId: users[2].id,
    title: 'Ajuda com mudança pequena',
    description:
      'Mudança de um apartamento de um quarto para outro no mesmo bairro. São poucos móveis e cerca de 15 caixas.',
    category: 'Mudança',
    priceAmount: 20_000,
    estimatedDurationMinutes: 240,
    scheduledAt: new Date('2026-11-09T09:00:00-02:00'),
    city: 'Rio de Janeiro',
    location: 'Botafogo',
    type: 'PERSONAL',
    status: 'OPEN',
    address: {
      id: 'e0000000-0000-4000-8000-000000000004',
      street: 'Rua Voluntários da Pátria',
      number: '210',
      complement: 'Apto 304',
      accessInstructions: 'O prédio não tem elevador de serviço.',
    },
  },
  {
    id: 'b0000000-0000-4000-8000-000000000005',
    employerId: users[1].id,
    title: 'Pintura de sala ainda em rascunho',
    description: 'Rascunho de um serviço de pintura que ainda será publicado.',
    category: 'Pintura',
    priceAmount: 30_000,
    estimatedDurationMinutes: 480,
    scheduledAt: null,
    city: 'Curitiba',
    location: 'Água Verde',
    type: 'PERSONAL',
    status: 'DRAFT',
    address: {
      id: 'e0000000-0000-4000-8000-000000000005',
      street: 'Rua Guilherme Pugsley',
      number: '77',
      complement: null,
      accessInstructions: null,
    },
  },
  {
    id: 'b0000000-0000-4000-8000-000000000006',
    employerId: users[0].id,
    title: 'Entrega de móveis para escritório',
    description: 'Entrega e posicionamento de três mesas e seis cadeiras em um escritório pequeno.',
    category: 'Entregas',
    priceAmount: 12_000,
    estimatedDurationMinutes: 120,
    scheduledAt: new Date('2026-11-11T13:00:00-02:00'),
    city: 'São Paulo',
    location: 'Moema',
    type: 'BUSINESS',
    status: 'ASSIGNED',
    address: {
      id: 'e0000000-0000-4000-8000-000000000006',
      street: 'Alameda dos Maracatins',
      number: '620',
      complement: 'Conjunto 12',
      accessInstructions: 'Entregar na recepção e pedir pelo responsável.',
    },
  },
  {
    id: 'b0000000-0000-4000-8000-000000000007',
    employerId: users[2].id,
    title: 'Jardinagem de quintal',
    description: 'Poda de arbustos e limpeza geral de um quintal pequeno.',
    category: 'Jardinagem',
    priceAmount: 15_000,
    estimatedDurationMinutes: 180,
    scheduledAt: new Date('2026-10-18T08:00:00-03:00'),
    city: 'Rio de Janeiro',
    location: 'Tijuca',
    type: 'PERSONAL',
    status: 'COMPLETED',
    address: {
      id: 'e0000000-0000-4000-8000-000000000007',
      street: 'Rua Conde de Bonfim',
      number: '350',
      complement: null,
      accessInstructions: 'Entrar pela garagem lateral.',
    },
  },
  {
    id: 'b0000000-0000-4000-8000-000000000008',
    employerId: users[3].id,
    title: 'Suporte técnico para computador',
    description:
      'Computador de trabalho está lento e precisa de diagnóstico e limpeza. Pode ser feito no local.',
    category: 'Assistência técnica',
    priceAmount: 12_000,
    estimatedDurationMinutes: 90,
    scheduledAt: new Date('2026-11-06T10:00:00-03:00'),
    city: 'São Paulo',
    location: 'Centro',
    type: 'BUSINESS',
    status: 'OPEN',
    address: {
      id: 'e0000000-0000-4000-8000-000000000008',
      street: 'Rua Sete de Abril',
      number: '40',
      complement: 'Sala 804',
      accessInstructions: 'Identificar-se na recepção do oitavo andar.',
    },
  },
] as const

async function main(): Promise<void> {
  const env = parseEnv()
  if (env.NODE_ENV === 'production') {
    throw new Error('The development seed must not run in production.')
  }

  const logger = createLogger(env.LOG_LEVEL)
  const prisma = createPrismaClient(env.DATABASE_URL)

  try {
    for (const user of users) {
      const passwordHash = await hashPassword(DEVELOPMENT_PASSWORD)

      await prisma.user.upsert({
        where: { id: user.id },
        update: {
          name: user.name,
          email: user.email,
          passwordHash,
          status: 'ACTIVE',
          emailVerifiedAt: SEED_EMAIL_VERIFIED_AT,
        },
        create: {
          id: user.id,
          name: user.name,
          email: user.email,
          passwordHash,
          status: 'ACTIVE',
          emailVerifiedAt: SEED_EMAIL_VERIFIED_AT,
        },
      })

      await prisma.profile.upsert({
        where: { userId: user.id },
        update: {
          bio: user.profile.bio,
          city: user.profile.city,
          location: user.profile.location,
        },
        create: {
          id: user.profile.id,
          userId: user.id,
          bio: user.profile.bio,
          city: user.profile.city,
          location: user.profile.location,
        },
      })
    }

    for (const gig of gigs) {
      const { address, ...gigData } = gig

      await prisma.gig.upsert({
        where: { id: gig.id },
        update: {
          employerId: gigData.employerId,
          title: gigData.title,
          description: gigData.description,
          category: gigData.category,
          priceAmount: gigData.priceAmount,
          currency: 'BRL',
          estimatedDurationMinutes: gigData.estimatedDurationMinutes,
          scheduledAt: gigData.scheduledAt,
          city: gigData.city,
          location: gigData.location,
          type: gigData.type,
          status: gigData.status,
        },
        create: {
          id: gigData.id,
          employerId: gigData.employerId,
          title: gigData.title,
          description: gigData.description,
          category: gigData.category,
          priceAmount: gigData.priceAmount,
          currency: 'BRL',
          estimatedDurationMinutes: gigData.estimatedDurationMinutes,
          scheduledAt: gigData.scheduledAt,
          city: gigData.city,
          location: gigData.location,
          type: gigData.type,
          status: gigData.status,
        },
      })

      await prisma.gigAddress.upsert({
        where: { gigId: gig.id },
        update: {
          street: address.street,
          number: address.number,
          complement: address.complement,
          accessInstructions: address.accessInstructions,
        },
        create: {
          id: address.id,
          gigId: gig.id,
          street: address.street,
          number: address.number,
          complement: address.complement,
          accessInstructions: address.accessInstructions,
        },
      })
    }

    await prisma.application.upsert({
      where: {
        gigId_applicantId: {
          gigId: gigs[0].id,
          applicantId: users[3].id,
        },
      },
      update: { status: 'PENDING', message: 'Consigo montar os móveis no sábado.' },
      create: {
        id: 'c0000000-0000-4000-8000-000000000001',
        gigId: gigs[0].id,
        applicantId: users[3].id,
        message: 'Consigo montar os móveis no sábado.',
        status: 'PENDING',
      },
    })

    await prisma.application.upsert({
      where: {
        gigId_applicantId: {
          gigId: gigs[1].id,
          applicantId: users[2].id,
        },
      },
      update: { status: 'PENDING', message: 'Tenho experiência com limpeza pós-obra.' },
      create: {
        id: 'c0000000-0000-4000-8000-000000000002',
        gigId: gigs[1].id,
        applicantId: users[2].id,
        message: 'Tenho experiência com limpeza pós-obra.',
        status: 'PENDING',
      },
    })

    await prisma.application.upsert({
      where: {
        gigId_applicantId: {
          gigId: gigs[5].id,
          applicantId: users[2].id,
        },
      },
      update: { status: 'ACCEPTED', message: 'Posso fazer a entrega no horário combinado.' },
      create: {
        id: 'c0000000-0000-4000-8000-000000000003',
        gigId: gigs[5].id,
        applicantId: users[2].id,
        message: 'Posso fazer a entrega no horário combinado.',
        status: 'ACCEPTED',
      },
    })

    await prisma.agreement.upsert({
      where: { gigId: gigs[5].id },
      update: {
        employerId: users[0].id,
        workerId: users[2].id,
        agreedPriceAmount: 12_000,
        currency: 'BRL',
        status: 'ASSIGNED',
      },
      create: {
        id: 'd0000000-0000-4000-8000-000000000001',
        gigId: gigs[5].id,
        employerId: users[0].id,
        workerId: users[2].id,
        agreedPriceAmount: 12_000,
        currency: 'BRL',
        status: 'ASSIGNED',
      },
    })

    await prisma.agreement.upsert({
      where: { gigId: gigs[6].id },
      update: {
        employerId: users[2].id,
        workerId: users[3].id,
        agreedPriceAmount: 15_000,
        currency: 'BRL',
        status: 'COMPLETED',
        employerStartedAt: new Date('2026-10-18T08:00:00-03:00'),
        workerStartedAt: new Date('2026-10-18T08:05:00-03:00'),
        startedAt: new Date('2026-10-18T08:05:00-03:00'),
        employerCompletedAt: new Date('2026-10-18T15:00:00-03:00'),
        workerCompletedAt: new Date('2026-10-18T15:05:00-03:00'),
        completedAt: new Date('2026-10-18T15:10:00-03:00'),
      },
      create: {
        id: 'd0000000-0000-4000-8000-000000000002',
        gigId: gigs[6].id,
        employerId: users[2].id,
        workerId: users[3].id,
        agreedPriceAmount: 15_000,
        currency: 'BRL',
        status: 'COMPLETED',
        employerStartedAt: new Date('2026-10-18T08:00:00-03:00'),
        workerStartedAt: new Date('2026-10-18T08:05:00-03:00'),
        startedAt: new Date('2026-10-18T08:05:00-03:00'),
        employerCompletedAt: new Date('2026-10-18T15:00:00-03:00'),
        workerCompletedAt: new Date('2026-10-18T15:05:00-03:00'),
        completedAt: new Date('2026-10-18T15:10:00-03:00'),
      },
    })

    logger.info('Development seed completed', {
      users: users.length,
      gigs: gigs.length,
      openGigs: gigs.filter((gig) => gig.status === 'OPEN').length,
    })
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  const logger = createLogger('error')
  logger.error('Development seed failed', { error })
  process.exitCode = 1
})
