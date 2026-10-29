import type { TransactionQuery } from '@data-stores/psql'

const SOURCES = {
  follow: {
    table: 'activitypub_remote_follow_activities',
    activityId: 'activity_id',
    terminalAt: 'undone_at',
  },
  like: {
    table: 'activitypub_post_like_activities',
    activityId: 'activity_id',
    terminalAt: 'undone_at',
  },
} as const

type Kind = keyof typeof SOURCES

export async function readTerminalActivityIdentitiesForTest(
  query: TransactionQuery,
  kind: Kind,
  activityIds: readonly string[],
): Promise<{ id: string; activityId: string; terminalAt: Date | null }[]> {
  const source = SOURCES[kind]
  const { rows } = await query<{ id: string; activityId: string; terminalAt: Date | null }>(
    `/* readTerminalActivityIdentitiesForTest */
     SELECT id, ${source.activityId} AS "activityId", ${source.terminalAt} AS "terminalAt"
     FROM ${source.table} WHERE ${source.activityId} = ANY($1::text[])
     ORDER BY id`,
    [activityIds],
  )
  return rows
}

export async function setTerminalActivityTimeForTest(
  query: TransactionQuery,
  kind: Kind,
  activityId: string,
  at: Date,
): Promise<void> {
  const source = SOURCES[kind]
  const { rowCount } = await query(
    `/* setTerminalActivityTimeForTest */
     UPDATE ${source.table} SET ${source.terminalAt} = $2::timestamptz
     WHERE ${source.activityId} = $1 AND ${source.terminalAt} IS NOT NULL`,
    [activityId, at],
  )
  if (rowCount !== 1) throw new Error('Expected one owned terminal identity')
  if (kind === 'like')
    await query(
      `/* setTerminalLikePayloadTimeForTest */
     UPDATE activitypub_post_likes SET deleted_at = $2::timestamptz
     WHERE id = (SELECT id FROM activitypub_post_like_activities WHERE activity_id = $1)
       AND deleted_at IS NOT NULL`,
      [activityId, at],
    )
}

/** Adds only a fixture-id restriction before the real capped production SELECT. */
export function scopeTerminalActivityQueryForTest(
  query: TransactionQuery,
  kind: Kind,
  ids: readonly string[],
): TransactionQuery {
  const source = SOURCES[kind]
  return new Proxy(query, {
    apply(target, thisArgument, args: Parameters<TransactionQuery>) {
      const [statement, values] = args
      if (typeof statement !== 'string') throw new Error('Expected a named terminal cleanup query')
      if (!statement.includes('/* cleanupActivityPubTerminalIdentityPage */')) {
        const picked = values?.[0]
        const owned = new Set(ids)
        if (
          !Array.isArray(picked) ||
          picked.some((id: unknown) => typeof id !== 'string' || !owned.has(id))
        ) {
          throw new Error('Terminal cleanup mutation escaped owned fixture IDs')
        }
        const identityDelete =
          statement.includes('/* deleteTerminalActivityIdentityPage */') &&
          statement.includes(`DELETE FROM ${source.table} target`)
        const payloadDelete =
          kind === 'like' &&
          statement.includes('/* deleteTerminalActivityLikePayloadPage */') &&
          statement.includes('DELETE FROM activitypub_post_likes')
        if (!identityDelete && !payloadDelete)
          throw new Error('Unexpected terminal cleanup mutation')
        return Reflect.apply(target, thisArgument, args)
      }
      const selector = `WHERE ${source.terminalAt} < $1::timestamptz`
      if (
        !statement.includes(`FROM ${source.table}`) ||
        !statement.includes(selector) ||
        !statement.includes('LIMIT $2')
      ) {
        throw new Error('Terminal activity cleanup lost its reviewed selector')
      }
      return Reflect.apply(target, thisArgument, [
        statement.replace(selector, `${selector} AND id = ANY($3::uuid[])`),
        [...(values ?? []), ids],
      ])
    },
  })
}

export async function readFollowCyclePointerForTest(
  query: TransactionQuery,
  actorId: string,
  userId: string,
): Promise<
  | { subject_id: string; object_id: string; inbound_follow_activity_row_id: string | null }
  | undefined
> {
  const { rows } = await query<{
    subject_id: string
    object_id: string
    inbound_follow_activity_row_id: string | null
  }>(
    `/* readFollowCyclePointerForTest */
     SELECT subject_id, object_id, inbound_follow_activity_row_id
     FROM relation__remote_actor__follow__user
     WHERE subject_id = $1::uuid AND object_id = $2::uuid LIMIT 1`,
    [actorId, userId],
  )
  return rows[0]
}

/** Remove this owned terminal payload to model the independent, shorter payload-retention phase. */
export async function removeTerminalLikePayloadForTest(query: TransactionQuery, id: string) {
  await query(
    `/* removeTerminalLikePayloadForTest */
     DELETE FROM activitypub_post_likes WHERE id = $1::uuid AND deleted_at IS NOT NULL`,
    [id],
  )
}
