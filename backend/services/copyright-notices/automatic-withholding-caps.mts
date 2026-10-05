import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AutomaticWithholdingRefusalReason } from './automatic-withholding-gates.mts'
import type { AutomaticWithholdingThresholds } from './config.mts'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Rolling-24-hour caps on automatic withholding, counted over the automated clear-screen
 * assessments already recorded. Counting assessments rather than restrictions keeps the cap exact
 * when enforcement lags: the caller records its own assessment in this transaction, under the
 * claimant and poster locks taken here, so two concurrent notices cannot both pass at one slot
 * below the cap. A cap of zero refuses everything.
 */
export async function checkAutomaticWithholdingCaps(
  transaction: TransactionQuery,
  input: {
    noticeId: string
    claimantId: string
    thresholds: Pick<AutomaticWithholdingThresholds, 'claimantDailyCap' | 'posterDailyCap'>
    now?: Date
  },
): Promise<AutomaticWithholdingRefusalReason | null> {
  const windowStart = new Date((input.now ?? new Date()).getTime() - DAY_MS)
  const { rows: posterRows } = await transaction<{ user_id: string }>(sql`
    /* checkAutomaticWithholdingCaps:posters */
    SELECT DISTINCT post.created_by_id AS user_id
    FROM copyright_notice_targets target
    JOIN image_placements image_placement ON image_placement.placement_id = target.placement_id
    JOIN posts post ON post.id = image_placement.post_id
    WHERE target.copyright_notice_id = ${input.noticeId}
    ORDER BY post.created_by_id
  `)
  const posterIds = posterRows.map(row => row.user_id)
  // Claimant first, then posters in ID order, so concurrent notices always lock in one order.
  for (const key of [`claimant:${input.claimantId}`, ...posterIds.map(id => `poster:${id}`)]) {
    // oxlint-disable-next-line no-await-in-loop -- locks must be taken one at a time, in order, to rule out deadlock.
    await transaction(sql`/* checkAutomaticWithholdingCaps:lock */
      SELECT pg_advisory_xact_lock(hashtextextended(${`copyright-automatic-withholding:${key}`}, 0))
    `)
  }
  const { rows: claimantRows } = await transaction<{ total: number }>(sql`
    /* checkAutomaticWithholdingCaps:claimant */
    SELECT count(DISTINCT assessment.id)::int AS total
    FROM copyright_notices notice
    JOIN copyright_notice_submissions submission ON submission.copyright_notice_id = notice.id
    JOIN copyright_notice_submission_assessments assessment
      ON assessment.copyright_notice_submission_id = submission.id
    WHERE notice.claimant_user_id = ${input.claimantId}
      AND submission.kind = 'notice'
      AND assessment.assessed_by_id IS NULL
      AND assessment.copyright_notice_form_screening_id IS NOT NULL
      AND assessment.is_substantially_compliant
      AND assessment.assessed_at > ${windowStart}
  `)
  if ((claimantRows[0]?.total ?? 0) >= input.thresholds.claimantDailyCap) {
    return 'claimant_daily_cap'
  }
  if (posterIds.length === 0) return null
  // A poster with no assessments yet forms no group below, so a zero cap needs its own refusal.
  if (input.thresholds.posterDailyCap === 0) return 'poster_daily_cap'
  const { rows: overCap } = await transaction<{ user_id: string }>(sql`
    /* checkAutomaticWithholdingCaps:poster */
    SELECT post.created_by_id AS user_id
    FROM posts post
    JOIN image_placements image_placement ON image_placement.post_id = post.id
    JOIN copyright_notice_targets target ON target.placement_id = image_placement.placement_id
    JOIN copyright_notice_submissions submission
      ON submission.copyright_notice_id = target.copyright_notice_id
    JOIN copyright_notice_submission_assessments assessment
      ON assessment.copyright_notice_submission_id = submission.id
    WHERE post.created_by_id = ANY(${posterIds}::uuid[])
      AND submission.kind = 'notice'
      AND assessment.assessed_by_id IS NULL
      AND assessment.copyright_notice_form_screening_id IS NOT NULL
      AND assessment.is_substantially_compliant
      AND assessment.assessed_at > ${windowStart}
    GROUP BY post.created_by_id
    HAVING count(DISTINCT assessment.id) >= ${input.thresholds.posterDailyCap}
    LIMIT 1
  `)
  return overCap.length > 0 ? 'poster_daily_cap' : null
}
