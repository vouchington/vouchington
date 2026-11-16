import { randomUUID } from 'node:crypto'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { describe, expect, it } from 'vitest'
import {
  makeAgentModelCaller,
  TEST_MODEL_SELECTION,
} from '@voucha/test-helpers/agents/model-call-result'
import { createCopyrightEmailIntake, recordCopyrightEmailParse } from '@services/copyright-notices'
import { parseCopyrightEmailIntakeOutput } from './output.mts'
import { admitCopyrightEmailRecommendationRun } from '@services/copyright-notices/email-recommendation-runs'
import { appendCopyrightEmailIntakeRecommendation } from '@services/copyright-notices/email-recommendations'
import {
  COPYRIGHT_AI_RUN_TABLES,
  insertTestCopyrightAiRun,
  readTestCopyrightAiRun,
} from '@voucha/test-helpers/copyright-ai-run-fixtures'
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

    const runId = (await admitCopyrightEmailRecommendationRun(intake.id))!
    await expect(
      runCopyrightEmailIntakeAgent(intake.id, runId, TEST_MODEL_SELECTION, callModel),
    ).resolves.toBeUndefined()
    expect(callModel).toHaveBeenCalledOnce()
  })

  it('expires the run when the intake has no parsed content to read', async () => {
    const intake = await createUnparsedIntake()
    const runId = (await admitCopyrightEmailRecommendationRun(intake.id))!
    const callModel = makeAgentModelCaller(JSON.parse(validOutput()))
    await runCopyrightEmailIntakeAgent(intake.id, runId, TEST_MODEL_SELECTION, callModel)
    expect(callModel).not.toHaveBeenCalled()
    await expect(
      readTestCopyrightAiRun(COPYRIGHT_AI_RUN_TABLES.email, runId),
    ).resolves.toMatchObject({ status: 'expired', has_result: false })
  })

  it('completes a later run from the identical recommendation already stored', async () => {
    const intake = await createUnparsedIntake()
    const inputSha256 = Buffer.alloc(32, 9)
    const save = (runId: string) =>
      appendCopyrightEmailIntakeRecommendation({
        intakeId: intake.id,
        runId,
        inputSha256,
        promptVersion: 'copyright-email-intake-v3',
        model: 'test-model',
        structuredOutput: JSON.parse(validOutput()),
      })
    const first = (await admitCopyrightEmailRecommendationRun(intake.id))!
    await expect(save(first)).resolves.toBe(true)
    const second = randomUUID()
    await insertTestCopyrightAiRun(
      COPYRIGHT_AI_RUN_TABLES.email,
      'copyright_notice_email_intake_receipt_id',
      intake.id,
      second,
      false,
    )
    await expect(save(second)).resolves.toBe(false)
    await expect(
      readTestCopyrightAiRun(COPYRIGHT_AI_RUN_TABLES.email, second),
    ).resolves.toMatchObject({ status: 'succeeded', has_result: true })
  })
})

async function createUnparsedIntake() {
  const sesMessageId = `ses-agent-${randomUUID()}`
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt: new Date(),
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: Buffer.alloc(32, 5),
    rawMimeType: 'message/rfc822',
    rawByteSize: 12,
    sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
  })
  return intake
}

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
