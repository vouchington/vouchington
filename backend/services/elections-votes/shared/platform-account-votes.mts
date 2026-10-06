import type { TransactionQuery } from '@data-stores/psql/types'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN } from '@modules/on-error/error-codes'
import { isPlatformAccount } from '@services/users'
import type { BasicUser } from '@services/users/types'
import sql from 'sql-template-strings'
import type { ElectionVoteScore, EntityElectionConfig } from './types.mts'

export function createPlatformAccountVoteForbiddenError() {
  return createCodedError(
    403,
    'Official and automated accounts cannot create community trust signals.',
    OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
  )
}

/**
 * Writer-level rule for entities whose config sets `rejectsPlatformAccountVotes`: an official,
 * system or ai_agent account (non-null `account_type`) may only write clears (`score: null`).
 * Every other score, including a stored neutral `0`, is a trust signal and is rejected before
 * anything is written, even when it repeats the account's current score.
 *
 * Runs on the vote transaction's own handle, after the user lock, so the check and the insert
 * share one transaction. `account_type` comes from `view_embedded_users`, the single derivation.
 */
export async function assertPlatformAccountVotesAllowed(
  config: EntityElectionConfig,
  query: TransactionQuery,
  userId: string,
  votes: ReadonlyArray<{ score: ElectionVoteScore }>,
): Promise<void> {
  if (!config.rejectsPlatformAccountVotes || votes.every(vote => vote.score === null)) return
  const { rows } = await query<{ account_type: BasicUser['account_type'] }>(sql`
    /* readElectionVoterAccountType */
    SELECT account_type FROM view_embedded_users WHERE id = ${userId}::uuid
  `)
  if (isPlatformAccount(rows[0])) throw createPlatformAccountVoteForbiddenError()
}
