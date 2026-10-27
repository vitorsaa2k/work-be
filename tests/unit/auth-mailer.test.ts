import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createAuthMailer } from '../../src/modules/auth/auth-mailer.js'
import { silentLogger } from '../helpers/app.js'

const temporaryDirectories: string[] = []

async function createOutbox(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'work-mail-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  )
})

describe('file auth mailer', () => {
  it('writes verification and reset messages to private outbox files', async () => {
    const outbox = await createOutbox()
    const mailer = createAuthMailer(
      {
        delivery: 'file',
        from: 'Work <no-reply@example.test>',
        outboxDir: outbox,
        frontendOrigin: 'http://localhost:5173',
      },
      silentLogger,
    )
    const expiresAt = new Date('2026-10-28T12:00:00.000Z')
    const verificationToken = 'a'.repeat(43)
    const resetToken = 'b'.repeat(43)

    await expect(
      mailer.send({
        kind: 'email-verification',
        to: 'user@example.test',
        name: 'Test User',
        token: verificationToken,
        expiresAt,
      }),
    ).resolves.toBe(true)
    await expect(
      mailer.send({
        kind: 'password-reset',
        to: 'user@example.test',
        name: 'Test User',
        token: resetToken,
        expiresAt,
      }),
    ).resolves.toBe(true)

    const files = await readdir(outbox)
    const contents = await Promise.all(files.map((file) => readFile(join(outbox, file), 'utf8')))
    const combined = contents.join('\n')

    expect(files).toHaveLength(2)
    expect(files.every((file) => file.endsWith('.eml'))).toBe(true)
    expect(combined).toContain('Subject: Verify your Work email address')
    expect(combined).toContain(`http://localhost:5173/verify-email?token=${verificationToken}`)
    expect(combined).toContain('Subject: Reset your Work password')
    expect(combined).toContain(`http://localhost:5173/reset-password?token=${resetToken}`)
    expect(combined).toContain('This link expires on 2026-10-28T12:00:00.000Z.')
    expect(combined).toContain('To: user@example.test')
    expect(combined).toContain('MIME-Version: 1.0')
  })

  it('refuses unsafe mail headers without writing a file', async () => {
    const outbox = await createOutbox()
    const mailer = createAuthMailer(
      {
        delivery: 'file',
        from: 'Work <no-reply@example.test>',
        outboxDir: outbox,
        frontendOrigin: 'http://localhost:5173',
      },
      silentLogger,
    )

    await expect(
      mailer.send({
        kind: 'email-verification',
        to: 'user@example.test\r\nBcc: attacker@example.test',
        name: 'Test User',
        token: 'a'.repeat(43),
        expiresAt: new Date(),
      }),
    ).resolves.toBe(false)
    await expect(readdir(outbox)).resolves.toEqual([])
  })
})
