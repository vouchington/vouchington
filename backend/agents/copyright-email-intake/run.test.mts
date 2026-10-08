import { randomUUID } from 'node:crypto'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { describe, expect, it } from 'vitest'
import {
  makeAgentModelCaller,
  TEST_MODEL_SELECTION,
} from '@voucha/test-helpers/agents/model-call-result'
import { createCopyrightEmailIntake, recordCopyrightEmailParse } from '@services/copyright-notices'
import { parseCopyrightEmailIntakeOutput } from './output.mts'
import { runCopyrightEmailIntakeAgent } from './run.mts'

const parseText = (text: string) => parseCopyrightEmailIntakeOutput(JSON.parse(text))

describe('copyright email intake output', () => {
  it('accepts a bounded advisory extraction', () => {
    expect(
      parseText(
        JSON.stringify({
          recommendation: 'potentially_valid',
          submission_kind: 'notice',
          submission_summary: 'A claimant alleges an unauthorized hosted photograph.',
          appeal_reason: null,
          counter_notice_name: null,
          counter_notice_address: null,
          counter_notice_telephone: null,
          consent_to_federal_jurisdiction: null,
          consent_to_service_of_process: null,
          good_faith_misidentification_under_penalty_of_perjury: null,
          counter_notice_electronic_signature: null,
          claimant_name: 'Claimant',
          claimant_contact: 'claimant@example.test',
          claimant_email: 'claimant@example.test',
          work_description: 'A photograph',
          has_good_faith_belief: true,
          has_accuracy_authority_under_penalty_of_perjury: true,
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
      parseText(
        JSON.stringify({
          recommendation: 'potentially_valid',
          submission_kind: 'notice',
          submission_summary: null,
          appeal_reason: null,
          counter_notice_name: null,
          counter_notice_address: null,
          counter_notice_telephone: null,
          consent_to_federal_jurisdiction: null,
          consent_to_service_of_process: null,
          good_faith_misidentification_under_penalty_of_perjury: null,
          counter_notice_electronic_signature: null,
          claimant_name: null,
          claimant_contact: null,
          claimant_email: null,
          work_description: null,
          has_good_faith_belief: null,
          has_accuracy_authority_under_penalty_of_perjury: null,
          electronic_signature: null,
          target_urls: Array.from({ length: 21 }, () => 'https://voucha.ai/posts/example'),
          source_evidence: [],
          missing_information: [],
          moderator_reasoning: 'Review',
        }),
      ),
    ).toThrow('invalid response shape')
  })

  it('stores the model extraction for a persisted inbound email', async () => {
    const sesMessageId = `ses-agent-${randomUUID()}`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 4),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    await recordCopyrightEmailParse(intake, {
      status: 'succeeded',
      fromEmail: `claimant-${randomUUID()}@example.test`,
      subject: 'Copyright complaint',
      bodyText: 'A copyright complaint.',
      messageId: `<${randomUUID()}@example.test>`,
      replyReferences: [],
      attachments: [],
    })
    const callModel = makeAgentModelCaller(JSON.parse(validOutput()))

    await expect(
      runCopyrightEmailIntakeAgent(intake.id, TEST_MODEL_SELECTION, callModel),
    ).resolves.toBeUndefined()
    expect(callModel).toHaveBeenCalledOnce()
  })
})

function validOutput(): string {
  return JSON.stringify({
    recommendation: 'potentially_valid',
    submission_kind: 'notice',
    submission_summary: 'A claimant alleges an unauthorized hosted photograph.',
    appeal_reason: null,
    counter_notice_name: null,
    counter_notice_address: null,
    counter_notice_telephone: null,
    consent_to_federal_jurisdiction: null,
    consent_to_service_of_process: null,
    good_faith_misidentification_under_penalty_of_perjury: null,
    counter_notice_electronic_signature: null,
    claimant_name: 'Claimant',
    claimant_contact: 'claimant@example.test',
    claimant_email: 'claimant@example.test',
    work_description: 'A photograph',
    has_good_faith_belief: true,
    has_accuracy_authority_under_penalty_of_perjury: true,
    electronic_signature: 'Claimant',
    target_urls: ['https://voucha.ai/posts/example'],
    source_evidence: [{ field: 'electronic_signature', excerpt: '/s/ Claimant' }],
    missing_information: [],
    moderator_reasoning: 'The required fields appear present.',
  })
}
