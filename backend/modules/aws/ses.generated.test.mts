import { hasSESCredentials } from './credentials.mts'
import { sendEmail } from './index.mts'
import { it, expect, describe } from 'vitest'

describe('ses.generated', () => {
  /**
   * Non-gating smoke check of sendEmail against the live SES mailbox simulator.
   * The request we build, response parsing and the single-attempt policy are gated by recorded
   * responses in ses.replay.no-data.mock.test.mts.
   * See docs/development/tests.md#live-provider-smoke-checks.
   */

  it('sendEmail' /* no-mistakes: integration=aws */, async () => {
    if (!hasSESCredentials()) {
      throw new Error('SES credentials are required for this credentialed test.')
    }
    const result = await sendEmail({
      to: 'success@simulator.amazonses.com',
      subject: 'Test Email',
      text: 'This is a test email',
    })
    expect(result).toBeDefined()
  })
})
