import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseClient } from '../../src/db/prisma.js'
import { hashPassword, verifyPassword } from '../../src/lib/passwords.js'
import { createAuthConfig } from '../../src/modules/auth/auth.config.js'
import { createAuthRateLimiter } from '../../src/modules/auth/auth-rate-limiter.js'
import { hashAuthToken } from '../../src/modules/auth/auth-token.js'
import type { AuthService } from '../../src/modules/auth/auth.service.js'
import { createAuthService } from '../../src/modules/auth/auth.service.js'
import { hashSessionToken } from '../../src/modules/auth/session-token.js'
import { createTestApp, testAuthConfig } from '../helpers/app.js'
import { createTestDatabaseClient, resetTestDatabase } from '../helpers/database.js'
import { createUser } from '../helpers/fixtures.js'
import { readJson } from '../helpers/http.js'
import { createCapturingAuthMailer, type CapturingAuthMailer } from '../helpers/mailer.js'
import { hasTestDatabase } from '../setup/test-database.js'

const PASSWORD = 'TestPassword123!'
const ALLOWED_ORIGIN = 'http://localhost:5173'

interface AuthUserBody {
  data: {
    id: string
    name: string
    email: string
    status: string
    emailVerified: boolean
    createdAt: string
    profile: {
      bio: string | null
      imageUrl: string | null
      city: string
      location: string | null
    } | null
  }
}

interface AuthErrorBody {
  error: {
    code: string
    message: string
    requestId: string
    details?: Array<{ path: string; message: string }>
  }
}

async function loginRequest(
  app: ReturnType<typeof createTestApp>,
  email: string,
  password: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ email, password }),
  })
}

async function registerRequest(
  app: ReturnType<typeof createTestApp>,
  input: {
    name: string
    email: string
    password: string
  },
  headers: Record<string, string> = {},
): Promise<Response> {
  return app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(input),
  })
}

