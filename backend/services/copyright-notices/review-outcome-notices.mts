import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { createCopyrightPosterNoticesInTransaction } from './restriction-poster-notices.mts'
import { createCopyrightClaimantDecisionNoticeInTransaction } from './claimant-decision-notices.mts'

export async function createCopyrightReviewOutcomeNoticesInTransaction(
  input: {
    noticeId: string
    restrictionId: string
    action: 'confirm' | 'reverse'
  },
  transaction: TransactionQuery,
): Promise<void> {
  const { rows } = await transaction<{
    copyright_notice_target_id: string
  }>(sql`/* createCopyrightReviewOutcomeNoticesInTransaction:target */
    SELECT restriction.copyright_notice_target_id FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE restriction.id = ${input.restrictionId} AND target.copyright_notice_id = ${input.noticeId}
  `)
  assert(rows[0], 404, 'Copyright restriction not found')
  const event = input.action === 'confirm' ? 'confirmed' : 'reversed'
  await createCopyrightPosterNoticesInTransaction(
    { ...input, targetId: rows[0].copyright_notice_target_id, event },
    transaction,
  )
  await createCopyrightClaimantDecisionNoticeInTransaction({ ...input, event }, transaction)
}
