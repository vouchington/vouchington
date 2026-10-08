import { describe, expect, it } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { calcCostMicrounits } from '@modules/model-providers/pricing'
import { callCopyrightEmailIntakeModel } from './model.mts'

// Real Anthropic call (credentialed project `backend-anthropic`); fails without a credential.
describe('copyright email intake on Anthropic Haiku 5.5', () => {
  it('returns bounded advisory extraction that passes the output checks', async () => {
    const result = await callCopyrightEmailIntakeModel(
      JSON.stringify({
        senderEmail: 'claimant@example.test',
        senderName: 'Claimant',
        subject: 'Copyright complaint',
        bodyText:
          'My photograph is hosted at https://voucha.ai/posts/example without my permission.',
        attachments: [],
      }),
      'anthropic-test-intake',
      ANTHROPIC_HAIKU_CALL,
    )

    expect(['invalid_or_spam', 'requires_information', 'potentially_valid']).toContain(
      result.output.recommendation,
    )
    expect(
      calcCostMicrounits('anthropic', result.model, result.serviceTier, result.usage),
    ).not.toBeNull()
  })
})