async function postJson(
  app: ReturnType<typeof createTestApp>,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function extractSessionToken(response: Response): string {
  const setCookie = response.headers.get('set-cookie')

  if (!setCookie) {
    throw new Error('The response did not set a session cookie.')
  }

  const match = /work_session=([^;]+)/.exec(setCookie)

  if (!match?.[1]) {
    throw new Error('The session cookie is missing its token.')
  }

  return decodeURIComponent(match[1])
}

function sessionCookie(token: string): { Cookie: string } {
  return { Cookie: `work_session=${encodeURIComponent(token)}` }
}

describe.skipIf(!hasTestDatabase)('authentication with PostgreSQL', () => {
  let prisma: DatabaseClient | undefined
  let app: ReturnType<typeof createTestApp> | undefined
  let authService: AuthService | undefined
  let mailer: CapturingAuthMailer | undefined
  let passwordHash: string | undefined

  const context = (): {
    prisma: DatabaseClient
    app: ReturnType<typeof createTestApp>
    authService: AuthService
    mailer: CapturingAuthMailer
    passwordHash: string
  } => {
    if (!prisma || !app || !authService || !mailer || !passwordHash) {
      throw new Error('The authentication test context is not initialized.')
    }

    return { prisma, app, authService, mailer, passwordHash }
  }

  beforeAll(async () => {
    if (!hasTestDatabase) {
      return
    }

    const client = createTestDatabaseClient()
    prisma = client
    mailer = createCapturingAuthMailer()
    authService = createAuthService(client, testAuthConfig, mailer)
    app = createTestApp({
      authService,
      authConfig: testAuthConfig,
    })
    passwordHash = await hashPassword(PASSWORD)
  })

  beforeEach(async () => {
    mailer?.reset()

    if (prisma) {
      await resetTestDatabase(prisma)
    }
  })

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect()
    }
  })

  it('logs in with a normalized email and creates a hashed server-side session', async () => {
    const { app, prisma, passwordHash } = context()
    const user = await createUser(prisma, {
      name: 'Case User',
      email: 'Case.User@Example.Test',
      passwordHash,
    })

    await prisma.profile.create({
      data: {
        userId: user.id,
        bio: 'Public profile',
        imageUrl: 'https://example.test/avatar.png',
        city: 'São Paulo',
        location: 'Centro',
      },
    })

    const response = await loginRequest(app, ' CASE.USER@example.test ', PASSWORD, {
      Origin: ALLOWED_ORIGIN,
    })
    const body = await readJson<AuthUserBody>(response)
    const setCookie = response.headers.get('set-cookie') ?? ''
    const token = extractSessionToken(response)
    const sessions = await prisma.session.findMany({
      select: {
        tokenHash: true,
        userId: true,
        expiresAt: true,
      },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body.data).toEqual({
      id: user.id,
      name: 'Case User',
      email: 'Case.User@Example.Test',
      status: 'ACTIVE',
      emailVerified: true,
      createdAt: expect.any(String),
      profile: {
        bio: 'Public profile',
        imageUrl: 'https://example.test/avatar.png',
        city: 'São Paulo',
        location: 'Centro',
      },
    })
    expect(Object.keys(body.data).sort()).toEqual(
      ['createdAt', 'email', 'emailVerified', 'id', 'name', 'profile', 'status'].sort(),
    )
    expect(JSON.stringify(body)).not.toContain('passwordHash')
    expect(JSON.stringify(body)).not.toContain(token)

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(setCookie).toContain(`work_session=${token}`)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toContain('Path=/')
    expect(setCookie).toContain('Max-Age=3600')
    expect(setCookie).not.toContain('Secure')

    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.userId).toBe(user.id)
    expect(sessions[0]?.tokenHash).toBe(hashSessionToken(token))
    expect(sessions[0]?.tokenHash).not.toBe(token)
    expect(sessions[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('enforces case-insensitive email uniqueness', async () => {
    const { prisma, passwordHash } = context()

    await createUser(prisma, {
      email: 'Unique.User@Example.Test',
      passwordHash,
    })

    await expect(
      createUser(prisma, {
        email: 'unique.user@example.test',
        passwordHash,
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('registers a normalized account, hashes the password, and starts a session', async () => {
    const { app, mailer, prisma } = context()
    const response = await registerRequest(
      app,
      {
        name: '  New User  ',
        email: 'New.User@Example.Test',
        password: PASSWORD,
      },
      { Origin: ALLOWED_ORIGIN },
    )
    const body = await readJson<AuthUserBody>(response)
    const token = extractSessionToken(response)
    const setCookie = response.headers.get('set-cookie') ?? ''
    const storedUser = await prisma.user.findFirst({
      where: { email: 'new.user@example.test' },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        status: true,
        emailVerifiedAt: true,
      },
    })
    const sessions = await prisma.session.findMany({
      select: {
        tokenHash: true,
        userId: true,
      },
    })
    const verificationEmail = mailer.messages.find(
      (message) => message.kind === 'email-verification',
    )
    const authTokens = await prisma.authToken.findMany({
      select: {
        tokenHash: true,
        purpose: true,
        expiresAt: true,
        usedAt: true,
      },
    })

    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body.data).toEqual({
      id: expect.any(String),
      name: 'New User',
      email: 'new.user@example.test',
      status: 'ACTIVE',
      emailVerified: false,
      createdAt: expect.any(String),
      profile: null,
    })
    expect(Object.keys(body.data).sort()).toEqual(
      ['createdAt', 'email', 'emailVerified', 'id', 'name', 'profile', 'status'].sort(),
    )
    expect(JSON.stringify(body)).not.toContain('passwordHash')
    expect(JSON.stringify(body)).not.toContain(PASSWORD)
    expect(JSON.stringify(body)).not.toContain(token)

    expect(storedUser).toMatchObject({
      id: body.data.id,
      name: 'New User',
      email: 'new.user@example.test',
      status: 'ACTIVE',
      emailVerifiedAt: null,
    })
    expect(storedUser?.passwordHash).not.toBe(PASSWORD)
    expect(await verifyPassword(storedUser?.passwordHash ?? '', PASSWORD)).toBe(true)

    expect(mailer.messages).toHaveLength(1)
    expect(verificationEmail).toMatchObject({
      kind: 'email-verification',
      to: 'new.user@example.test',
      name: 'New User',
      expiresAt: expect.any(Date),
    })
    expect(verificationEmail?.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(JSON.stringify(body)).not.toContain(verificationEmail?.token)
    expect(authTokens).toHaveLength(1)
    expect(authTokens[0]).toMatchObject({
      tokenHash: hashAuthToken(verificationEmail?.token ?? ''),
      purpose: 'EMAIL_VERIFICATION',
      usedAt: null,
    })
    expect(authTokens[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now())

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(setCookie).toContain(`work_session=${token}`)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toContain('Path=/')
    expect(setCookie).toContain('Max-Age=3600')
    expect(setCookie).not.toContain('Secure')

    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toEqual({
      tokenHash: hashSessionToken(token),
      userId: body.data.id,
    })

    const authenticated = await app.request('/api/v1/auth/me', {
      headers: sessionCookie(token),
    })
    const loginResponse = await loginRequest(app, 'NEW.USER@example.test', PASSWORD)

    expect(authenticated.status).toBe(200)
    expect(loginResponse.status).toBe(200)
    await expect(prisma.session.count()).resolves.toBe(2)
  })

  it('rejects registration when the email already exists case-insensitively', async () => {
    const { app, prisma } = context()
    const first = await registerRequest(app, {
      name: 'First User',
      email: 'Duplicate.User@Example.Test',
      password: PASSWORD,
    })
    const duplicate = await registerRequest(app, {
      name: 'Second User',
      email: 'duplicate.user@example.test',
      password: PASSWORD,
    })
    const body = await readJson<AuthErrorBody>(duplicate)

    expect(first.status).toBe(201)
    expect(duplicate.status).toBe(409)
    expect(duplicate.headers.get('set-cookie')).toBeNull()
    expect(body.error.code).toBe('EMAIL_ALREADY_REGISTERED')
    expect(body.error.message).toBe('An account with this email address already exists.')
    await expect(prisma.user.count()).resolves.toBe(1)
    await expect(prisma.session.count()).resolves.toBe(1)
  })

  it('validates registration payloads and rejects malformed JSON', async () => {
    const { app, prisma } = context()

    const shortPassword = await registerRequest(app, {
      name: 'Valid Name',
      email: 'user@example.test',
      password: 'short',
    })
    const blankName = await registerRequest(app, {
      name: ' ',
      email: 'user@example.test',
      password: PASSWORD,
    })
    const unknownField = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Valid Name',
        email: 'user@example.test',
        password: PASSWORD,
        role: 'admin',
      }),
    })
    const malformedJson = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })

    expect(shortPassword.status).toBe(400)
    expect(blankName.status).toBe(400)
    expect(unknownField.status).toBe(400)
    expect(malformedJson.status).toBe(400)
    expect((await readJson<AuthErrorBody>(shortPassword)).error.code).toBe('VALIDATION_ERROR')
    expect((await readJson<AuthErrorBody>(blankName)).error.code).toBe('VALIDATION_ERROR')
    expect((await readJson<AuthErrorBody>(unknownField)).error.code).toBe('VALIDATION_ERROR')
    expect((await readJson<AuthErrorBody>(malformedJson)).error.code).toBe('BAD_REQUEST')
    await expect(prisma.user.count()).resolves.toBe(0)
  })

  it('requests and confirms email verification with a single-use token', async () => {
    const { app, mailer, prisma, passwordHash } = context()
    const user = await createUser(prisma, {
      name: 'Unverified User',
      email: 'verify@example.test',
      passwordHash,
      emailVerifiedAt: null,
    })
    const loginResponse = await loginRequest(app, user.email, PASSWORD)
    const sessionToken = extractSessionToken(loginResponse)

    const request = await postJson(
      app,
      '/api/v1/auth/email-verification/request',
      { email: ' VERIFY@example.test ' },
      { Origin: ALLOWED_ORIGIN },
    )
    const requestBody = await readJson<{ data: { status: string } }>(request)

    expect(request.status).toBe(202)
    expect(request.headers.get('cache-control')).toBe('no-store')
    expect(request.headers.get('set-cookie')).toBeNull()
    expect(requestBody).toEqual({ data: { status: 'accepted' } })
    expect(mailer.messages).toHaveLength(1)
    expect(mailer.messages[0]).toMatchObject({
      kind: 'email-verification',
      to: user.email,
      name: 'Unverified User',
    })

    const verificationToken = mailer.messages[0]?.token ?? ''
    const storedToken = await prisma.authToken.findUnique({
      where: { tokenHash: hashAuthToken(verificationToken) },
      select: {
        purpose: true,
        expiresAt: true,
        usedAt: true,
      },
    })

    expect(verificationToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(storedToken?.purpose).toBe('EMAIL_VERIFICATION')
    expect(storedToken?.expiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(storedToken?.usedAt).toBeNull()

    const confirm = await postJson(
      app,
      '/api/v1/auth/email-verification/confirm',
      { token: verificationToken },
      { Origin: ALLOWED_ORIGIN },
    )

    expect(confirm.status).toBe(204)
    expect(await confirm.text()).toBe('')
    expect(confirm.headers.get('cache-control')).toBe('no-store')

    const authenticated = await app.request('/api/v1/auth/me', {
      headers: sessionCookie(sessionToken),
    })
    const authenticatedBody = await readJson<AuthUserBody>(authenticated)
    const storedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { emailVerifiedAt: true },
    })
    const usedToken = await prisma.authToken.findUnique({
      where: { tokenHash: hashAuthToken(verificationToken) },
      select: { usedAt: true },
    })

    expect(authenticated.status).toBe(200)
    expect(authenticatedBody.data.emailVerified).toBe(true)
    expect(storedUser?.emailVerifiedAt).toBeInstanceOf(Date)
    expect(usedToken?.usedAt).toBeInstanceOf(Date)

    const replay = await postJson(app, '/api/v1/auth/email-verification/confirm', {
      token: verificationToken,
    })
    const replayBody = await readJson<AuthErrorBody>(replay)

    expect(replay.status).toBe(400)
    expect(replayBody.error.code).toBe('INVALID_TOKEN')
    expect(replayBody.error.message).toBe('The token is invalid or has expired.')

    const resend = await postJson(app, '/api/v1/auth/email-verification/request', {
      email: user.email,
    })

    expect(resend.status).toBe(202)
    expect(mailer.messages).toHaveLength(1)
  })

  it('invalidates previous verification and reset tokens when reissued', async () => {
    const { app, mailer, prisma, passwordHash } = context()
    const user = await createUser(prisma, {
      email: 'reissue@example.test',
      passwordHash,
      emailVerifiedAt: null,
    })

    await postJson(app, '/api/v1/auth/email-verification/request', { email: user.email })
    await postJson(app, '/api/v1/auth/email-verification/request', { email: user.email })

    const verificationEmails = mailer.messages.filter(
      (message) => message.kind === 'email-verification',
    )
    const firstVerificationToken = verificationEmails[0]?.token ?? ''
    const secondVerificationToken = verificationEmails[1]?.token ?? ''

    expect(verificationEmails).toHaveLength(2)
    expect(firstVerificationToken).not.toBe(secondVerificationToken)

    const firstVerification = await postJson(app, '/api/v1/auth/email-verification/confirm', {
      token: firstVerificationToken,
    })
    const secondVerification = await postJson(app, '/api/v1/auth/email-verification/confirm', {
      token: secondVerificationToken,
    })

    expect(firstVerification.status).toBe(400)
    expect(secondVerification.status).toBe(204)

    await postJson(app, '/api/v1/auth/password-reset/request', { email: user.email })
    await postJson(app, '/api/v1/auth/password-reset/request', { email: user.email })

    const resetEmails = mailer.messages.filter((message) => message.kind === 'password-reset')
    const firstResetToken = resetEmails[0]?.token ?? ''
    const secondResetToken = resetEmails[1]?.token ?? ''

    expect(resetEmails).toHaveLength(2)
    expect(firstResetToken).not.toBe(secondResetToken)

    const firstReset = await postJson(app, '/api/v1/auth/password-reset/confirm', {
      token: firstResetToken,
      password: 'NewPassword123!',
    })
    const secondReset = await postJson(app, '/api/v1/auth/password-reset/confirm', {
      token: secondResetToken,
      password: 'AnotherPassword123!',
    })

    expect(firstReset.status).toBe(400)
    expect(secondReset.status).toBe(204)

    const newLogin = await loginRequest(app, user.email, 'AnotherPassword123!')
    const authTokens = await prisma.authToken.findMany({
      select: {
        purpose: true,
        usedAt: true,
      },
    })

    expect(newLogin.status).toBe(200)
    expect(authTokens).toHaveLength(2)
    expect(authTokens.every((token) => token.usedAt instanceof Date)).toBe(true)
  })

  it('rejects expired email verification tokens', async () => {
    const { app, mailer, prisma, passwordHash } = context()
    const user = await createUser(prisma, {
      email: 'expired-verification@example.test',
      passwordHash,
      emailVerifiedAt: null,
    })

    await postJson(app, '/api/v1/auth/email-verification/request', { email: user.email })
    const verificationToken = mailer.messages[0]?.token ?? ''
    const now = Date.now()

    await prisma.authToken.update({
      where: { tokenHash: hashAuthToken(verificationToken) },
      data: {
        createdAt: new Date(now - 2_000),
        expiresAt: new Date(now - 1_000),
      },
    })

    const confirm = await postJson(app, '/api/v1/auth/email-verification/confirm', {
      token: verificationToken,
    })
    const storedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { emailVerifiedAt: true },
    })

    expect(confirm.status).toBe(400)
    expect((await readJson<AuthErrorBody>(confirm)).error.code).toBe('INVALID_TOKEN')
    expect(storedUser?.emailVerifiedAt).toBeNull()
  })

  it('returns a generic accepted response for email verification requests', async () => {
    const { app, mailer, prisma, passwordHash } = context()
    const verified = await createUser(prisma, {
      email: 'already-verified@example.test',
      passwordHash,
    })
    const inactive = await createUser(prisma, {
      email: 'inactive-verification@example.test',
      passwordHash,
      status: 'INACTIVE',
      emailVerifiedAt: null,
    })

    const unknownResponse = await postJson(app, '/api/v1/auth/email-verification/request', {
      email: 'unknown-verification@example.test',
    })
    const verifiedResponse = await postJson(app, '/api/v1/auth/email-verification/request', {
      email: verified.email,
    })
    const inactiveResponse = await postJson(app, '/api/v1/auth/email-verification/request', {
      email: inactive.email,
    })

    expect(unknownResponse.status).toBe(202)
    expect(verifiedResponse.status).toBe(202)
    expect(inactiveResponse.status).toBe(202)
    expect(await unknownResponse.json()).toEqual({
      data: { status: 'accepted' },
    })
    expect(await verifiedResponse.json()).toEqual({
      data: { status: 'accepted' },
    })
    expect(await inactiveResponse.json()).toEqual({
      data: { status: 'accepted' },
    })
    expect(mailer.messages).toHaveLength(0)
    await expect(prisma.authToken.count()).resolves.toBe(0)
  })

  it('resets a password, revokes sessions, and verifies the email address', async () => {
    const { app, mailer, prisma } = context()
    const registration = await registerRequest(app, {
      name: 'Reset User',
      email: 'reset@example.test',
      password: PASSWORD,
    })
    const registrationToken = extractSessionToken(registration)
    const secondLogin = await loginRequest(app, 'reset@example.test', PASSWORD)
    const secondSessionToken = extractSessionToken(secondLogin)

    expect(registration.status).toBe(201)
    expect(secondLogin.status).toBe(200)
    await expect(prisma.session.count()).resolves.toBe(2)

    const request = await postJson(
      app,
      '/api/v1/auth/password-reset/request',
      { email: ' RESET@example.test ' },
      { Origin: ALLOWED_ORIGIN },
    )
    const requestBody = await readJson<{ data: { status: string } }>(request)
    const resetEmail = mailer.messages.find((message) => message.kind === 'password-reset')
    const resetToken = resetEmail?.token ?? ''

    expect(request.status).toBe(202)
    expect(request.headers.get('cache-control')).toBe('no-store')
    expect(requestBody).toEqual({ data: { status: 'accepted' } })
    expect(resetEmail).toMatchObject({
      kind: 'password-reset',
      to: 'reset@example.test',
      name: 'Reset User',
    })
    expect(resetToken).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const storedResetToken = await prisma.authToken.findUnique({
      where: { tokenHash: hashAuthToken(resetToken) },
      select: {
        purpose: true,
        expiresAt: true,
      },
    })

    expect(storedResetToken?.purpose).toBe('PASSWORD_RESET')
    expect(storedResetToken?.expiresAt.getTime()).toBeGreaterThan(Date.now())

    const confirm = await postJson(
      app,
      '/api/v1/auth/password-reset/confirm',
      {
        token: resetToken,
        password: 'NewPassword123!',
      },
      { Origin: ALLOWED_ORIGIN },
    )

    expect(confirm.status).toBe(204)
    expect(await confirm.text()).toBe('')
    expect(confirm.headers.get('cache-control')).toBe('no-store')
    await expect(prisma.session.count()).resolves.toBe(0)

    const oldLogin = await loginRequest(app, 'reset@example.test', PASSWORD)
    const newLogin = await loginRequest(app, 'reset@example.test', 'NewPassword123!')
    const newLoginBody = await readJson<AuthUserBody>(newLogin)
    const storedUser = await prisma.user.findUnique({
      where: { email: 'reset@example.test' },
      select: {
        emailVerifiedAt: true,
        passwordHash: true,
      },
    })
    const authTokens = await prisma.authToken.findMany({
      select: {
        purpose: true,
        usedAt: true,
      },
    })

    expect(oldLogin.status).toBe(401)
    expect(newLogin.status).toBe(200)
    expect(newLoginBody.data.emailVerified).toBe(true)
    expect(storedUser?.emailVerifiedAt).toBeInstanceOf(Date)
    expect(await verifyPassword(storedUser?.passwordHash ?? '', 'NewPassword123!')).toBe(true)
    expect(authTokens).toHaveLength(2)
    expect(authTokens.every((token) => token.usedAt instanceof Date)).toBe(true)

    const replay = await postJson(app, '/api/v1/auth/password-reset/confirm', {
      token: resetToken,
      password: 'AnotherPassword123!',
    })

    expect(replay.status).toBe(400)
    expect((await readJson<AuthErrorBody>(replay)).error.code).toBe('INVALID_TOKEN')

    const oldSession = await app.request('/api/v1/auth/me', {
      headers: sessionCookie(registrationToken),
    })
    const secondOldSession = await app.request('/api/v1/auth/me', {
      headers: sessionCookie(secondSessionToken),
    })

    expect(oldSession.status).toBe(401)
    expect(secondOldSession.status).toBe(401)
  })

  it('returns a generic accepted response for password reset requests', async () => {
    const { app, mailer, prisma, passwordHash } = context()
    const inactive = await createUser(prisma, {
      email: 'inactive-reset@example.test',
      passwordHash,
      status: 'INACTIVE',
    })
    const noPassword = await createUser(prisma, {
      email: 'no-password-reset@example.test',
    })

    const unknownResponse = await postJson(app, '/api/v1/auth/password-reset/request', {
      email: 'unknown-reset@example.test',
    })
    const inactiveResponse = await postJson(app, '/api/v1/auth/password-reset/request', {
      email: inactive.email,
    })
    const noPasswordResponse = await postJson(app, '/api/v1/auth/password-reset/request', {
      email: noPassword.email,
    })

    expect(unknownResponse.status).toBe(202)
    expect(inactiveResponse.status).toBe(202)
    expect(noPasswordResponse.status).toBe(202)
    expect(await unknownResponse.json()).toEqual({ data: { status: 'accepted' } })
    expect(await inactiveResponse.json()).toEqual({ data: { status: 'accepted' } })
    expect(await noPasswordResponse.json()).toEqual({ data: { status: 'accepted' } })
    expect(mailer.messages).toHaveLength(0)
    await expect(prisma.authToken.count()).resolves.toBe(0)
  })

  it('rejects expired password reset tokens without changing the password', async () => {
    const { app, mailer, prisma, passwordHash } = context()
    const user = await createUser(prisma, {
      email: 'expired-reset@example.test',
      passwordHash,
    })

    await postJson(app, '/api/v1/auth/password-reset/request', { email: user.email })
    const resetToken = mailer.messages[0]?.token ?? ''
    const now = Date.now()

    await prisma.authToken.update({
      where: { tokenHash: hashAuthToken(resetToken) },
      data: {
        createdAt: new Date(now - 2_000),
        expiresAt: new Date(now - 1_000),
      },
    })

    const confirm = await postJson(app, '/api/v1/auth/password-reset/confirm', {
      token: resetToken,
      password: 'NewPassword123!',
    })
    const currentLogin = await loginRequest(app, user.email, PASSWORD)

    expect(confirm.status).toBe(400)
    expect((await readJson<AuthErrorBody>(confirm)).error.code).toBe('INVALID_TOKEN')
    expect(currentLogin.status).toBe(200)
  })

  it('validates email verification and password reset payloads', async () => {
    const { app, mailer, prisma } = context()

    const invalidVerificationEmail = await postJson(
      app,
      '/api/v1/auth/email-verification/request',
      { email: 'not-an-email' },
    )
    const invalidVerificationToken = await postJson(
      app,
      '/api/v1/auth/email-verification/confirm',
      { token: 'short' },
    )
    const invalidResetEmail = await postJson(app, '/api/v1/auth/password-reset/request', {
      email: 'not-an-email',
    })
    const shortResetPassword = await postJson(app, '/api/v1/auth/password-reset/confirm', {
      token: 'a'.repeat(43),
      password: 'short',
    })
    const unknownField = await postJson(app, '/api/v1/auth/password-reset/request', {
      email: 'user@example.test',
      role: 'admin',
    })

    expect(invalidVerificationEmail.status).toBe(400)
    expect(invalidVerificationToken.status).toBe(400)
    expect(invalidResetEmail.status).toBe(400)
    expect(shortResetPassword.status).toBe(400)
    expect(unknownField.status).toBe(400)
    expect((await readJson<AuthErrorBody>(invalidVerificationEmail)).error.code).toBe(
      'VALIDATION_ERROR',
    )
    expect((await readJson<AuthErrorBody>(invalidVerificationToken)).error.code).toBe(
      'VALIDATION_ERROR',
    )
    expect((await readJson<AuthErrorBody>(invalidResetEmail)).error.code).toBe('VALIDATION_ERROR')
    expect((await readJson<AuthErrorBody>(shortResetPassword)).error.code).toBe('VALIDATION_ERROR')
    expect((await readJson<AuthErrorBody>(unknownField)).error.code).toBe('VALIDATION_ERROR')
    expect(mailer.messages).toHaveLength(0)
    await expect(prisma.authToken.count()).resolves.toBe(0)
  })

  it('blocks cross-site verification and password reset requests', async () => {
    const { app, mailer } = context()
    const headers = { Origin: 'https://malicious.example' }

    const verificationRequest = await postJson(
      app,
      '/api/v1/auth/email-verification/request',
      { email: 'user@example.test' },
      headers,
    )
    const verificationConfirm = await postJson(
      app,
      '/api/v1/auth/email-verification/confirm',
      { token: 'a'.repeat(43) },
      headers,
    )
    const resetRequest = await postJson(
      app,
      '/api/v1/auth/password-reset/request',
      { email: 'user@example.test' },
      headers,
    )
    const resetConfirm = await postJson(
      app,
      '/api/v1/auth/password-reset/confirm',
      { token: 'a'.repeat(43), password: 'NewPassword123!' },
      headers,
    )

    expect(verificationRequest.status).toBe(403)
    expect(verificationConfirm.status).toBe(403)
    expect(resetRequest.status).toBe(403)
    expect(resetConfirm.status).toBe(403)
    expect((await readJson<AuthErrorBody>(verificationRequest)).error.code).toBe('FORBIDDEN')
    expect((await readJson<AuthErrorBody>(verificationConfirm)).error.code).toBe('FORBIDDEN')
    expect((await readJson<AuthErrorBody>(resetRequest)).error.code).toBe('FORBIDDEN')
    expect((await readJson<AuthErrorBody>(resetConfirm)).error.code).toBe('FORBIDDEN')
    expect(mailer.messages).toHaveLength(0)
  })

  it('throttles email verification requests per IP', async () => {
    const { authService, mailer, prisma, passwordHash } = context()
    const rateLimiter = createAuthRateLimiter({
      emailVerificationIp: { limit: 1, windowMs: 60_000 },
      emailVerificationEmail: { limit: 100, windowMs: 60_000 },
    })
    const throttledApp = createTestApp({
      authService,
      authConfig: { ...testAuthConfig, trustProxy: true },
      authRateLimiter: rateLimiter,
    })
    const user = await createUser(prisma, {
      email: 'throttled-verification@example.test',
      passwordHash,
      emailVerifiedAt: null,
    })
    const headers = {
      Origin: ALLOWED_ORIGIN,
      'x-forwarded-for': '203.0.113.80',
    }

    const first = await postJson(
      throttledApp,
      '/api/v1/auth/email-verification/request',
      { email: user.email },
      headers,
    )
    const second = await postJson(
      throttledApp,
      '/api/v1/auth/email-verification/request',
      { email: user.email },
      headers,
    )
    const body = await readJson<AuthErrorBody>(second)

    expect(first.status).toBe(202)
    expect(second.status).toBe(429)
    expect(second.headers.get('retry-after')).toBe('60')
    expect(second.headers.get('access-control-expose-headers')).toContain('Retry-After')
    expect(body.error.code).toBe('TOO_MANY_ATTEMPTS')
    expect(mailer.messages).toHaveLength(1)
  })

  it('blocks cross-site registration attempts', async () => {
    const { app, prisma } = context()
    const response = await registerRequest(
      app,
      {
        name: 'CSRF User',
        email: 'csrf-register@example.test',
        password: PASSWORD,
      },
      { Origin: 'https://malicious.example' },
    )

    expect(response.status).toBe(403)
    expect((await readJson<AuthErrorBody>(response)).error.code).toBe('FORBIDDEN')
    expect(response.headers.get('set-cookie')).toBeNull()
    await expect(prisma.user.count()).resolves.toBe(0)
  })

  it('throttles login attempts per IP and returns retry metadata', async () => {
    const { authService, prisma, passwordHash } = context()
    const rateLimiter = createAuthRateLimiter({
      loginIp: { limit: 2, windowMs: 60_000 },
      loginEmail: { limit: 100, windowMs: 60_000 },
      registrationIp: { limit: 100, windowMs: 60_000 },
    })
    const app = createTestApp({
      authService,
      authConfig: { ...testAuthConfig, trustProxy: true },
      authRateLimiter: rateLimiter,
    })
    const user = await createUser(prisma, {
      email: 'throttled-login@example.test',
      passwordHash,
    })
    const headers = {
      Origin: ALLOWED_ORIGIN,
      'x-forwarded-for': '203.0.113.50',
    }

    const firstFailure = await loginRequest(app, user.email, 'WrongPassword123!', headers)
    const secondFailure = await loginRequest(app, user.email, 'WrongPassword123!', headers)
    const blocked = await loginRequest(app, user.email, PASSWORD, headers)
    const body = await readJson<AuthErrorBody>(blocked)

    expect(firstFailure.status).toBe(401)
    expect(secondFailure.status).toBe(401)
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('set-cookie')).toBeNull()
    expect(blocked.headers.get('cache-control')).toBe('no-store')
    expect(blocked.headers.get('retry-after')).toBe('60')
    expect(blocked.headers.get('access-control-expose-headers')).toContain('Retry-After')
    expect(body.error.code).toBe('TOO_MANY_ATTEMPTS')

    const otherIp = await loginRequest(app, user.email, PASSWORD, {
      Origin: ALLOWED_ORIGIN,
      'x-forwarded-for': '203.0.113.51',
    })

    expect(otherIp.status).toBe(200)
    await expect(prisma.session.count()).resolves.toBe(1)
  })

  it('throttles registration attempts per IP', async () => {
    const { authService, prisma } = context()
    const rateLimiter = createAuthRateLimiter({
      loginIp: { limit: 100, windowMs: 60_000 },
      loginEmail: { limit: 100, windowMs: 60_000 },
      registrationIp: { limit: 1, windowMs: 60_000 },
    })
    const app = createTestApp({
      authService,
      authConfig: testAuthConfig,
      authRateLimiter: rateLimiter,
    })

    const first = await registerRequest(app, {
      name: 'First User',
      email: 'first-registration@example.test',
      password: PASSWORD,
    })
    const second = await registerRequest(app, {
      name: 'Second User',
      email: 'second-registration@example.test',
      password: PASSWORD,
    })
    const body = await readJson<AuthErrorBody>(second)

    expect(first.status).toBe(201)
    expect(second.status).toBe(429)
    expect(second.headers.get('set-cookie')).toBeNull()
    expect(second.headers.get('retry-after')).toBe('60')
    expect(body.error.code).toBe('TOO_MANY_ATTEMPTS')
    await expect(prisma.user.count()).resolves.toBe(1)
    await expect(prisma.session.count()).resolves.toBe(1)
  })

  it('returns the authenticated user from me without private fields', async () => {
    const { app, prisma, passwordHash } = context()
    const user = await createUser(prisma, {
      name: 'Profile User',
      email: 'profile@example.test',
      passwordHash,
    })

    const loginResponse = await loginRequest(app, user.email, PASSWORD)
    const token = extractSessionToken(loginResponse)
    const response = await app.request('/api/v1/auth/me', {
      headers: sessionCookie(token),
    })
    const body = await readJson<AuthUserBody>(response)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body.data).toMatchObject({
      id: user.id,
      name: 'Profile User',
      email: 'profile@example.test',
      status: 'ACTIVE',
      emailVerified: true,
      profile: null,
    })
    expect(JSON.stringify(body)).not.toContain('passwordHash')
    expect(JSON.stringify(body)).not.toContain(passwordHash)
  })

  it('returns the same generic error for a wrong password and an unknown email', async () => {
    const { app, prisma, passwordHash } = context()
    const user = await createUser(prisma, {
      email: 'known@example.test',
      passwordHash,
    })

    const wrongPassword = await loginRequest(app, user.email, 'WrongPassword123!')
    const unknownEmail = await loginRequest(app, 'unknown@example.test', PASSWORD)
    const wrongBody = await readJson<AuthErrorBody>(wrongPassword)
    const unknownBody = await readJson<AuthErrorBody>(unknownEmail)

    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    expect(wrongBody.error.code).toBe('INVALID_CREDENTIALS')
    expect(unknownBody.error.code).toBe('INVALID_CREDENTIALS')
    expect(wrongBody.error.message).toBe(unknownBody.error.message)
    expect(wrongPassword.headers.get('set-cookie')).toBeNull()
    expect(unknownEmail.headers.get('set-cookie')).toBeNull()
    await expect(prisma.session.count()).resolves.toBe(0)
  })

  it('rejects inactive accounts and accounts without a password hash', async () => {
    const { app, prisma, passwordHash } = context()
    const inactive = await createUser(prisma, {
      email: 'inactive@example.test',
      passwordHash,
      status: 'INACTIVE',
    })
    const noPassword = await createUser(prisma, {
      email: 'no-password@example.test',
    })

    const inactiveResponse = await loginRequest(app, inactive.email, PASSWORD)
    const noPasswordResponse = await loginRequest(app, noPassword.email, PASSWORD)

    expect(inactiveResponse.status).toBe(401)
    expect(noPasswordResponse.status).toBe(401)
    expect((await readJson<AuthErrorBody>(inactiveResponse)).error.code).toBe('INVALID_CREDENTIALS')
    expect((await readJson<AuthErrorBody>(noPasswordResponse)).error.code).toBe(
      'INVALID_CREDENTIALS',
    )
  })

  it('validates login payloads and rejects malformed JSON', async () => {
    const { app } = context()

    const invalidEmail = await loginRequest(app, 'not-an-email', PASSWORD)
    const emptyPassword = await loginRequest(app, 'user@example.test', '')
    const unknownField = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.test',
        password: PASSWORD,
        role: 'admin',
      }),
    })
    const malformedJson = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })

    expect(invalidEmail.status).toBe(400)
    expect(emptyPassword.status).toBe(400)
    expect(unknownField.status).toBe(400)
    expect(malformedJson.status).toBe(400)
    expect((await readJson<AuthErrorBody>(invalidEmail)).error.code).toBe('VALIDATION_ERROR')
    expect((await readJson<AuthErrorBody>(emptyPassword)).error.code).toBe('VALIDATION_ERROR')
    expect((await readJson<AuthErrorBody>(unknownField)).error.code).toBe('VALIDATION_ERROR')
    expect((await readJson<AuthErrorBody>(malformedJson)).error.code).toBe('BAD_REQUEST')
  })

  it('requires a valid, unexpired session for protected routes', async () => {
    const { app, prisma, passwordHash } = context()
    const user = await createUser(prisma, {
      email: 'session@example.test',
      passwordHash,
    })
    const loginResponse = await loginRequest(app, user.email, PASSWORD)
    const token = extractSessionToken(loginResponse)

    const missing = await app.request('/api/v1/auth/me', {
      headers: { Origin: ALLOWED_ORIGIN },
    })
    const malformed = await app.request('/api/v1/auth/me', {
      headers: sessionCookie('short'),
    })
    const unknown = await app.request('/api/v1/auth/me', {
      headers: sessionCookie('a'.repeat(43)),
    })

    expect(missing.status).toBe(401)
    expect(missing.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN)
    expect(missing.headers.get('access-control-allow-credentials')).toBe('true')
    expect(malformed.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect((await readJson<AuthErrorBody>(missing)).error.code).toBe('AUTHENTICATION_REQUIRED')
    expect((await readJson<AuthErrorBody>(malformed)).error.code).toBe('AUTHENTICATION_REQUIRED')
    expect((await readJson<AuthErrorBody>(unknown)).error.code).toBe('AUTHENTICATION_REQUIRED')

    const now = Date.now()
    await prisma.session.updateMany({
      where: { tokenHash: hashSessionToken(token) },
      data: {
        createdAt: new Date(now - 2_000),
        expiresAt: new Date(now - 1_000),
      },
    })

    const expired = await app.request('/api/v1/auth/me', {
      headers: sessionCookie(token),
    })

    expect(expired.status).toBe(401)
    expect((await readJson<AuthErrorBody>(expired)).error.code).toBe('AUTHENTICATION_REQUIRED')
  })

  it('rejects an existing session after the account is suspended', async () => {
    const { app, prisma, passwordHash } = context()
    const user = await createUser(prisma, {
      email: 'suspended@example.test',
      passwordHash,
    })
    const loginResponse = await loginRequest(app, user.email, PASSWORD)
    const token = extractSessionToken(loginResponse)

    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'SUSPENDED' },
    })

    const response = await app.request('/api/v1/auth/me', {
      headers: sessionCookie(token),
    })

    expect(response.status).toBe(401)
    expect((await readJson<AuthErrorBody>(response)).error.code).toBe('AUTHENTICATION_REQUIRED')
  })

  it('logs out only the current session and is idempotent', async () => {
    const { app, prisma, passwordHash } = context()
    const user = await createUser(prisma, {
      email: 'logout@example.test',
      passwordHash,
    })
    const firstLogin = await loginRequest(app, user.email, PASSWORD)
    const firstToken = extractSessionToken(firstLogin)
    const secondLogin = await loginRequest(app, user.email, PASSWORD)
    const secondToken = extractSessionToken(secondLogin)

    const blockedLogout = await app.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        ...sessionCookie(firstToken),
        Origin: 'https://malicious.example',
      },
    })

    expect(blockedLogout.status).toBe(403)
    await expect(prisma.session.count()).resolves.toBe(2)

    const response = await app.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: sessionCookie(firstToken),
    })

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('set-cookie')).toContain('work_session=')
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    await expect(prisma.session.count()).resolves.toBe(1)

    const loggedOut = await app.request('/api/v1/auth/me', {
      headers: sessionCookie(firstToken),
    })
    const stillAuthenticated = await app.request('/api/v1/auth/me', {
      headers: sessionCookie(secondToken),
    })

    expect(loggedOut.status).toBe(401)
    expect(stillAuthenticated.status).toBe(200)

    const secondLogout = await app.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: sessionCookie(secondToken),
    })
    const withoutCookie = await app.request('/api/v1/auth/logout', {
      method: 'POST',
    })

    expect(secondLogout.status).toBe(204)
    expect(withoutCookie.status).toBe(204)
    await expect(prisma.session.count()).resolves.toBe(0)
  })

  it('blocks cross-site unsafe requests with origin checks', async () => {
    const { app, prisma, passwordHash } = context()
    const user = await createUser(prisma, {
      email: 'csrf@example.test',
      passwordHash,
    })

    const blockedOrigin = await loginRequest(app, user.email, PASSWORD, {
      Origin: 'https://malicious.example',
    })
    const blockedFetchSite = await loginRequest(app, user.email, PASSWORD, {
      'Sec-Fetch-Site': 'cross-site',
    })
    const allowedOrigin = await loginRequest(app, user.email, PASSWORD, {
      Origin: ALLOWED_ORIGIN,
    })

    expect(blockedOrigin.status).toBe(403)
    expect(blockedFetchSite.status).toBe(403)
    expect((await readJson<AuthErrorBody>(blockedOrigin)).error.code).toBe('FORBIDDEN')
    expect((await readJson<AuthErrorBody>(blockedFetchSite)).error.code).toBe('FORBIDDEN')
    expect(blockedOrigin.headers.get('set-cookie')).toBeNull()
    expect(blockedFetchSite.headers.get('set-cookie')).toBeNull()
    expect(allowedOrigin.status).toBe(200)
    await expect(prisma.session.count()).resolves.toBe(1)
  })

  it('uses a Secure host-only cookie in production', async () => {
    const { prisma, passwordHash } = context()
    const productionConfig = createAuthConfig('production')
    const secureApp = createTestApp({
      authService: createAuthService(prisma, productionConfig, createCapturingAuthMailer()),
      authConfig: productionConfig,
    })
    const user = await createUser(prisma, {
      email: 'secure-cookie@example.test',
      passwordHash,
    })

    const response = await loginRequest(secureApp, user.email, PASSWORD)
    const setCookie = response.headers.get('set-cookie') ?? ''

    expect(response.status).toBe(200)
    expect(setCookie).toContain('__Host-work_session=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('Path=/')
    expect(setCookie).toContain('Max-Age=2592000')
  })
})
