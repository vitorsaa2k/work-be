import { ServiceUnavailableError } from '../../lib/errors.js'

export interface HealthService {
  checkReadiness(): Promise<void>
}

export function createHealthService(pingDatabase: () => Promise<unknown>): HealthService {
  return {
    async checkReadiness() {
      try {
        await pingDatabase()
      } catch (error) {
        throw new ServiceUnavailableError('A required service dependency is unavailable.', {
          cause: error,
        })
      }
    },
  }
}
