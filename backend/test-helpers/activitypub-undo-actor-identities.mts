import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { createTestPost } from './entities/create-test-entities.mts'
import { createFederatedUser } from './ap-inbox-activity-fixtures.mts'

export type UndoActorActivityKind = 'Follow' | 'Like'

const SOURCES = {
  Follow: {
    table: 'activitypub_remote_follow_activities',
    activity: 'activity_id',
    actor: 'remote_actor_id',
    target: 'target_user_id',
    terminal: 'undone_at',
  },
  Like: {
    table: 'activitypub_post_likes',
    activity: 'like_activitypub_id',
    actor: 'remote_actor_id',
    target: 'post_id',
    terminal: 'deleted_at',
  },
} as const

export type UndoActorIdentityFact = {
  id: string
  actorId: string
  targetId: string
  confirmedAt: string | null
  terminalAt: string | null
}

/** Keep persistence assertions under the lower layer's actual current identity contract. */
export async function readUndoActorIdentityFactsForTest(
  query: TransactionQuery,
  kind: UndoActorActivityKind,
  activityUri: string,
  actorIds: readonly string[],
): Promise<UndoActorIdentityFact[]> {
  const source = SOURCES[kind]
  const { rows } = await query<UndoActorIdentityFact>(
    `/* readUndoActorIdentityFactsForTest */
     SELECT id, ${source.actor} AS "actorId", ${source.target} AS "targetId",
            confirmed_at::text AS "confirmedAt", ${source.terminal}::text AS "terminalAt"
     FROM ${source.table}
     WHERE ${source.activity} = $1::text AND ${source.actor} = ANY($2::uuid[])
     ORDER BY ${source.actor}, id LIMIT 10`,
    [activityUri, actorIds],
  )
  return rows
}

/** Read only the exact actor/target edge created by this regression's public dispatch. */
export async function hasActiveUndoActorEdgeForTest(
  query: TransactionQuery,
  kind: UndoActorActivityKind,
  actorId: string,
  targetId: string,
): Promise<boolean> {
  const { rows } =
    kind === 'Follow'
      ? await query<{ active: boolean }>(
          `/* hasActiveUndoActorFollowForTest */
           SELECT EXISTS (
             SELECT 1 FROM relation__remote_actor__follow__user
             WHERE subject_id = $1::uuid AND object_id = $2::uuid AND deleted_at IS NULL
           ) AS active`,
          [actorId, targetId],
        )
      : await query<{ active: boolean }>(
          `/* hasActiveUndoActorLikeForTest */
           SELECT EXISTS (
             SELECT 1 FROM activitypub_post_likes
             WHERE remote_actor_id = $1::uuid AND post_id = $2::uuid AND deleted_at IS NULL
           ) AS active`,
          [actorId, targetId],
        )
  return rows[0]?.active ?? false
}

export async function createUndoActorTargetForTest(
  kind: UndoActorActivityKind,
  getUri: (id: string) => string,
) {
  if (kind === 'Follow') {
    const user = await createFederatedUser()
    return { id: user.id, uri: getUri(user.id) }
  }
  const post = await createTestPost()
  return { id: post.id, uri: getUri(post.id) }
}

/** Observe the real contender's URI fence without replacing the query or its result. */
export function observeUndoActorUriLockForTest(
  query: TransactionQuery,
  kind: UndoActorActivityKind,
  activityUri: string,
  attempted: () => void,
): TransactionQuery {
  const marker =
    kind === 'Follow' ? 'lockRemoteFollowActivityIdentity' : 'lockActivityPubLikeIdentity'
  return new Proxy(query, {
    apply(target, thisArgument, args: Parameters<TransactionQuery>) {
      const [statement, values] = args
      const text = typeof statement === 'string' ? statement : statement.text
      const parameters = values ?? (typeof statement === 'string' ? [] : statement.values)
      if (text.includes(`/* ${marker} */`) && parameters?.includes(activityUri)) attempted()
      return Reflect.apply(target, thisArgument, args)
    },
  })
}

/** Erase only this committed race's exact URI, actor IDs, and target IDs after both writers close. */
export async function deleteUndoActorRaceFactsForTest(
  kind: UndoActorActivityKind,
  activityUri: string,
  owners: readonly { actorId: string; targetId: string }[],
): Promise<void> {
  const source = SOURCES[kind]
  const actorIds = owners.map(owner => owner.actorId)
  const targetIds = owners.map(owner => owner.targetId)
  await using query = await beginTransaction()
  if (kind === 'Like') {
    await query(
      `/* terminalizeUndoActorRaceLikesForTest */
       UPDATE activitypub_post_likes SET deleted_at = COALESCE(deleted_at, clock_timestamp())
       WHERE like_activitypub_id = $1::text AND remote_actor_id = ANY($2::uuid[])
         AND post_id = ANY($3::uuid[])`,
      [activityUri, actorIds, targetIds],
    )
  }
  if (kind === 'Follow') {
    await query(
      `/* deleteUndoActorRaceFollowEdgesForTest */
       DELETE FROM relation__remote_actor__follow__user relation
       WHERE relation.subject_id = ANY($2::uuid[]) AND relation.object_id = ANY($3::uuid[])
         AND relation.inbound_follow_activity_row_id IN (
           SELECT id FROM activitypub_remote_follow_activities
           WHERE activity_id = $1::text AND remote_actor_id = ANY($2::uuid[])
             AND target_user_id = ANY($3::uuid[])
         )`,
      [activityUri, actorIds, targetIds],
    )
  }
  await query(
    `/* deleteUndoActorRaceIdentitiesForTest */
     DELETE FROM ${source.table}
     WHERE ${source.activity} = $1::text AND ${source.actor} = ANY($2::uuid[])
       AND ${source.target} = ANY($3::uuid[])`,
    [activityUri, actorIds, targetIds],
  )
  await query.commit()
}
