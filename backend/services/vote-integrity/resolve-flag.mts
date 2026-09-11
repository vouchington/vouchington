import { write } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import type { VoteIntegrityFlag } from './create-flag.mts'
import type { VoteIntegrityResolution } from '@ts-shared/utils/moderation-catalogs'
import { VOTE_INTEGRITY_FLAG_PROJECTION } from './flag-projection.mts'

export async function resolveVoteIntegrityFlag(
  flagId: string,
  resolvedById: string,
  resolution: VoteIntegrityResolution,
): Promise<VoteIntegrityFlag> {
  const query = sql`/* resolveVoteIntegrityFlag */
    UPDATE vote_integrity_flags
    SET
      resolved_at = CURRENT_TIMESTAMP,
      resolved_by_id = ${resolvedById},
      resolution = ${resolution}
    WHERE id = ${flagId}
      AND resolved_at IS NULL
    RETURNING `
  query.append(VOTE_INTEGRITY_FLAG_PROJECTION)
  const { rows } = await write(query)

  const flag = rows[0] as VoteIntegrityFlag | undefined
  if (!flag) throw createHttpError(404, 'Flag not found or already resolved')
  return flag
}
