import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Context } from 'hono'

import type { AppEnv } from '../../types/app-env.js'
import type { AuthConfig } from './auth.config.js'

const COOKIE_PATH = '/'
const COOKIE_SAME_SITE = 'Lax'

export function readSessionToken(c: Context<AppEnv>, config: AuthConfig): string | null {
  return getCookie(c, config.sessionCookieName) ?? null
}

export function setSessionCookie(c: Context<AppEnv>, config: AuthConfig, token: string): void {
  setCookie(c, config.sessionCookieName, token, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: COOKIE_SAME_SITE,
    path: COOKIE_PATH,
    maxAge: config.sessionTtlSeconds,
  })
}

export function clearSessionCookie(c: Context<AppEnv>, config: AuthConfig): void {
  deleteCookie(c, config.sessionCookieName, {
    secure: config.secureCookies,
    sameSite: COOKIE_SAME_SITE,
    path: COOKIE_PATH,
  })
}
