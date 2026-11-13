import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { expect } from 'vitest'
import { recordRestrictionAppealReversalEvents } from '../services/copyright-notices/claimant-misuse-ledger.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'

/** Empty input does nothing; the real batch commits each owned source once and replay preserves every row. */
export async function assertOwnedMisuseBatch(noticeId: string, restrictionIds: string[]) {
  const recordedAt = new Date()
  const before = await readEffectiveReviewState(noticeId, [])
  await using first = await beginTransaction()
  await recordRestrictionAppealReversalEvents(first, { noticeId, restrictionIds: [], recordedAt })
  await first.commit()
  expect(await readEffectiveReviewState(noticeId, [])).toEqual(before)
  await using batch = await beginTransaction()
  await recordRestrictionAppealReversalEvents(batch, { noticeId, restrictionIds, recordedAt })
  await batch.commit()
  const after = await readEffectiveReviewState(noticeId, [])
  expect(after).toEqual({
    ...before,
    misuse: restrictionIds.toSorted().map(restriction => ({
      restriction,
      outcome: 'restriction_reversed_by_appeal',
    })),
  })
  const { rows: events } = await write<{
    id: string
    restriction: string
    submission: string | null
    assessment: string | null
    occurred: Date
    outcome: string
  }>(sql`/* readOwnedMisuseBatch */
    SELECT id, copyright_restriction_id AS restriction, copyright_notice_submission_id AS submission,
      copyright_notice_submission_assessment_identity_id AS assessment, occurred_at AS occurred, outcome
    FROM copyright_claimant_misuse_events WHERE copyright_notice_id = ${noticeId}
    ORDER BY copyright_restriction_id`)
  expect(events).toEqual(
    restrictionIds.toSorted().map(restriction => ({
      id: expect.any(String),
      restriction,
      submission: null,
      assessment: null,
      occurred: recordedAt,
      outcome: 'restriction_reversed_by_appeal',
    })),
  )
  await using replay = await beginTransaction()
  await recordRestrictionAppealReversalEvents(replay, {
    noticeId,
    restrictionIds,
    recordedAt: new Date(),
  })
  await replay.commit()
  expect(await readEffectiveReviewState(noticeId, [])).toEqual(after)
  const { rows: replayEvents } = await write(sql`/* readOwnedMisuseBatch:replay */
    SELECT id, copyright_restriction_id AS restriction, copyright_notice_submission_id AS submission,
      copyright_notice_submission_assessment_identity_id AS assessment, occurred_at AS occurred, outcome
    FROM copyright_claimant_misuse_events WHERE copyright_notice_id = ${noticeId}
    ORDER BY copyright_restriction_id`)
  expect(replayEvents).toEqual(events)
}
