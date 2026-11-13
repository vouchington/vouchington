import { encodeCursor } from '@modules/pagination'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createCommittedCopyrightEmailCase } from '@voucha/test-helpers/copyright-committed-email-case'
import { copyrightEmailMessageId } from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { encodeUuidCursorBefore } from '@voucha/test-helpers/modules/pagination/uuid-cursors'
import {
  appendTestCopyrightNoticeSubmission,
  seedCopyrightSubmissionAssessment,
} from '@voucha/test-helpers/copyright-notice-submissions'
import { appendTestCopyrightAssessmentWhileRecoveryWaits } from '@voucha/test-helpers/copyright-recovery-concurrency'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  createDecisionRecoveryCohort,
  readDecisionRecoveryState,
  expectedDecisionRecoveryState,
  recoveredDecisionPage,
  decisionRecoveryOutcome,
  nativeDecisionRecoveryConflict,
  assertDecisionRecoveryClocks,
} from '@voucha/test-helpers/copyright-decision-recovery-fixtures'
import { recoverMissingDecisionAssessments } from './enforcement-recovery.mts'

describe('durable copyright decision recovery', () => {
  useCopyrightIntakeEnvironment()
  it('commits at most one owned page or leaves all authority and caller progress unchanged', async () => {
    const cohort = await createDecisionRecoveryCohort(6)
    const ids = cohort.submissionIds.slice(0, 5)
    const options = { ids, limit: 1, after: encodeUuidCursorBefore(ids[0]!) }
    const optionsBefore = structuredClone(options)
    const before = await readDecisionRecoveryState(cohort.noticeIds)
    const empty = await recoverMissingDecisionAssessments({ ...options, ids: [] })
    expect(empty).toEqual({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
    const [result] = await Promise.allSettled([recoverMissingDecisionAssessments(options)])
    const after = await readDecisionRecoveryState(cohort.noticeIds)
    expect([
      {
        outcome: recoveredDecisionPage(ids[0]!, true),
        state: expectedDecisionRecoveryState(before, after, [ids[0]!], cohort.moderator.id),
      },
      { outcome: nativeDecisionRecoveryConflict, state: before },
    ]).toContainEqual({ outcome: decisionRecoveryOutcome(result!), state: after })
    expect(options).toEqual(optionsBefore)
    assertDecisionRecoveryClocks(before, after)
  })

  it('resumes beyond committed assessments and never replays those decisions', async () => {
    const cohort = await createDecisionRecoveryCohort(5)
    for (const submissionId of cohort.submissionIds.slice(0, 2)) {
      await seedCopyrightSubmissionAssessment({
        submissionId,
        currentUser: cohort.moderator,
        assessedAt: new Date(),
        substantiallyCompliant: true,
      })
    }
    const options = {
      ids: cohort.submissionIds.slice(0, 4),
      limit: 1,
      after: encodeCursor({ id: cohort.submissionIds[1]! }),
    }
    const before = await readDecisionRecoveryState(cohort.noticeIds)
    const [result] = await Promise.allSettled([recoverMissingDecisionAssessments(options)])
    const after = await readDecisionRecoveryState(cohort.noticeIds)
    expect([
      {
        outcome: recoveredDecisionPage(cohort.submissionIds[2]!, true),
        state: expectedDecisionRecoveryState(
          before,
          after,
          [cohort.submissionIds[2]!],
          cohort.moderator.id,
        ),
      },
      { outcome: nativeDecisionRecoveryConflict, state: before },
    ]).toContainEqual({ outcome: decisionRecoveryOutcome(result!), state: after })
    const replay = await recoverMissingDecisionAssessments({
      ids: cohort.submissionIds.slice(0, 2),
      limit: 1,
    })
    expect(replay).toEqual({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
    expect(await readDecisionRecoveryState(cohort.noticeIds)).toEqual(after)
    assertDecisionRecoveryClocks(before, after)
  })

  it('binds both concurrent page results to the complete committed assessment set', async () => {
    const cohort = await createDecisionRecoveryCohort(3)
    const [first, second] = cohort.submissionIds
    const options = { ids: [first!, second!], limit: 1, after: encodeUuidCursorBefore(first!) }
    const before = await readDecisionRecoveryState(cohort.noticeIds)
    const results = await Promise.allSettled([
      recoverMissingDecisionAssessments(options),
      recoverMissingDecisionAssessments(options),
    ])
    const after = await readDecisionRecoveryState(cohort.noticeIds)
    const firstPage = recoveredDecisionPage(first!, true)
    const secondPage = recoveredDecisionPage(second!, false)
    const one = expectedDecisionRecoveryState(before, after, [first!], cohort.moderator.id)
    const both = expectedDecisionRecoveryState(
      before,
      after,
      [first!, second!],
      cohort.moderator.id,
    )
    expect([
      { outcomes: [firstPage, secondPage], state: both },
      { outcomes: [secondPage, firstPage], state: both },
      { outcomes: [firstPage, nativeDecisionRecoveryConflict], state: one },
      { outcomes: [nativeDecisionRecoveryConflict, firstPage], state: one },
      { outcomes: [nativeDecisionRecoveryConflict, nativeDecisionRecoveryConflict], state: before },
    ]).toContainEqual({ outcomes: results.map(decisionRecoveryOutcome), state: after })
    assertDecisionRecoveryClocks(before, after)
  })

  it('rolls back the entire recovery page when its owned second submission changes after the snapshot', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const { noticeId } = await createCommittedCopyrightEmailCase({
      moderator,
      messageId: copyrightEmailMessageId(),
    })
    const first = await appendTestCopyrightNoticeSubmission({
      noticeId,
      kind: 'notice',
      sourceKind: 'staff',
      submittedByUserId: null,
      receivedAt: new Date(),
      bodyCiphertext: 'First owned durable notice.',
    })
    const second = await appendTestCopyrightNoticeSubmission({
      noticeId,
      kind: 'notice',
      sourceKind: 'staff',
      submittedByUserId: null,
      receivedAt: new Date(),
      bodyCiphertext: 'Second owned durable notice.',
    })
    const options = { ids: [first.id, second.id], limit: 2 }
    const before = await readDecisionRecoveryState([noticeId])
    const [result] = await Promise.allSettled([
      appendTestCopyrightAssessmentWhileRecoveryWaits(
        {
          submissionId: second.id,
          currentUser: moderator,
          substantiallyCompliant: true,
          assessedAt: new Date(),
        },
        () => recoverMissingDecisionAssessments(options),
      ),
    ])
    const after = await readDecisionRecoveryState([noticeId])
    expect({ outcome: decisionRecoveryOutcome(result!), state: after }).toEqual({
      outcome: nativeDecisionRecoveryConflict,
      state: expectedDecisionRecoveryState(before, after, [second.id], moderator.id, null),
    })
    expect(options).toEqual({ ids: [first.id, second.id], limit: 2 })
    assertDecisionRecoveryClocks(before, after)
  })
})
