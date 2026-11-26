import { beginTransaction, write } from '@data-stores/psql'

/** Hold only authorization/reference contexts, never the relation pair the callback writes. */
export async function withHeldRelationReadContextForTest<T>(
  contexts: { postIds?: readonly string[] },
  action: () => Promise<T>,
): Promise<T> {
  const keys = (contexts.postIds ?? []).map(id => `post:${id.toLowerCase()}`)
  await using holder = await beginTransaction()
  await holder(
    `/* withHeldRelationReadContextForTest */
    SELECT pg_advisory_xact_lock(hashtextextended(key, 0))
    FROM unnest($1::text[]) AS input(key) ORDER BY key`,
    [keys],
  )
  return await action()
}

export async function makeRelationParticipantPrivateForTest(postId: string): Promise<void> {
  await write(
    `/* makeRelationParticipantPrivateForTest */
    UPDATE posts SET privacy = 'private', broadcast = 'followers' WHERE id = $1::uuid`,
    [postId],
  )
}
