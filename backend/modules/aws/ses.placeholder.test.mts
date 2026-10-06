import { setupCredentialEnv } from '@voucha/test-helpers/modules/aws/credentials-fixtures'
import { describe, expect, it } from 'vitest'
import { hasSESCredentials } from './credentials.mts'
import { sendEmail } from './ses.mts'

describe('sendEmail vitest placeholder', () => {
  setupCredentialEnv()

  it('returns the placeholder message when SES credentials are absent', async () => {
    expect(hasSESCredentials()).toBe(false)

    const result = await sendEmail({
      to: 'success@simulator.amazonses.com',
      subject: 'Placeholder',
      text: 'Unit test',
    })

    expect(result.MessageId).toBe('vitest-placeholder')
  })
})
