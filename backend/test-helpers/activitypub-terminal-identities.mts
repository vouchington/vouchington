import type { TransactionQuery } from '@data-stores/psql'

const SOURCES = {
  follow: {
    table: 'activitypub_remote_follow_activities',
    activityId: 'activity_id',
    terminalAt: 'undone_at',
  },
  like: {
    table: 'activitypub_post_likes',
    activityId: 'like_activitypub_id',
    terminalAt: 'deleted_at',
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
      if (
        typeof statement !== 'string' ||
        !statement.includes('/* cleanupActivityPubTerminalIdentityPage */')
      ) {
        throw new Error('Unexpected terminal activity cleanup statement')
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
