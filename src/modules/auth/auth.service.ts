import type { DatabaseClient } from '../../db/prisma.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { AuthTokenPurpose, UserStatus } from '../../generated/prisma/enums.js'
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidTokenError,
} from '../../lib/errors.js'
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../../lib/passwords.js'
import { createAuthToken, hashAuthToken, isValidAuthTokenFormat } from './auth-token.js'
import type { AuthMailer } from './auth-mailer.js'
import type { AuthConfig } from './auth.config.js'
import type {
  EmailVerificationConfirmInput,
  EmailVerificationRequestInput,
  LoginInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  RegisterInput,
} from './auth.schemas.js'
import { createSessionToken, hashSessionToken, isValidSessionTokenFormat } from './session-token.js'

const authenticatedUserSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  profile: {
    select: {
      bio: true,
      imageUrl: true,
      city: true,
      location: true,
    },
  },
} satisfies Prisma.UserSelect

const loginUserSelect = {
  ...authenticatedUserSelect,
  passwordHash: true,
} satisfies Prisma.UserSelect

type AuthenticatedUserRow = Prisma.UserGetPayload<{ select: typeof authenticatedUserSelect }>
type LoginUserRow = Prisma.UserGetPayload<{ select: typeof loginUserSelect }>

export interface AuthenticatedUserDto {
  id: string
  name: string
  email: string
  status: UserStatus
  emailVerified: boolean
  createdAt: string
  profile: {
    bio: string | null
    imageUrl: string | null
    city: string
    location: string | null
  } | null
}

export interface LoginResult {
  user: AuthenticatedUserDto
  token: string
  expiresAt: Date
}

export interface AuthService {
  login(input: LoginInput): Promise<LoginResult>
  register(input: RegisterInput): Promise<LoginResult>
  authenticate(token: string): Promise<AuthenticatedUserDto | null>
  logout(token: string): Promise<void>
  requestEmailVerification(input: EmailVerificationRequestInput): Promise<void>
  confirmEmailVerification(input: EmailVerificationConfirmInput): Promise<void>
  requestPasswordReset(input: PasswordResetRequestInput): Promise<void>
  resetPassword(input: PasswordResetConfirmInput): Promise<void>
}

export function toAuthenticatedUserDto(user: AuthenticatedUserRow): AuthenticatedUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
    profile: user.profile
      ? {
          bio: user.profile.bio,
          imageUrl: user.profile.imageUrl,
          city: user.profile.city,
          location: user.profile.location,
        }
      : null,
  }
}

function isLoginUserActive(
  user: LoginUserRow | null,
): user is LoginUserRow & { passwordHash: string } {
  return user !== null && user.status === 'ACTIVE' && user.passwordHash !== null
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  )
}

function tokenExpiry(ttlSeconds: number): Date {
  return new Date(Date.now() + ttlSeconds * 1000)
}

async function replaceAuthToken(
  prisma: DatabaseClient,
  userId: string,
  purpose: AuthTokenPurpose,
  ttlSeconds: number,
): Promise<{ token: string; expiresAt: Date }> {
  const { token, tokenHash } = createAuthToken()
  const now = new Date()
  const expiresAt = tokenExpiry(ttlSeconds)

  await prisma.authToken.upsert({
    where: {
      userId_purpose: {
        userId,
        purpose,
      },
    },
    create: {
      userId,
      purpose,
      tokenHash,
      expiresAt,
      createdAt: now,
    },
    update: {
      tokenHash,
      expiresAt,
      usedAt: null,
      createdAt: now,
    },
  })

  return { token, expiresAt }
}

