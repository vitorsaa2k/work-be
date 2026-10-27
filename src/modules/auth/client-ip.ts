import { isIP } from 'node:net'

import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'

import type { AppEnv } from '../../types/app-env.js'

const UNKNOWN_CLIENT_IP = 'unknown'

export interface ClientIpSource {
  forwardedFor?: string
  remoteAddress?: string
  trustProxy: boolean
}

function normalizeIp(value: string | undefined): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  const normalized = trimmed.toLowerCase().startsWith('::ffff:')
    ? trimmed.slice('::ffff:'.length)
    : trimmed

  return isIP(normalized) ? normalized.toLowerCase() : null
}

export function resolveClientIp(source: ClientIpSource): string {
  if (source.trustProxy) {
    const forwarded = source.forwardedFor?.split(',')[0]
    const forwardedIp = normalizeIp(forwarded)

    if (forwardedIp) {
      return forwardedIp
    }
  }

  return normalizeIp(source.remoteAddress) ?? UNKNOWN_CLIENT_IP
}

export function getClientIp(c: Context<AppEnv>, trustProxy: boolean): string {
  let remoteAddress: string | undefined

  try {
    remoteAddress = getConnInfo(c).remote.address
  } catch {
    remoteAddress = undefined
  }

  return resolveClientIp({
    forwardedFor: c.req.header('x-forwarded-for'),
    remoteAddress,
    trustProxy,
  })
}
