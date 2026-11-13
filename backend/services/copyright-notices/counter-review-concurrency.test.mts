import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createCopyrightNoticeForManualAssociation } from '@voucha/test-helpers/copyright-email-manual-association'
import {
  seedCopyrightSubmissionAssessment,
  appendTestCopyrightNoticeSubmission,
} from '@voucha/test-helpers/copyright-notice-submissions'
import { interleaveCopyrightOwnedRead } from '@voucha/test-helpers/copyright-owned-read-interleave'
import {
  copyrightRaceResult,
  readCopyrightAssessmentRaceState,
} from '@voucha/test-helpers/copyright-assessment-race-outcomes'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { reviewCopyrightCounterNotice } from './counter-notice-reviews.mts'

describe('normal assessment and counter-notice review concurrency', () => {
  it('keeps the committed assessment and rolls back a stale counter-review snapshot', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const noticeId = await createCopyrightNoticeForManualAssociation()
    const submission = await appendTestCopyrightNoticeSubmission({
      noticeId,
      kind: 'counter_notice',
      sourceKind: 'staff',
      submittedByUserId: null,
      receivedAt: new Date(),
      bodyCiphertext: 'Owned counter-notice.',
    })
    const before = await readCopyrightAssessmentRaceState(noticeId)
    const race = await interleaveCopyrightOwnedRead({
      ownedId: submission.id,
      marker: 'reviewCopyrightCounterNotice:notice',
      first: () =>
        reviewCopyrightCounterNotice({
          currentUser: moderator,
          submissionId: submission.id,
          is_accepted: false,
          rationale: 'Missing statutory declarations.',
        }),
      second: () =>
        seedCopyrightSubmissionAssessment({
          submissionId: submission.id,
          currentUser: moderator,
          substantiallyCompliant: false,
          assessedAt: new Date(),
        }),
    })
    expect(race.observerErrors).toEqual([])
    expect(race.second.status).toBe('fulfilled')
    const assessmentId = race.second.status === 'fulfilled' ? race.second.value.id : undefined
    expect([
      {
        review: {
          status: 'rejected',
          statusCode: 409,
          code: 'CONFLICT',
          message: 'Conflicting copyright case change',
          causeCode: '40001',
        },
        state: {
          ...before,
          assessments: [{ id: assessmentId, supersedes: null, compliant: false }],
          identities: [assessmentId],
          pointers: [{ id: submission.id, assessment: assessmentId, compliant: false }],
          events: [...before.events, 'submission_assessed'].toSorted(),
        },
      },
    ]).toContainEqual({
      review: copyrightRaceResult(race.first),
      state: await readCopyrightAssessmentRaceState(noticeId),
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(aggregate?.counterNoticeReviews).toEqual([])
    expect(aggregate?.deadlines).toEqual([])
  })
})
