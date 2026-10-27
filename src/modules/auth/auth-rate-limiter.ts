export interface RateLimitRule {
  limit: number
  windowMs: number
}

export interface RateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
}

export interface AuthRateLimiter {
  checkLogin(ip: string, email: string): RateLimitDecision
  checkRegistration(ip: string): RateLimitDecision
  checkEmailVerificationRequest(ip: string, email: string): RateLimitDecision
  checkPasswordResetRequest(ip: string, email: string): RateLimitDecision
  checkTokenConfirmation(ip: string): RateLimitDecision
  reset(): void
}

export interface AuthRateLimiterOptions {
  loginIp?: RateLimitRule
  loginEmail?: RateLimitRule
  registrationIp?: RateLimitRule
  emailVerificationIp?: RateLimitRule
  emailVerificationEmail?: RateLimitRule
  passwordResetIp?: RateLimitRule
  passwordResetEmail?: RateLimitRule
  tokenConfirmationIp?: RateLimitRule
  now?: () => number
  maxEntriesPerLimiter?: number
}

export const DEFAULT_AUTH_RATE_LIMITS = Object.freeze({
  loginIp: Object.freeze({ limit: 30, windowMs: 15 * 60 * 1000 }),
  loginEmail: Object.freeze({ limit: 10, windowMs: 15 * 60 * 1000 }),
  registrationIp: Object.freeze({ limit: 10, windowMs: 60 * 60 * 1000 }),
  emailVerificationIp: Object.freeze({ limit: 10, windowMs: 60 * 60 * 1000 }),
  emailVerificationEmail: Object.freeze({ limit: 5, windowMs: 60 * 60 * 1000 }),
  passwordResetIp: Object.freeze({ limit: 10, windowMs: 60 * 60 * 1000 }),
  passwordResetEmail: Object.freeze({ limit: 5, windowMs: 60 * 60 * 1000 }),
  tokenConfirmationIp: Object.freeze({ limit: 30, windowMs: 15 * 60 * 1000 }),
})

const DEFAULT_MAX_ENTRIES = 10_000
const PRUNE_INTERVAL_MS = 60_000

interface RateLimitBucket {
  count: number
  expiresAt: number
}

class FixedWindowLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>()
  private nextPruneAt = 0

  constructor(
    private readonly rule: RateLimitRule,
    private readonly maxEntries: number,
  ) {}

  consume(key: string, now: number): RateLimitDecision {
    this.prune(now)

    let bucket = this.buckets.get(key)

    if (!bucket || bucket.expiresAt <= now) {
      bucket = {
        count: 0,
        expiresAt: now + this.rule.windowMs,
      }
      this.buckets.set(key, bucket)
    }

    bucket.count += 1

    if (bucket.count > this.rule.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000)),
      }
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
    }
  }

  clear(): void {
    this.buckets.clear()
    this.nextPruneAt = 0
  }

  private prune(now: number): void {
    if (now < this.nextPruneAt && this.buckets.size < this.maxEntries) {
      return
    }

    this.nextPruneAt = now + PRUNE_INTERVAL_MS

    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt <= now) {
        this.buckets.delete(key)
      }
    }

    while (this.buckets.size >= this.maxEntries) {
      const oldestKey = this.buckets.keys().next().value

      if (oldestKey === undefined) {
        break
      }

      this.buckets.delete(oldestKey)
    }
  }
}

export function createAuthRateLimiter(options: AuthRateLimiterOptions = {}): AuthRateLimiter {
  const now = options.now ?? Date.now
  const maxEntries = options.maxEntriesPerLimiter ?? DEFAULT_MAX_ENTRIES
  const loginIp = new FixedWindowLimiter(
    options.loginIp ?? DEFAULT_AUTH_RATE_LIMITS.loginIp,
    maxEntries,
  )
  const loginEmail = new FixedWindowLimiter(
    options.loginEmail ?? DEFAULT_AUTH_RATE_LIMITS.loginEmail,
    maxEntries,
  )
  const registrationIp = new FixedWindowLimiter(
    options.registrationIp ?? DEFAULT_AUTH_RATE_LIMITS.registrationIp,
    maxEntries,
  )
  const emailVerificationIp = new FixedWindowLimiter(
    options.emailVerificationIp ?? DEFAULT_AUTH_RATE_LIMITS.emailVerificationIp,
    maxEntries,
  )
  const emailVerificationEmail = new FixedWindowLimiter(
    options.emailVerificationEmail ?? DEFAULT_AUTH_RATE_LIMITS.emailVerificationEmail,
    maxEntries,
  )
  const passwordResetIp = new FixedWindowLimiter(
    options.passwordResetIp ?? DEFAULT_AUTH_RATE_LIMITS.passwordResetIp,
    maxEntries,
  )
  const passwordResetEmail = new FixedWindowLimiter(
    options.passwordResetEmail ?? DEFAULT_AUTH_RATE_LIMITS.passwordResetEmail,
    maxEntries,
  )
  const tokenConfirmationIp = new FixedWindowLimiter(
    options.tokenConfirmationIp ?? DEFAULT_AUTH_RATE_LIMITS.tokenConfirmationIp,
    maxEntries,
  )

  const consumeIpAndEmail = (
    ipLimiter: FixedWindowLimiter,
    emailLimiter: FixedWindowLimiter,
    ip: string,
    email: string,
  ): RateLimitDecision => {
    const currentTime = now()
    const ipDecision = ipLimiter.consume(ip, currentTime)

    if (!ipDecision.allowed) {
      return ipDecision
    }

    return emailLimiter.consume(email, currentTime)
  }

  return {
    checkLogin(ip, email) {
      return consumeIpAndEmail(loginIp, loginEmail, ip, email)
    },

    checkRegistration(ip) {
      return registrationIp.consume(ip, now())
    },

    checkEmailVerificationRequest(ip, email) {
      return consumeIpAndEmail(emailVerificationIp, emailVerificationEmail, ip, email)
    },

    checkPasswordResetRequest(ip, email) {
      return consumeIpAndEmail(passwordResetIp, passwordResetEmail, ip, email)
    },

    checkTokenConfirmation(ip) {
      return tokenConfirmationIp.consume(ip, now())
    },

    reset() {
      loginIp.clear()
      loginEmail.clear()
      registrationIp.clear()
      emailVerificationIp.clear()
      emailVerificationEmail.clear()
      passwordResetIp.clear()
      passwordResetEmail.clear()
      tokenConfirmationIp.clear()
    },
  }
}
