import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { sanitizeLogValue } from '../../src/lib/logger.js'
import { testDatabaseUrl } from './test-database.js'

function runTestMigrations(connectionString: string): void {
  const require = createRequire(import.meta.url)
  const prismaPackagePath = require.resolve('prisma/package.json')
  const prismaCliPath = join(dirname(prismaPackagePath), 'build', 'index.js')

  try {
    execFileSync(process.execPath, [prismaCliPath, 'migrate', 'deploy'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: connectionString,
      },
      encoding: 'utf8',
      stdio: 'pipe',
    })
  } catch (error) {
    const stdout =
      typeof error === 'object' && error !== null && 'stdout' in error ? String(error.stdout) : ''
    const stderr =
      typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr) : ''
    const safeOutput = String(sanitizeLogValue(`${stdout}\n${stderr}`))

    throw new Error(`Failed to apply migrations to the test database.\n${safeOutput}`, {
      cause: error,
    })
  }
}

export default function globalSetup(): void {
  if (!testDatabaseUrl) {
    process.stderr.write(
      'TEST_DATABASE_URL is not set. Database integration tests will be skipped.\n',
    )
    return
  }

  runTestMigrations(testDatabaseUrl)
}
