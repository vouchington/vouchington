import type { Job } from 'glide-mq'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CopyrightFormScreeningJobData } from '@queues/ai-agents/types'
import * as openaiProvider from '@modules/openai-utils/create-response'
import { countCopyrightActiveRestrictionsForNotice } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { readTestCopyrightStaffScreening } from '@voucha/test-helpers/data-stores/psql/copyright-screening-executions'
import {
  enableAutomaticProvisionalWithholdingForTest,
  useAutomaticProvisionalWithholding,
} from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { testCopyrightFormGuidance } from '@voucha/test-helpers/services/copyright-notices/form-guidance'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { readTestPendingCopyrightAgentDispatches } from '@voucha/test-helpers/services/copyright-notices/pending-agent-dispatches'
import {
  createClearScreenedForm,
  createSignedInCopyrightForm,
} from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { processCopyrightFormScreening } from './process-copyright-form-screening.mts'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

vi.mock(import('@modules/openai-utils/create-response'), async importOriginal => ({
  ...(await importOriginal()),
  createOpenAIResponse: vi.fn<typeof openaiProvider.createOpenAIResponse>(),
}))

const jobFor = (submissionId: string) =>
  ({ data: { submission_id: submissionId } }) as Job<CopyrightFormScreeningJobData>

function mockScreeningProvider(recommendation: string) {
  return vi.spyOn(openaiProvider, 'createOpenAIResponse').mockResolvedValue({
    id: `resp-${crypto.randomUUID()}`,
    output: [
      {
        type: 'message',
        status: 'completed',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({
              recommendation,
              rationale: 'Advisory screen.',
              guidance: { ...testCopyrightFormGuidance, suggested_action: 'approve_intake' },
            }),
          },
        ],
      },
    ],
  } as never)
}

async function screenWithApprovalGuidance(recommendation: string) {
  const notice = await createSignedInCopyrightForm()
  const provider = mockScreeningProvider(recommendation)
  await processCopyrightFormScreening(jobFor(notice.intake.copyright_notice_submission_id))
  const noticeId = notice.intake.copyright_notice_id
  return {
    providerCalls: provider.mock.calls.length,
    suggestedAction: (await readTestCopyrightStaffScreening(noticeId))?.guidance?.suggested_action,
    assessments: (await getCopyrightNoticePrivateAggregate(noticeId))?.assessments,
    activeRestrictions: await countCopyrightActiveRestrictionsForNotice(noticeId),
  }
}

const guidanceOnly = {
  providerCalls: 1,
  suggestedAction: 'approve_intake',
  assessments: [],
  activeRestrictions: 0,
}

describe('copyright form screening guidance while intake is switched on', () => {
  useCopyrightIntakeEnvironment()
  afterEach(() => vi.restoreAllMocks())

  it('creates no assessment or restriction from a clear screen while automatic withholding is off', async () => {
    await expect(screenWithApprovalGuidance('not_obviously_invalid')).resolves.toEqual(guidanceOnly)
  })

  it('never lets approval guidance override an invalid screen while automatic withholding is on', async () => {
    const restore = await enableAutomaticProvisionalWithholdingForTest()
    try {
      await expect(screenWithApprovalGuidance('invalid_or_spam')).resolves.toEqual(guidanceOnly)
    } finally {
      restore()
    }
  })

  it('applies a saved clear screen to its targets while automatic withholding is on', async () => {
    const restore = await enableAutomaticProvisionalWithholdingForTest()
    try {
      const { notice } = await createClearScreenedForm()
      await processCopyrightFormScreening(jobFor(notice.intake.copyright_notice_submission_id))
      await expect(
        countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
      ).resolves.toBe(1)
    } finally {
      restore()
    }
  })
})

describe('copyright form screening while intake is switched off', () => {
  useCopyrightIntakeEnvironment({ enabled: false })
  useAutomaticProvisionalWithholding()
  afterEach(() => vi.restoreAllMocks())

  it('does not call the model and leaves the form pending for the reconciler', async () => {
    const notice = await createSignedInCopyrightForm()
    const submissionId = notice.intake.copyright_notice_submission_id
    const provider = mockScreeningProvider('not_obviously_invalid')

    await expect(processCopyrightFormScreening(jobFor(submissionId))).resolves.toEqual({
      success: true,
    })

    expect(provider).not.toHaveBeenCalled()
    await expect(
      readTestCopyrightStaffScreening(notice.intake.copyright_notice_id),
    ).resolves.toMatchObject({ state: 'pending', recommendation: null })
    await expect(readTestPendingCopyrightAgentDispatches(submissionId)).resolves.toEqual([
      { kind: 'form-screening', submissionId },
    ])
  })

  it('does not apply a saved clear screen, which the reconciler applies on its own', async () => {
    const { notice } = await createClearScreenedForm()
    const submissionId = notice.intake.copyright_notice_submission_id
    const provider = mockScreeningProvider('not_obviously_invalid')

    await expect(processCopyrightFormScreening(jobFor(submissionId))).resolves.toEqual({
      success: true,
    })

    expect(provider).not.toHaveBeenCalled()
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(0)
    await expect(readTestPendingCopyrightAgentDispatches(submissionId)).resolves.toEqual([
      { kind: 'form-effect', submissionId },
    ])
  })
})
