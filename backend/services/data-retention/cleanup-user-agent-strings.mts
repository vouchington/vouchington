import { assertWhitelistedSqlIdentifier, beginTransaction } from '@data-stores/psql'
import { VOTE_TABLE_IDENTIFIERS } from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { voteTables } from './vote-ballot-tables.mts'

const DAY_MS = 24 * 60 * 60 * 1_000

// A string is orphaned only when no session and no ballot of any table references it. Each ballot
// table has a partial user_agent_string_id index, so every probe is an index lookup.
const BALLOT_REFERENCE_PREDICATES = voteTables
  .map(({ table }) => {
    const voteTable = assertWhitelistedSqlIdentifier(table, VOTE_TABLE_IDENTIFIERS, 'voteTable')
    return `AND NOT EXISTS (
         -- no-mistakes-disable-next-line postgres-required-predicates: a ballot in any entity partition keeps this user agent referenced; user_agent_string_id has an index
         SELECT 1 FROM ${voteTable} ballot WHERE ballot.user_agent_string_id = ua.id LIMIT 1
       )`
  })
  .join('\n       ')

export type UserAgentStringCleanupPage = {
  scanned: number
  deleted: number
  hasMore: boolean
}

/** Consumes indexed orphan candidates; releasing a session or ballot requeues rows that were once referenced. */
export async function cleanupOrphanedUserAgentStrings(
  batchSize: number,
  userAgentStringIds?: readonly string[],
  now = new Date(),
): Promise<UserAgentStringCleanupPage> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 5_000) {
    throw new RangeError('User-agent cleanup batch size must be between 1 and 5000')
  }
  if (userAgentStringIds && userAgentStringIds.length > batchSize) {
    throw new RangeError('Scoped user-agent rows must fit one page')
  }
  const cutoffId = getMinUUIDv7ForDate(new Date(now.getTime() - DAY_MS))
  await using query = await beginTransaction()
  const { rows: candidates } = await query<{ id: string }>(
    `/* listUserAgentStringCleanupCandidates */
     SELECT user_agent_string_id AS id FROM user_agent_string_cleanup_candidates
     WHERE user_agent_string_id < $1::uuid
       AND ($2::uuid[] IS NULL OR user_agent_string_id = ANY($2::uuid[]))
     ORDER BY user_agent_string_id LIMIT $3 FOR UPDATE SKIP LOCKED`,
    [cutoffId, userAgentStringIds ?? null, batchSize + 1],
  )
  const page = candidates.slice(0, batchSize)
  const { rows: locked } = await query<{ id: string }>(
    `/* lockUserAgentStringCleanupCandidates */
     SELECT id FROM user_agent_strings WHERE id = ANY($1::uuid[])
     ORDER BY id FOR UPDATE SKIP LOCKED`,
    [page.map(row => row.id)],
  )
  const lockedIds = locked.map(row => row.id)
  const { rowCount } = await query(
    `/* deleteOrphanedUserAgentStrings */
     DELETE FROM user_agent_strings ua
     WHERE ua.id = ANY($1::uuid[])
       AND NOT EXISTS (
         -- no-mistakes-disable-next-line postgres-required-predicates: any surviving session in any ID partition keeps this user agent referenced; user_agent_string_id has an index
         SELECT 1 FROM user_sessions session
         WHERE session.user_agent_string_id = ua.id LIMIT 1
       )
       ${BALLOT_REFERENCE_PREDICATES}`,
    [lockedIds],
  )
  await query(
    `/* consumeUserAgentStringCleanupCandidates */
     DELETE FROM user_agent_string_cleanup_candidates
     WHERE user_agent_string_id = ANY($1::uuid[])`,
    [lockedIds],
  )
  const hasMore = candidates.length > batchSize && lockedIds.length > 0
  await query.commit()
  return { scanned: page.length, deleted: rowCount ?? 0, hasMore }
}
