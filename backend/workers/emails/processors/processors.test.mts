import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import {
  createDataRequest,
  markDataRequestProcessing,
  markDataRequestReady,
} from '@services/account-data-requests'
import * as exportS3 from '@services/account-data-requests/s3'
import { createTestUser, expireUserDataRequestForTest, softDeleteUser } from '@voucha/test-helpers'
import { processSendEmailAddressLoginToken } from './authentication.mts'
import { processSendCommunityInviteEmail } from './community-invite.mts'
import { processSendDataExportReadyEmail } from './data-export-ready.mts'
import { processSendEmailVerificationToken } from './email-verification.mts'

describe('processSendEmailAddressLoginToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  it('renders login token email and sends via SES', async () => {
    await processSendEmailAddressLoginToken(
      { emailAddress: 'tests+user@voucha.ai' },
      { token: 'ABC12345', expiration: '10 minutes' },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'tests+user@voucha.ai',
        subject: expect.any(String),
        html: expect.any(String),
        text: expect.stringContaining('one-time password:\n\nABC12345\n\nThis token will expire'),
      }),
    )
  })

  it('rejects malformed login tokens before sending', async () => {
    const malformedLoginToken = 'ABC123456789'

    await expect(
      processSendEmailAddressLoginToken(
        { emailAddress: 'tests+user@voucha.ai' },
        { token: malformedLoginToken, expiration: '10 minutes' },
      ),
    ).rejects.toThrow('Login token must be 8 uppercase hex characters')

    expect(ses.sendEmail).not.toHaveBeenCalled()
  })
})

describe('processSendEmailVerificationToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  it('renders email verification email and sends via SES', async () => {
    await processSendEmailVerificationToken(
      { emailAddress: 'tests+user@voucha.ai' },
      { token: 'verify-token-xyz', uiLocale: 'pt' },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'tests+user@voucha.ai',
        subject: 'Verifique seu endereço de email',
        html: expect.stringContaining('Digite o código de verificação abaixo'),
        text: expect.stringContaining('A equipe Voucha'),
      }),
    )
  })
})

describe('processSendCommunityInviteEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  it('renders community invite email and sends via SES', async () => {
    await processSendCommunityInviteEmail(
      { emailAddress: 'tests+user@voucha.ai' },
      { communityName: 'Test Community', inviterName: 'Alice', code: 'INVITE123' },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'tests+user@voucha.ai',
        subject: expect.any(String),
        html: expect.any(String),
        text: expect.any(String),
      }),
    )
  })
})

describe('processSendDataExportReadyEmail', () => {
  const signedUrl = 'https://downloads.example/export.zip?signature=signed-at-send'

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
    vi.spyOn(exportS3, 'getExportDownloadUrl').mockResolvedValue(signedUrl)
  })

  it('signs a fresh download URL at send time and keeps the provider failure retryable', async () => {
    const user = await createTestUser()
    const request = await readyExport(user.id, user.id)

    vi.mocked(ses.sendEmail).mockRejectedValueOnce(new Error('ses down'))
    await expect(
      processSendDataExportReadyEmail(
        { userId: user.id, uiLocale: 'fr' },
        { requestId: request.id },
      ),
    ).rejects.toThrow(/ses down/)

    await processSendDataExportReadyEmail(
      { userId: user.id, uiLocale: 'fr' },
      { requestId: request.id },
    )

    expect(ses.sendEmail).toHaveBeenCalledTimes(2)
    expect(ses.sendEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({
        to: user.email_address,
        subject: 'Votre export de données est prêt',
        html: expect.stringContaining(signedUrl),
        text: expect.stringContaining(signedUrl),
      }),
    )
    expect(exportS3.getExportDownloadUrl).toHaveBeenCalledWith(
      `${request.id}.zip`,
      expect.any(Number),
    )
  })

  it('skips a deleted recipient, an expired export, and an export requested by someone else', async () => {
    const subject = await createTestUser()
    const administrator = await createTestUser()
    const expired = await readyExport(subject.id, subject.id)
    const staffExport = await readyExport(subject.id, administrator.id)
    const deleted = await readyExport(administrator.id, administrator.id)
    await expireUserDataRequestForTest(expired.id)
    await softDeleteUser(administrator.id)

    await expect(
      processSendDataExportReadyEmail({ userId: subject.id }, { requestId: expired.id }),
    ).resolves.toMatchObject({ status: 'skipped', reason: 'export_unavailable' })
    await expect(
      processSendDataExportReadyEmail({ userId: subject.id }, { requestId: staffExport.id }),
    ).resolves.toMatchObject({ status: 'skipped', reason: 'export_unavailable' })
    await expect(
      processSendDataExportReadyEmail({ userId: administrator.id }, { requestId: deleted.id }),
    ).resolves.toMatchObject({ status: 'skipped', reason: 'no_verified_email' })

    expect(ses.sendEmail).not.toHaveBeenCalled()
  })
})

async function readyExport(userId: string, requestedById: string) {
  const request = await createDataRequest(userId, requestedById)
  expect(await markDataRequestProcessing(request.id)).toBe(true)
  expect(
    await markDataRequestReady(request.id, `${request.id}.zip`, new Date(Date.now() + 86_400_000)),
  ).toBe(true)
  return request
}
