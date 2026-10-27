import type { Logger } from '../../lib/logger.js'
import type { MaintenanceService } from './maintenance.service.js'

export const DEFAULT_MAINTENANCE_INTERVAL_MS = 60_000

export function startMaintenanceScheduler(
  maintenanceService: MaintenanceService,
  logger: Logger,
  intervalMs = DEFAULT_MAINTENANCE_INTERVAL_MS,
): () => void {
  let running = false

  const tick = (): void => {
    if (running) {
      return
    }

    running = true

    void maintenanceService
      .run()
      .then((result) => {
        if (
          result.expiredGigs > 0 ||
          result.rejectedApplications > 0 ||
          result.deletedSessions > 0 ||
          result.deletedAuthTokens > 0
        ) {
          logger.info('Marketplace maintenance completed', { ...result })
        }
      })
      .catch((error: unknown) => {
        logger.error('Marketplace maintenance failed', { error })
      })
      .finally(() => {
        running = false
      })
  }

  tick()
  const timer = setInterval(tick, intervalMs)
  timer.unref()

  return () => {
    clearInterval(timer)
  }
}
