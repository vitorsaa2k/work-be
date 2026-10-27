import type { Hono } from 'hono'

import type { AppEnv } from '../../src/types/app-env.js'

export const TEST_PASSWORD = 'TestPassword123!'

export interface SessionHeaders {
  Cookie: string
}

export async function login(
  app: Hono<AppEnv>,
  email: string,
  password = TEST_PASSWORD,
): Promise<SessionHeaders> {
  const response = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    throw new Error(`Login failed with status ${response.status}.`)
  }

  const setCookie = response.headers.get('set-cookie')

  if (!setCookie) {
    throw new Error('The login response did not set a session cookie.')
  }

  const match = /work_session=([^;]+)/.exec(setCookie)

  if (!match?.[1]) {
    throw new Error('The session cookie is missing its token.')
  }

  return {
    Cookie: `work_session=${encodeURIComponent(decodeURIComponent(match[1]))}`,
  }
}

export async function requestJson<T>(
  app: Hono<AppEnv>,
  method: string,
  path: string,
  body?: unknown,
  session?: SessionHeaders,
): Promise<{ response: Response; body: T }> {
  const response = await app.request(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(session ?? {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  const parsed = (await response.json().catch(() => null)) as T

  return { response, body: parsed }
}
