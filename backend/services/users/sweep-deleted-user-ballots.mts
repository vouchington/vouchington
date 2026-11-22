import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import {
  getUserDeletionsWorkLimit,
  userDeletionsWorkMaxValues,
} from '@services/user-deletions/work-limits'
import sql from 'sql-template-strings'
import {
  deletedUserBallotFamilies,
  deleteDeletedUserBallotKeys,
  getDeletedUserBallotFamily,
  inspectDeletedUserBallotOwners,
  selectDeletedUserBallotKeys,
} from './deleted-user-ballot-page.mts'

type Position = {
  family: string
  cursor_owner_id: string | null
  cursor_entity_id: string | null
  cursor_ballot_id: string | null
  sweep_upper_bound_id: string | null
}
type Scope = { userIds: readonly string[]; batchSize: number; position?: Position | null }

const start: Position = {
  family: deletedUserBallotFamilies[0]!,
  cursor_owner_id: null,
  cursor_entity_id: null,
  cursor_ballot_id: null,
  sweep_upper_bound_id: null,
}

export async function sweepDeletedUserBallots(scope?: Scope) {
  const batchSize = scope?.batchSize ?? getUserDeletionsWorkLimit('straggler_ballot_batch_size')
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > userDeletionsWorkMaxValues.straggler_ballot_batch_size ||
    (scope && scope.userIds.length > userDeletionsWorkMaxValues.straggler_ballot_batch_size)
  ) {
    throw new RangeError('Deleted-user ballot sweep exceeds its work cap')
  }
  await using query = await beginTransaction()
  const prior = scope ? (scope.position ?? null) : await readPosition(query)
  const position = prior ?? start
  if (scope && position.cursor_owner_id && !scope.userIds.includes(position.cursor_owner_id))
    throw new RangeError('Deleted-user ballot position is outside the owned scope')
  const upperId = position.sweep_upper_bound_id ?? (await findUpperUserId(query, scope?.userIds))
  if (!upperId) return { deleted: 0, position: prior }
  const nextPage = await preparePage(query, position, upperId, batchSize, scope?.userIds)
  if (!scope && !(await advancePosition(query, prior, nextPage.position)))
    return { deleted: 0, position: prior }
  const deleted = nextPage.ownerId
    ? await deleteDeletedUserBallotKeys(
        query,
        getDeletedUserBallotFamily(position.family),
        nextPage.ownerId,
        nextPage.keys,
      )
    : 0
  await query.commit()
  return { deleted, position: nextPage.position }
}

async function preparePage(
  query: QueryExecutor,
  position: Position,
  upperId: string,
  batchSize: number,
  userIds?: readonly string[],
) {
  const family = getDeletedUserBallotFamily(position.family)
  const cursor =
    position.cursor_entity_id && position.cursor_ballot_id
      ? { entity_id: position.cursor_entity_id, id: position.cursor_ballot_id }
      : null
  let ownerId = cursor ? position.cursor_owner_id : null
  if (!ownerId) {
    const users = await inspectDeletedUserBallotOwners(
      query,
      family,
      position.cursor_owner_id,
      upperId,
      batchSize,
      userIds,
    )
    ownerId = users.find(user => user.has_ballot)?.id ?? null
    if (!ownerId) {
      const last = users.at(-1)?.id
      const nextFamily =
        deletedUserBallotFamilies[deletedUserBallotFamilies.indexOf(position.family) + 1]
      const next =
        last && users.length === batchSize && last !== upperId
          ? { ...position, cursor_owner_id: last, sweep_upper_bound_id: upperId }
          : nextFamily
            ? { ...start, family: nextFamily, sweep_upper_bound_id: upperId }
            : start
      return { position: next, ownerId: null, keys: [] }
    }
  }
  const keys = await selectDeletedUserBallotKeys(query, family, ownerId, batchSize, cursor)
  const last = keys.length === batchSize ? keys.at(-1) : undefined
  return {
    ownerId,
    keys,
    position: {
      family: position.family,
      cursor_owner_id: ownerId,
      cursor_entity_id: last?.entity_id ?? null,
      cursor_ballot_id: last?.id ?? null,
      sweep_upper_bound_id: upperId,
    },
  }
}

async function findUpperUserId(query: QueryExecutor, userIds?: readonly string[]) {
  const statement = sql`/* findDeletedUserBallotSweepUpperUser */ SELECT id FROM users
    WHERE deleted_at IS NOT NULL`
  if (userIds) statement.append(sql` AND id = ANY(${userIds}::uuid[])`)
  statement.append(' ORDER BY id DESC LIMIT 1')
  const { rows } = await query<{ id: string }>(statement)
  return rows[0]?.id
}

async function readPosition(query: QueryExecutor) {
  const { rows } = await query<Position>(sql`/* readDeletedUserBallotSweepPosition */
    SELECT family, cursor_owner_id, cursor_entity_id, cursor_ballot_id, sweep_upper_bound_id
    FROM deleted_user_ballot_cleanup_cursors WHERE is_singleton`)
  return rows[0] ?? null
}

async function advancePosition(query: QueryExecutor, prior: Position | null, next: Position) {
  const statement = prior
    ? sql`/* advanceDeletedUserBallotSweepPosition */
      UPDATE deleted_user_ballot_cleanup_cursors
      SET family = ${next.family}, cursor_owner_id = ${next.cursor_owner_id},
        cursor_entity_id = ${next.cursor_entity_id}, cursor_ballot_id = ${next.cursor_ballot_id},
        sweep_upper_bound_id = ${next.sweep_upper_bound_id}
      WHERE is_singleton AND family = ${prior.family}
        AND cursor_owner_id IS NOT DISTINCT FROM ${prior.cursor_owner_id}::uuid
        AND cursor_entity_id IS NOT DISTINCT FROM ${prior.cursor_entity_id}::uuid
        AND cursor_ballot_id IS NOT DISTINCT FROM ${prior.cursor_ballot_id}::uuid
        AND sweep_upper_bound_id IS NOT DISTINCT FROM ${prior.sweep_upper_bound_id}::uuid`
    : sql`/* createDeletedUserBallotSweepPosition */
      INSERT INTO deleted_user_ballot_cleanup_cursors
        (family, cursor_owner_id, cursor_entity_id, cursor_ballot_id, sweep_upper_bound_id)
      VALUES (${next.family}, ${next.cursor_owner_id}, ${next.cursor_entity_id},
        ${next.cursor_ballot_id}, ${next.sweep_upper_bound_id})
      ON CONFLICT DO NOTHING`
  return (await query(statement)).rowCount === 1
}
