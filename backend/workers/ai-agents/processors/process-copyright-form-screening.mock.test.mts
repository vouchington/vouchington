import type { Job } from 'glide-mq'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CopyrightFormScreeningJobData } from '@queues/ai-agents/types'
import * as openaiProvider from '@modules/openai-utils/create-response'
import { getCopyrightNoticePrivateAggregate } from '@services/copyright-notices'
import { countCopyrightActiveRestrictionsForNotice } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { readTestCopyrightStaffScreening } from '@voucha/test-helpers/data-stores/psql/copyright-screening-executions'
import { enableAutomaticProvisionalWithholdingForTest } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { testCopyrightFormGuidance } from '@voucha/test-helpers/services/copyright-notices/form-guidance'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { processCopyrightFormScreening } from './process-copyright-form-screening.mts'

vi.mock(import('@modules/openai-utils/create-response'), async importOriginal => ({
  ...(await importOriginal()),
  createOpenAIResponse: vi.fn<typeof openaiProvider.createOpenAIResponse>(),
}))

async function screenWithApprovalGuidance(recommendation: string) {
  const notice = await createSignedInCopyrightForm()
  const provider = vi.spyOn(openaiProvider, 'createOpenAIResponse').mockResolvedValue({
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
  await processCopyrightFormScreening({
    data: { submission_id: notice.intake.copyright_notice_submission_id },
  } as Job<CopyrightFormScreeningJobData>)
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

describe('copyright form screening guidance', () => {
  afterEach(() => vi.restoreAllMocks())

  it('creates no assessment or restriction from a clear screen while the switch is off', async () => {
    await expect(screenWithApprovalGuidance('not_obviously_invalid')).resolves.toEqual(guidanceOnly)
  })

  it('never lets approval guidance override an invalid screen while the switch is on', async () => {
    const restore = await enableAutomaticProvisionalWithholdingForTest()
    try {
      await expect(screenWithApprovalGuidance('invalid_or_spam')).resolves.toEqual(guidanceOnly)
    } finally {
      restore()
    }
  })
})
