import { describe, expect, it } from 'vitest'
import { appendCopyrightEmailAfterConcurrentLink } from '@voucha/test-helpers/copyright-email-link-race'
import {
  createCopyrightNoticeForManualAssociation,
  markTestCopyrightNoticeErasedAndCommit,
} from '@voucha/test-helpers/copyright-email-manual-association'
import { createUnparsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { readCopyrightRetentionColumns } from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { testCopyrightFormGuidance } from '@voucha/test-helpers/services/copyright-notices/form-guidance'
import {
  claimCopyrightFormScreening,
  completeCopyrightFormScreening,
} from './form-screening-executions.mts'

describe('retention fences for agent results', () => {
  it.each([false, true])('rechecks a newly discovered email link with erased=%s', async erased => {
    const noticeId = await createCopyrightNoticeForManualAssociation(false)
    const intake = await createUnparsedCopyrightEmailIntake()
    await expect(
      appendCopyrightEmailAfterConcurrentLink(
        {
          intakeId: intake.id,
          inputSha256: Buffer.alloc(32, 7),
          promptVersion: 'test-link-race-v1',
          model: 'test-model',
          structuredOutput: { summary: 'Output produced before the thread was discovered.' },
        },
        noticeId,
        erased,
      ),
    ).resolves.toBe(!erased)
    const retained = await readCopyrightRetentionColumns(noticeId)
    expect(retained.copyright_notice_email_intake_recommendations).toHaveLength(erased ? 0 : 1)
  })

  it('suppresses an in-flight form screening after its case receives an erasure marker', async () => {
    const notice = await createSignedInCopyrightForm()
    const attempt = await claimCopyrightFormScreening(notice.intake.id)
    expect(attempt).not.toBeNull()
    if (!attempt) throw new Error('Expected owned pending screening claim')
    await markTestCopyrightNoticeErasedAndCommit(notice.intake.copyright_notice_id)

    await expect(
      completeCopyrightFormScreening(attempt, {
        intakeId: notice.intake.id,
        inputSha256: Buffer.alloc(32, 9),
        promptVersion: 'test-erased-form-v1',
        model: 'test-model',
        recommendation: 'not_obviously_invalid',
        rationale: 'Late result containing private claimant information.',
        guidance: testCopyrightFormGuidance,
      }),
    ).resolves.toBeNull()
    const retained = await readCopyrightRetentionColumns(notice.intake.copyright_notice_id)
    expect(retained.copyright_notice_form_screenings).toEqual([])
  })
})
