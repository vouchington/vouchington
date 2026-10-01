import { hasSESCredentials } from './credentials.mts'
import { sendEmail } from './index.mts'
import { it, expect, describe } from 'vitest'

describe('ses.generated', () => {
  // SES credentials are unavailable on untrusted CI forks and local runs by default.
  // Skips on AccessDeniedException during IAM bootstrapping (role has creds but not
  // yet ses:SendEmail — granted in iam-github-oidc-test.tf, applied post-merge).
  it('sendEmail' /* no-mistakes: integration=aws */, async context => {
    if (!hasSESCredentials()) {
      context.skip()
      return
    }
    try {
      const result = await sendEmail({
        to: 'success@simulator.amazonses.com',
        subject: 'Test Email',
        text: 'This is a test email',
      })
      expect(result).toBeDefined()
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === 'AccessDenied' ||
          err.name === 'AccessDeniedException' ||
          err.name === 'CredentialsProviderError')
      ) {
        context.skip()
        return
      }
      throw err
    }
  })
})
