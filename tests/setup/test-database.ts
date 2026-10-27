import 'dotenv/config'

function readDatabaseName(connectionString: string): string {
  const url = new URL(connectionString)
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''))

  if (!databaseName) {
    throw new Error('TEST_DATABASE_URL must include a database name.')
  }

  if (!/(?:^|[-_])test$/i.test(databaseName)) {
    throw new Error(
      `Refusing to use database "${databaseName}" for tests. The database name must end with "_test" or "-test".`,
    )
  }

  return databaseName
}

export function resolveTestDatabaseUrl(): string | null {
  const connectionString = process.env.TEST_DATABASE_URL?.trim()

  if (!connectionString) {
    return null
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Database integration tests must not run in production.')
  }

  readDatabaseName(connectionString)
  return connectionString
}

export const testDatabaseUrl = resolveTestDatabaseUrl()
export const hasTestDatabase = testDatabaseUrl !== null
