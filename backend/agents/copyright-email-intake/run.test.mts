import { describe, expect, it } from 'vitest'
import { parseCopyrightEmailIntakeOutput } from './run.mts'

describe('copyright email intake output', () => {
  it('accepts a bounded advisory extraction', () => {
    expect(
      parseCopyrightEmailIntakeOutput(
        JSON.stringify({
          recommendation: 'potentially_valid',
          submission_kind: 'notice',
          claimant_name: 'Claimant',
          claimant_contact: 'claimant@example.test',
          work_description: 'A photograph',
          good_faith_belief: true,
          accuracy_authority_under_penalty_of_perjury: true,
          electronic_signature: 'Claimant',
          target_urls: ['https://voucha.ai/posts/example'],
          source_evidence: [{ field: 'electronic_signature', excerpt: '/s/ Claimant' }],
          missing_information: [],
          moderator_reasoning: 'The required fields appear present.',
        }),
      ),
    ).toMatchObject({ recommendation: 'potentially_valid' })
  })

  it('rejects oversized or unbounded model output', () => {
    expect(() =>
      parseCopyrightEmailIntakeOutput(
        JSON.stringify({
          recommendation: 'potentially_valid',
          submission_kind: 'notice',
          claimant_name: null,
          claimant_contact: null,
          work_description: null,
          good_faith_belief: null,
          accuracy_authority_under_penalty_of_perjury: null,
          electronic_signature: null,
          target_urls: Array.from({ length: 21 }, () => 'https://voucha.ai/posts/example'),
          source_evidence: [],
          missing_information: [],
          moderator_reasoning: 'Review',
        }),
      ),
    ).toThrow('invalid response shape')
  })
})
