import 'dotenv/config'

import { serve } from '@hono/node-server'

import { createApp } from './app.js'
import { EnvValidationError, parseEnv, type Env } from './config/env.js'
import { createPrismaClient } from './db/prisma.js'
import { createLogger } from './lib/logger.js'
import { createApplicationsService } from './modules/applications/applications.service.js'
import { createAgreementsService } from './modules/agreements/agreements.service.js'
import { createAuthConfig } from './modules/auth/auth.config.js'
import { createAuthMailer } from './modules/auth/auth-mailer.js'
import { createAuthService } from './modules/auth/auth.service.js'
import { createGigsService } from './modules/gigs/gigs.service.js'
import { createHealthService } from './modules/health/health.service.js'
import { startMaintenanceScheduler } from './modules/maintenance/maintenance.scheduler.js'
import { createMaintenanceService } from './modules/maintenance/maintenance.service.js'

function loadEnvironment(): Env {
  try {
    return parseEnv()
  } catch (error) {
    const bootstrapLogger = createLogger('error')
    if (error instanceof EnvValidationError) {
      bootstrapLogger.error('Invalid environment configuration', { issues: error.issues })
    } else {
      bootstrapLogger.error('Failed to load environment configuration', { error })
    }
    process.exit(1)
  }
}

async function main(): Promise<void> {
  const env = loadEnvironment()
  const logger = createLogger(env.LOG_LEVEL)
  const prisma = createPrismaClient(env.DATABASE_URL)

  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (error) {
    logger.error('Database connectivity check failed', { error })
    await prisma.$disconnect().catch((disconnectError: unknown) => {
      logger.error('Failed to disconnect Prisma during startup failure', {
        error: disconnectError,
      })
    })
    process.exit(1)
  }

  const healthService = createHealthService(async () => prisma.$queryRaw`SELECT 1`)
  const gigsService = createGigsService(prisma)
  const applicationsService = createApplicationsService(prisma)
  const agreementsService = createAgreementsService(prisma)
  const maintenanceService = createMaintenanceService(prisma)
  const authConfig = createAuthConfig(env.NODE_ENV, env.TRUST_PROXY)
  const authMailer = createAuthMailer(
    {
      delivery: env.MAIL_DELIVERY,
      from: env.MAIL_FROM,
      outboxDir: env.MAIL_OUTBOX_DIR,
      frontendOrigin: env.FRONTEND_ORIGIN,
      smtpUrl: env.SMTP_URL,
    },
    logger,
  )

  if (env.NODE_ENV === 'production' && env.MAIL_DELIVERY === 'file') {
    logger.warn('Authentication emails are written to the local file outbox in production')
  }

  const authService = createAuthService(prisma, authConfig, authMailer)

  const app = createApp({
    config: {
      frontendOrigin: env.FRONTEND_ORIGIN,
      auth: authConfig,
    },
    logger,
    healthService,
    gigsService,
    applicationsService,
    agreementsService,
    authService,
  })

  const server = serve(
    {
      fetch: app.fetch,
      port: env.PORT,
      hostname: env.HOST,
    },
    (info) => {
      logger.info('Server started', {
        host: env.HOST,
        port: info.port,
        nodeEnv: env.NODE_ENV,
      })
    },
  )

  server.on('error', (error) => {
    logger.error('HTTP server error', { error })
  })

  const stopMaintenance = startMaintenanceScheduler(maintenanceService, logger)

  let shuttingDown = false

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    stopMaintenance()
    logger.info('Server shutting down', { signal })

    const forceExitTimer = setTimeout(() => {
      logger.error('Forced shutdown after timeout')
      if ('closeAllConnections' in server) {
        server.closeAllConnections()
      }
      process.exit(1)
    }, 10_000)
    forceExitTimer.unref()

    server.close((closeError) => {
      void (async () => {
        if (closeError) {
          logger.error('HTTP server failed to close cleanly', { error: closeError })
        }

        try {
          await prisma.$disconnect()
        } catch (error) {
          logger.error('Failed to disconnect Prisma during shutdown', { error })
        }

        clearTimeout(forceExitTimer)
        logger.info('Server stopped')
        process.exit(closeError ? 1 : 0)
      })()
    })
  }

  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
}

void main().catch((error: unknown) => {
  const logger = createLogger('error')
  logger.error('Unhandled startup error', { error })
  process.exit(1)
})
