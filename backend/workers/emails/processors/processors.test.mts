import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import * as gmailSmtp from '@modules/gmail-smtp'
import { processSendEmailAddressLoginToken } from './authentication.mts'
import { processSendCommunityInviteEmail } from './community-invite.mts'
import { processSendCrmEmail } from './crm-email.mts'
import { processSendDataExportReadyEmail } from './data-export-ready.mts'
import { processSendEmailVerificationToken } from './email-verification.mts'
import { processSendSupportEmail } from './support-email.mts'

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
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  it('renders data export ready email and sends via SES', async () => {
    await processSendDataExportReadyEmail(
      { emailAddress: 'tests+user@voucha.ai' },
      { downloadUrl: 'https://example.com/export.zip', expiresInDays: 7, uiLocale: 'fr' },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'tests+user@voucha.ai',
        subject: 'Votre export de données est prêt',
        html: expect.stringContaining('Télécharger vos données'),
        text: expect.stringContaining("L'équipe Voucha"),
      }),
    )
  })
})

describe('processSendSupportEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  it('renders support reply email and sends via SES', async () => {
    await processSendSupportEmail(
      { emailAddress: 'tests+user@voucha.ai' },
      { bodyText: 'Thank you for contacting support.' },
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

  it('uses custom subject when provided', async () => {
    await processSendSupportEmail(
      { emailAddress: 'tests+user@voucha.ai' },
      { bodyText: 'Reply here.', subject: 'Re: Your ticket #42' },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Re: Your ticket #42',
      }),
    )
  })

  it('renders support reply shell copy with the input locale', async () => {
    await processSendSupportEmail(
      { emailAddress: 'tests+user@voucha.ai', uiLocale: 'es' },
      { bodyText: 'Reply here.' },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Re: Tu solicitud de soporte',
        text: expect.stringContaining('- El equipo de soporte de Voucha'),
      }),
    )
  })
})

describe('processSendCrmEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
    vi.spyOn(gmailSmtp, 'sendGmailEmail').mockResolvedValue({} as never)
  })

  it('renders CRM outreach email and sends via SES when provider is ses', async () => {
    await processSendCrmEmail(
      { emailAddress: 'tests+contact@voucha.ai' },
      {
        contactName: 'Bob',
        senderName: 'Alice',
        bodyHtml: '<p>Hello Bob</p>',
        provider: 'ses',
      },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'tests+contact@voucha.ai',
        subject: expect.any(String),
        html: expect.any(String),
        text: expect.any(String),
      }),
    )
    expect(gmailSmtp.sendGmailEmail).not.toHaveBeenCalled()
  })

  it('sends via Gmail SMTP when provider is gmail_smtp', async () => {
    await processSendCrmEmail(
      { emailAddress: 'tests+contact@voucha.ai' },
      {
        contactName: 'Bob',
        senderName: 'Alice',
        bodyHtml: '<p>Hello Bob</p>',
        provider: 'gmail_smtp',
      },
    )

    expect(gmailSmtp.sendGmailEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'tests+contact@voucha.ai',
        subject: expect.any(String),
        html: expect.any(String),
        text: expect.any(String),
      }),
    )
    expect(ses.sendEmail).not.toHaveBeenCalled()
  })
})
