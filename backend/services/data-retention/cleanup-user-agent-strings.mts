import { beginTransaction } from '@data-stores/psql'

export type UserAgentStringCleanupPage = {
  scanned: number
  deleted: number
  hasMore: boolean
}

/** Cycles over the UUIDv7 key because a referenced row can become orphaned later. */
export async function cleanupOrphanedUserAgentStrings(
  batchSize: number,
  userAgentStringIds?: readonly string[],
): Promise<UserAgentStringCleanupPage> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 5_000) {
    throw new RangeError('User-agent cleanup batch size must be between 1 and 5000')
  }
  if (userAgentStringIds && userAgentStringIds.length > batchSize) {
    throw new RangeError('Scoped user-agent rows must fit one page')
  }
  await using query = await beginTransaction()
  if (!userAgentStringIds)
    await query(`/* ensureUserAgentStringCleanupCursor */
      INSERT INTO user_agent_string_cleanup_cursors (is_singleton)
      VALUES (TRUE) ON CONFLICT DO NOTHING`)
  const cursor = userAgentStringIds
    ? null
    : (
        await query<{ cursor_user_agent_string_id: string | null }>(
          `/* lockUserAgentStringCleanupCursor */
           SELECT cursor_user_agent_string_id FROM user_agent_string_cleanup_cursors
           WHERE is_singleton FOR UPDATE`,
        )
      ).rows[0]
  const { rows: candidates } = await query<{ id: string }>(
    `/* listUserAgentStringCleanupCandidates */
     SELECT id FROM user_agent_strings
     WHERE ($1::uuid[] IS NOT NULL AND id = ANY($1::uuid[]))
        OR ($1::uuid[] IS NULL AND ($2::uuid IS NULL OR id > $2::uuid))
     ORDER BY id LIMIT $3`,
    [userAgentStringIds ?? null, cursor?.cursor_user_agent_string_id ?? null, batchSize + 1],
  )
  const page = candidates.slice(0, batchSize)
  const { rowCount } = await query(
    `/* deleteOrphanedUserAgentStrings */
     WITH locked AS MATERIALIZED (
       SELECT ua.id FROM user_agent_strings ua
       WHERE ua.id = ANY($1::uuid[])
       ORDER BY ua.id FOR UPDATE OF ua SKIP LOCKED
     )
     DELETE FROM user_agent_strings ua USING locked
     WHERE ua.id = locked.id
       AND NOT EXISTS (
         -- no-mistakes-disable-next-line postgres-required-predicates: any surviving session in any ID partition keeps this user agent referenced; user_agent_string_id has an index
         SELECT 1 FROM user_sessions session
         WHERE session.user_agent_string_id = ua.id LIMIT 1
       )`,
    [page.map(row => row.id)],
  )
  const hasMore = candidates.length > batchSize
  if (!userAgentStringIds)
    await query(
      `/* checkpointUserAgentStringCleanupCursor */
       UPDATE user_agent_string_cleanup_cursors
       SET cursor_user_agent_string_id = $1 WHERE is_singleton`,
      [hasMore ? page.at(-1)!.id : null],
    )
  await query.commit()
  return { scanned: page.length, deleted: rowCount ?? 0, hasMore }
}
