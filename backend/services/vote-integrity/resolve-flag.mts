import { recordModeratorAction } from '@services/moderator-actions'
import { runWithTransaction, type TransactionQuery } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import type { VoteIntegrityFlag } from './create-flag.mts'
import type { VoteIntegrityResolution } from '@ts-shared/utils/moderation-catalogs'
import { VOTE_INTEGRITY_FLAG_PROJECTION_WITH_HOSTNAME } from './flag-projection.mts'
import { attachVoteFlagEntityLabels } from './flag-entity-labels.mts'

export async function resolveVoteIntegrityFlag(
  flagId: string,
  resolvedById: string,
  resolution: VoteIntegrityResolution,
  options: { query?: TransactionQuery } = {},
): Promise<
  VoteIntegrityFlag & {
    hostname: string | null
    entity_label: string
    resolver_username: string | null
    resolver_display_name: string | null
  }
> {
  return runWithTransaction(options.query, async (transaction: TransactionQuery) => {
    const query = sql`/* resolveVoteIntegrityFlag */
    UPDATE vote_integrity_flags
    SET
      resolved_at = CURRENT_TIMESTAMP,
      resolved_by_id = ${resolvedById},
      resolution = ${resolution}
    WHERE id = ${flagId}
      AND resolved_at IS NULL
    RETURNING `
    query.append(VOTE_INTEGRITY_FLAG_PROJECTION_WITH_HOSTNAME)
    const { rows } = await transaction(query)

    const flag = rows[0] as (VoteIntegrityFlag & { hostname: string | null }) | undefined
    if (!flag) throw createHttpError(404, 'Flag not found or already resolved')
    await recordModeratorAction(
      resolvedById,
      {
        actionType: 'vote_integrity_flag_review',
        voteIntegrityFlagId: flagId,
        metadata: { before: { resolution: null }, after: { resolution } },
      },
      { query: transaction },
    )
    const [labelledFlag] = await attachVoteFlagEntityLabels([flag], transaction)
    return labelledFlag!
  })
}
