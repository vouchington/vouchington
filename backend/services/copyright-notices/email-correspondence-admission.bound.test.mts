import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createCopyrightNoticeForManualAssociation } from '@voucha/test-helpers/copyright-email-manual-association'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { admitCopyrightEmailWithConcurrentRecommendation } from '@voucha/test-helpers/copyright-email-admission-race'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { admitCopyrightEmailCorrespondence } from './email-correspondence-admission.mts'
import { linkCopyrightEmailIntakeToNotice } from './email-threading.mts'

describe('copyright correspondence lock order', () => {
  it('commits manual-fallback admission alongside a recommendation holding the notice lock', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const noticeId = await createCopyrightNoticeForManualAssociation(false)
    const intake = await createParsedCopyrightEmailIntake()
    expect(
      await linkCopyrightEmailIntakeToNotice({ intakeId: intake.id, noticeId, linkKind: 'thread' }),
    ).toBe(true)
    const input = {
      currentUser: moderator,
      intakeId: intake.id,
      kind: 'supplement' as const,
      targetIds: [],
      structuredSubmission: { summary: 'A supplemental filing reviewed by staff.' },
      rationale: 'The filing was verified against the source email.',
      recommendationId: null,
      manualFallbackReason: 'The agent recommendation is still running.',
    }
    const result = await admitCopyrightEmailWithConcurrentRecommendation(noticeId, input)
    expect(result.recommendationStored).toBe(true)
    expect(result.admission).toMatchObject({ noticeId, isDuplicate: false })
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(
      aggregate?.submissions.some(submission => submission.id === result.admission.submissionId),
    ).toBe(true)
    await expect(admitCopyrightEmailCorrespondence(input)).resolves.toEqual({
      ...result.admission,
      isDuplicate: true,
    })
  })
})
