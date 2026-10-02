import { read, write } from '@data-stores/psql'
import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { ElectionVote, EntityElectionConfig } from './types.mts'
import { fetchElectionVoteRowsByEntityId, fetchElectionVoteRowsByUser } from './vote-queries.mts'
import { toElectionVoteChoice } from './vote-route-utils.mts'

/**
 * Gets the current (latest) vote per entity for a user. Unbounded — relied on by batch vote
 * lookups across the codebase (e.g. rendering vote state for a page of posts). Not paginated;
 * see getElectionVotesByUserForEntity for the paginated single-entity vote-history read path.
 *
 * @param config - Entity election configuration
 * @param userId - User ID to get votes for
 * @param entityIds - Optional array of entity IDs to filter by
 * @returns Array of current election votes
 */
export async function getElectionVotesByUser(
  config: EntityElectionConfig,
  userId: string,
  entityIds?: string[],
): Promise<ElectionVote[]> {
  const rows = await fetchElectionVoteRowsByUser(config, userId, entityIds, read)
  return mapCurrentVotes(config, rows)
}

/**
 * Gets a single current vote by user and entity ID.
 *
 * @param config - Entity election configuration
 * @param userId - User ID
 * @param entityId - Entity ID
 * @returns Current election vote or null if not found
 */
export async function getElectionVoteByUser(
  config: EntityElectionConfig,
  userId: string,
  entityId: string,
): Promise<ElectionVote | null> {
  // Mutation handlers use this lookup to suppress same-choice and already-cleared no-ops before
  // contribution quota is consumed. Read the primary so replica lag cannot turn an idempotent
  // retry into quota usage; list/read projections remain replica-backed above.
  const rows = await fetchElectionVoteRowsByUser(config, userId, [entityId], write)
  const votes = mapCurrentVotes(config, rows)
  return votes[0] ?? null
}

export function electionVotesByUserForEntityCursorScope(
  config: EntityElectionConfig,
  userId: string,
  entityId: string,
): string {
  return `${config.entityType}:votes-by-user:${userId}:${entityId}`
}

/**
 * Paginated current-vote read for a single (user, entity) pair — the non-admin branch of the
 * public vote-history endpoints. Structurally bounded to at most one row (DISTINCT ON entity_id
 * with entityIds=[entityId]), but still goes through real cursor mechanics for scope-replay
 * protection and endpoint consistency with the admin branch below.
 */
export async function getElectionVotesByUserForEntity(
  config: EntityElectionConfig,
  userId: string,
  entityId: string,
  pagination: { limit: number; after?: string },
): Promise<{ results: ElectionVote[]; page_info: PageInfo }> {
  const scope = electionVotesByUserForEntityCursorScope(config, userId, entityId)
  const afterEntityId = pagination.after
    ? decodeScopedUuidCursor(pagination.after, scope, 'Invalid vote cursor').id
    : undefined
  const rows = await fetchElectionVoteRowsByUser(config, userId, [entityId], read, {
    limit: pagination.limit + 1,
    afterEntityId,
  })
  const hasNextPage = rows.length > pagination.limit
  const pageRows = rows.slice(0, pagination.limit)
  const page_info = buildPageInfo(pageRows, {
    hasNextPage,
    getCursor: row => ({ id: readPublicVoteString(row, 'entity_id'), scope }),
  })
  return { results: mapCurrentVotes(config, pageRows), page_info }
}

export function electionVotesByElectionIdCursorScope(
  config: EntityElectionConfig,
  entityId: string,
): string {
  return `${config.entityType}:votes-by-election:${entityId}`
}

/**
 * Paginated current-vote read for every voter on an entity — the admin branch of the public
 * vote-history endpoints. page_info/cursors are derived from the raw rows fetched here, before
 * mapCurrentVotes() below can drop rows (toElectionVoteChoice returns null for legacy/cleared
 * ballots) — otherwise a page where every row is dropped would report a null cursor with
 * has_next_page still true.
 */
export async function getElectionVotesByEntityId(
  config: EntityElectionConfig,
  entityId: string,
  pagination: { limit: number; after?: string },
): Promise<{ results: ElectionVote[]; page_info: PageInfo }> {
  const scope = electionVotesByElectionIdCursorScope(config, entityId)
  const afterUserId = pagination.after
    ? decodeScopedUuidCursor(pagination.after, scope, 'Invalid vote cursor').id
    : undefined
  const rows = await fetchElectionVoteRowsByEntityId(config, entityId, {
    limit: pagination.limit + 1,
    afterUserId,
  })
  const hasNextPage = rows.length > pagination.limit
  const pageRows = rows.slice(0, pagination.limit)
  const page_info = buildPageInfo(pageRows, {
    hasNextPage,
    getCursor: row => ({ id: readPublicVoteString(row, 'user_id'), scope }),
  })
  return { results: mapCurrentVotes(config, pageRows), page_info }
}

export function mapCurrentVotes(
  config: EntityElectionConfig,
  rows: Record<string, unknown>[],
): ElectionVote[] {
  return rows.flatMap(row => {
    const policy = resolveVotePolicy(config, row)
    const score = readElectionVoteScore(row.score)
    const choice = toElectionVoteChoice(
      policy,
      config.tracksNeutralScore && score === 0 && row.score_is_neutral !== true ? null : score,
      config.tracksSemanticScore && row.score_is_semantic === true,
    )
    if (choice === null) return []
    return [
      {
        __entity_type: 'election_vote',
        entity_id: readPublicVoteString(row, 'entity_id'),
        user_id: readPublicVoteString(row, 'user_id'),
        choice,
        created_at: readPublicVoteDate(row),
      },
    ]
  })
}

function readElectionVoteScore(value: unknown): -2 | -1 | 0 | 1 | 2 | null {
  if (value === null || value === -2 || value === -1 || value === 0 || value === 1 || value === 2)
    return value
  throw new Error('Election vote query returned an invalid score')
}

function readPublicVoteString(
  row: Record<string, unknown>,
  field: 'entity_id' | 'user_id',
): string {
  const value = row[field]
  if (typeof value === 'string') return value
  throw new Error(`Election vote query returned an invalid ${field}`)
}

function readPublicVoteDate(row: Record<string, unknown>): Date {
  const value = row.created_at
  if (value instanceof Date) return value
  throw new Error('Election vote query returned an invalid created_at')
}

function resolveVotePolicy(
  config: EntityElectionConfig,
  row: Record<string, unknown>,
): NonNullable<EntityElectionConfig['votePolicy']> {
  const policy =
    config.votePolicyByEntityField && typeof row.vote_policy_entity_field === 'string'
      ? config.votePolicyByEntityField.policies[row.vote_policy_entity_field]
      : undefined
  const fallback = config.votePolicy
  if (!policy && !fallback) throw new Error(`Missing vote policy for ${config.voteTable}`)
  return policy ?? fallback!
}
