import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import nodemailer from 'nodemailer'

import type { MailDelivery } from '../../config/env.js'
import type { Logger } from '../../lib/logger.js'

export type AuthEmailKind = 'email-verification' | 'password-reset'

export interface AuthEmailMessage {
  kind: AuthEmailKind
  to: string
  name: string
  token: string
  expiresAt: Date
}

export interface AuthMailer {
  send(message: AuthEmailMessage): Promise<boolean>
}

export interface AuthMailerConfig {
  delivery: MailDelivery
  from: string
  outboxDir: string
  frontendOrigin: string
  smtpUrl?: string
}

interface RenderedEmail {
  subject: string
  text: string
}

function buildActionUrl(message: AuthEmailMessage, frontendOrigin: string): string {
  const path = message.kind === 'email-verification' ? '/verify-email' : '/reset-password'
  return `${frontendOrigin}${path}?token=${encodeURIComponent(message.token)}`
}

function renderEmail(message: AuthEmailMessage, frontendOrigin: string): RenderedEmail {
  const actionUrl = buildActionUrl(message, frontendOrigin)

  if (message.kind === 'email-verification') {
    return {
      subject: 'Verify your Work email address',
      text: [
        `Hi ${message.name},`,
        '',
        'Verify your email address for Work by opening this link:',
        actionUrl,
        '',
        `This link expires on ${message.expiresAt.toISOString()}.`,
        '',
        'If you did not create a Work account, you can ignore this email.',
      ].join('\n'),
    }
  }

  return {
    subject: 'Reset your Work password',
    text: [
      `Hi ${message.name},`,
      '',
      'We received a request to reset your Work password. Open this link to choose a new password:',
      actionUrl,
      '',
      `This link expires on ${message.expiresAt.toISOString()}.`,
      '',
      'If you did not request a password reset, you can ignore this email. Your password will not change.',
    ].join('\n'),
  }
}

function fileContent(
  message: AuthEmailMessage,
  from: string,
  subject: string,
  text: string,
): string {
  const body = text.replace(/\r?\n/g, '\r\n')

  return [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
    '',
  ].join('\r\n')
}

function isHeaderSafe(value: string): boolean {
  return !/[\r\n]/.test(value)
}

export function createAuthMailer(config: AuthMailerConfig, logger: Logger): AuthMailer {
  const transporter =
    config.delivery === 'smtp' && config.smtpUrl
      ? nodemailer.createTransport({
          url: config.smtpUrl,
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 30_000,
        })
      : null

  return {
    async send(message) {
      try {
        const rendered = renderEmail(message, config.frontendOrigin)

        if (!isHeaderSafe(message.to) || !isHeaderSafe(config.from)) {
          throw new Error('Mail headers contain unsupported characters.')
        }

        if (config.delivery === 'smtp') {
          if (!transporter) {
            throw new Error('SMTP delivery is not configured.')
          }

          await transporter.sendMail({
            from: config.from,
            to: message.to,
            subject: rendered.subject,
            text: rendered.text,
          })
        } else {
          await mkdir(config.outboxDir, { recursive: true, mode: 0o700 })
          const filePath = join(config.outboxDir, `${Date.now()}-${randomUUID()}.eml`)

          await writeFile(
            filePath,
            fileContent(message, config.from, rendered.subject, rendered.text),
            {
              encoding: 'utf8',
              mode: 0o600,
              flag: 'wx',
            },
          )
        }

        logger.debug('Authentication email delivered', {
          kind: message.kind,
          delivery: config.delivery,
        })

        return true
      } catch (error) {
        logger.error('Authentication email delivery failed', {
          kind: message.kind,
          delivery: config.delivery,
          error: error instanceof Error ? error.name : 'UnknownError',
        })

        return false
      }
    },
  }
}
