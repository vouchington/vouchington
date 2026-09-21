import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import * as gmailSmtp from '@modules/gmail-smtp'
import { createTestUser } from '@voucha/test-helpers'
import { updateUserFields } from '@services/users/update-fields'
import { createSesBounceEvent } from '@services/ses-bounce-events'
import { sendClassifiedEmail } from './send.mts'

const r = () => Math.random().toString(36).slice(2, 10)

describe('sendClassifiedEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
    vi.spyOn(gmailSmtp, 'sendGmailEmail').mockResolvedValue({} as never)
  })

  it('sends transactional email without suppression checks or unsubscribe headers', async () => {
    const suffix = r()
    await sendClassifiedEmail('processSendWelcomeEmail', {
      to: `tests+${suffix}@voucha.ai`,
      subject: 'Welcome',
      html: '<p>hi</p>',
    })

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: `tests+${suffix}@voucha.ai`,
        subject: 'Welcome',
        headers: undefined,
      }),
    )
  })

  it('sends marketing email with user-category unsubscribe headers when the user has not opted out', async () => {
    const user = await createTestUser()
    await sendClassifiedEmail('processSendFollowTopicsEmail', {
      to: user!.email_address!,
      subject: 'New topics',
      userId: user!.id,
    })

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'List-Unsubscribe': expect.stringContaining('/api/v1/email-unsubscribe?token='),
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }),
      }),
    )
  })

  it('suppresses user-category marketing email when the user has opted out', async () => {
    const user = await createTestUser()
    await updateUserFields(user!.id, { engagement_emails_enabled: false })

    const result = await sendClassifiedEmail('processSendFollowTopicsEmail', {
      to: user!.email_address!,
      subject: 'New topics',
      userId: user!.id,
    })

    expect(result).toBeNull()
    expect(ses.sendEmail).not.toHaveBeenCalled()
  })

  it('suppresses community_digest marketing email when moderation emails are disabled', async () => {
    const user = await createTestUser()
    await updateUserFields(user!.id, { moderation_emails_enabled: false })

    const result = await sendClassifiedEmail('processSendCommunityModerationSummaryEmail', {
      to: user!.email_address!,
      subject: 'Moderation summary',
      userId: user!.id,
    })

    expect(result).toBeNull()
    expect(ses.sendEmail).not.toHaveBeenCalled()
  })

  it('suppresses marketing email when the recipient has a permanent bounce on file', async () => {
    const user = await createTestUser()
    const suffix = r()
    const bouncedAddress = `tests+bounced-${suffix}@voucha.ai`
    await createSesBounceEvent({
      notification_type: 'bounce',
      bounce_type: 'permanent',
      recipients: [bouncedAddress],
      raw_message: {},
    })

    const result = await sendClassifiedEmail('processSendFollowTopicsEmail', {
      to: bouncedAddress,
      subject: 'New topics',
      userId: user!.id,
    })

    expect(result).toBeNull()
    expect(ses.sendEmail).not.toHaveBeenCalled()
  })

  it('does not suppress transactional email for a bounced recipient', async () => {
    const suffix = r()
    const bouncedAddress = `tests+txn-bounced-${suffix}@voucha.ai`
    await createSesBounceEvent({
      notification_type: 'bounce',
      bounce_type: 'permanent',
      recipients: [bouncedAddress],
      raw_message: {},
    })

    await sendClassifiedEmail('processSendWelcomeEmail', {
      to: bouncedAddress,
      subject: 'Welcome',
    })

    expect(ses.sendEmail).toHaveBeenCalled()
  })
})