export function createAuthService(
  prisma: DatabaseClient,
  config: Pick<
    AuthConfig,
    'sessionTtlSeconds' | 'emailVerificationTtlSeconds' | 'passwordResetTtlSeconds'
  >,
  mailer: AuthMailer,
): AuthService {
  return {
    async login(input) {
      const email = input.email.trim().toLowerCase()
      const user = await prisma.user.findFirst({
        where: {
          email: {
            equals: email,
            mode: 'insensitive',
          },
        },
        select: loginUserSelect,
      })

      const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH
      const passwordIsValid = await verifyPassword(passwordHash, input.password)

      if (!isLoginUserActive(user) || !passwordIsValid) {
        throw new InvalidCredentialsError()
      }

      const now = new Date()
      const expiresAt = new Date(now.getTime() + config.sessionTtlSeconds * 1000)
      const { token, tokenHash } = createSessionToken()

      await prisma.$transaction([
        prisma.session.deleteMany({
          where: {
            userId: user.id,
            expiresAt: {
              lte: now,
            },
          },
        }),
        prisma.session.create({
          data: {
            tokenHash,
            userId: user.id,
            expiresAt,
          },
        }),
      ])

      return {
        user: toAuthenticatedUserDto(user),
        token,
        expiresAt,
      }
    },

    async register(input) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: {
            equals: input.email,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
        },
      })

      if (existingUser) {
        throw new EmailAlreadyRegisteredError()
      }

      const passwordHash = await hashPassword(input.password)
      const now = new Date()
      const expiresAt = new Date(now.getTime() + config.sessionTtlSeconds * 1000)
      const { token, tokenHash } = createSessionToken()
      const verificationToken = createAuthToken()
      const verificationExpiresAt = tokenExpiry(config.emailVerificationTtlSeconds)

      try {
        const user = await prisma.$transaction(async (transaction) => {
          const createdUser = await transaction.user.create({
            data: {
              name: input.name,
              email: input.email,
              passwordHash,
              authTokens: {
                create: {
                  tokenHash: verificationToken.tokenHash,
                  purpose: 'EMAIL_VERIFICATION',
                  expiresAt: verificationExpiresAt,
                },
              },
            },
            select: authenticatedUserSelect,
          })

          await transaction.session.create({
            data: {
              tokenHash,
              userId: createdUser.id,
              expiresAt,
            },
          })

          return createdUser
        })

        await mailer.send({
          kind: 'email-verification',
          to: user.email,
          name: user.name,
          token: verificationToken.token,
          expiresAt: verificationExpiresAt,
        })

        return {
          user: toAuthenticatedUserDto(user),
          token,
          expiresAt,
        }
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new EmailAlreadyRegisteredError()
        }

        throw error
      }
    },

    async authenticate(token) {
      if (!isValidSessionTokenFormat(token)) {
        return null
      }

      const session = await prisma.session.findUnique({
        where: {
          tokenHash: hashSessionToken(token),
        },
        select: {
          expiresAt: true,
          user: {
            select: authenticatedUserSelect,
          },
        },
      })

      if (
        !session ||
        session.expiresAt.getTime() <= Date.now() ||
        session.user.status !== 'ACTIVE'
      ) {
        return null
      }

      return toAuthenticatedUserDto(session.user)
    },

    async logout(token) {
      if (!isValidSessionTokenFormat(token)) {
        return
      }

      await prisma.session.deleteMany({
        where: {
          tokenHash: hashSessionToken(token),
        },
      })
    },

    async requestEmailVerification(input) {
      const user = await prisma.user.findFirst({
        where: {
          email: {
            equals: input.email,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          emailVerifiedAt: true,
        },
      })

      if (!user || user.status !== 'ACTIVE' || user.emailVerifiedAt !== null) {
        return
      }

      const issued = await replaceAuthToken(
        prisma,
        user.id,
        'EMAIL_VERIFICATION',
        config.emailVerificationTtlSeconds,
      )

      await mailer.send({
        kind: 'email-verification',
        to: user.email,
        name: user.name,
        token: issued.token,
        expiresAt: issued.expiresAt,
      })
    },

    async confirmEmailVerification(input) {
      if (!isValidAuthTokenFormat(input.token)) {
        throw new InvalidTokenError()
      }

      const now = new Date()
      const authToken = await prisma.authToken.findUnique({
        where: {
          tokenHash: hashAuthToken(input.token),
        },
        select: {
          id: true,
          userId: true,
          purpose: true,
          expiresAt: true,
          usedAt: true,
          user: {
            select: {
              status: true,
              emailVerifiedAt: true,
            },
          },
        },
      })

      if (
        !authToken ||
        authToken.purpose !== 'EMAIL_VERIFICATION' ||
        authToken.usedAt !== null ||
        authToken.expiresAt.getTime() <= now.getTime() ||
        authToken.user.status !== 'ACTIVE'
      ) {
        throw new InvalidTokenError()
      }

      await prisma.$transaction(async (transaction) => {
        const consumed = await transaction.authToken.updateMany({
          where: {
            id: authToken.id,
            usedAt: null,
            expiresAt: {
              gt: now,
            },
          },
          data: {
            usedAt: now,
          },
        })

        if (consumed.count !== 1) {
          throw new InvalidTokenError()
        }

        await transaction.user.update({
          where: {
            id: authToken.userId,
          },
          data: {
            emailVerifiedAt: authToken.user.emailVerifiedAt ?? now,
          },
        })
      })
    },

    async requestPasswordReset(input) {
      const user = await prisma.user.findFirst({
        where: {
          email: {
            equals: input.email,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          passwordHash: true,
        },
      })

      if (!user || user.status !== 'ACTIVE' || user.passwordHash === null) {
        return
      }

      const issued = await replaceAuthToken(
        prisma,
        user.id,
        'PASSWORD_RESET',
        config.passwordResetTtlSeconds,
      )

      await mailer.send({
        kind: 'password-reset',
        to: user.email,
        name: user.name,
        token: issued.token,
        expiresAt: issued.expiresAt,
      })
    },

    async resetPassword(input) {
      if (!isValidAuthTokenFormat(input.token)) {
        throw new InvalidTokenError()
      }

      const now = new Date()
      const authToken = await prisma.authToken.findUnique({
        where: {
          tokenHash: hashAuthToken(input.token),
        },
        select: {
          id: true,
          userId: true,
          purpose: true,
          expiresAt: true,
          usedAt: true,
          user: {
            select: {
              status: true,
              emailVerifiedAt: true,
            },
          },
        },
      })

      if (
        !authToken ||
        authToken.purpose !== 'PASSWORD_RESET' ||
        authToken.usedAt !== null ||
        authToken.expiresAt.getTime() <= now.getTime() ||
        authToken.user.status !== 'ACTIVE'
      ) {
        throw new InvalidTokenError()
      }

      const passwordHash = await hashPassword(input.password)
      const consumedAt = new Date()

      await prisma.$transaction(async (transaction) => {
        const consumed = await transaction.authToken.updateMany({
          where: {
            id: authToken.id,
            usedAt: null,
            expiresAt: {
              gt: consumedAt,
            },
          },
          data: {
            usedAt: consumedAt,
          },
        })

        if (consumed.count !== 1) {
          throw new InvalidTokenError()
        }

        const updatedUser = await transaction.user.updateMany({
          where: {
            id: authToken.userId,
            status: 'ACTIVE',
          },
          data: {
            passwordHash,
            ...(authToken.user.emailVerifiedAt === null ? { emailVerifiedAt: consumedAt } : {}),
          },
        })

        if (updatedUser.count !== 1) {
          throw new InvalidTokenError()
        }

        await transaction.session.deleteMany({
          where: {
            userId: authToken.userId,
          },
        })

        await transaction.authToken.updateMany({
          where: {
            userId: authToken.userId,
            purpose: 'EMAIL_VERIFICATION',
            usedAt: null,
          },
          data: {
            usedAt: consumedAt,
          },
        })
      })
    },
  }
}
