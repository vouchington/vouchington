import { hasSESCredentials } from './credentials.mts'
import { sendEmail } from './index.mts'
import { it, expect, describe } from 'vitest'

describe('ses.generated', () => {
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
