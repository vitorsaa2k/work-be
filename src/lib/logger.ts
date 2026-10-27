import type { LogLevel } from '../config/env.js'

export type { LogLevel }

export type LogFields = Record<string, unknown>

export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
}

const priorities: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const sensitiveKeyPattern = /password|secret|token|authorization|cookie/i
const connectionUrlPattern = /postgres(?:ql)?:\/\/[^\s"'\\]+/gi
const credentialPairPattern = /\b(password|secret|token)=([^&\s]+)/gi

function redactString(value: string): string {
  return value
    .replace(connectionUrlPattern, 'postgresql://[redacted]')
    .replace(credentialPairPattern, '$1=[redacted]')
}

export function sanitizeLogValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 6) {
    return '[max-depth]'
  }

  if (typeof value === 'string') {
    return redactString(value)
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (value === null || typeof value !== 'object') {
    return value
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
      cause: value.cause ? sanitizeLogValue(value.cause, depth + 1, seen) : undefined,
    }
  }

  if (seen.has(value)) {
    return '[circular]'
  }
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, depth + 1, seen))
  }

  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    result[key] = sensitiveKeyPattern.test(key)
      ? '[redacted]'
      : sanitizeLogValue(entry, depth + 1, seen)
  }
  return result
}

export function createLogger(minimumLevel: LogLevel): Logger {
  const threshold = priorities[minimumLevel]

  const write = (level: LogLevel, message: string, fields?: LogFields): void => {
    if (priorities[level] < threshold) {
      return
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(sanitizeLogValue(fields ?? {}) as LogFields),
    }

    const line = `${JSON.stringify(entry)}\n`
    if (level === 'warn' || level === 'error') {
      process.stderr.write(line)
    } else {
      process.stdout.write(line)
    }
  }

  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  }
}
