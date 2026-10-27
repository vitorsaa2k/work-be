import type { AuthEmailMessage, AuthMailer } from '../../src/modules/auth/auth-mailer.js'

export interface CapturingAuthMailer extends AuthMailer {
  messages: AuthEmailMessage[]
  reset(): void
}

export function createCapturingAuthMailer(): CapturingAuthMailer {
  const messages: AuthEmailMessage[] = []

  return {
    messages,
    async send(message) {
      messages.push({ ...message })
      return true
    },
    reset() {
      messages.length = 0
    },
  }
}
