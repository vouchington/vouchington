import { beginTransaction, write } from '@data-stores/psql'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { lockBidirectionalRelationPairs } from '../services/entity-relations/bidirectional-pair-lock.mts'

/** Hold only authorization/reference contexts, never the relation pair the callback writes. */
export async function withHeldRelationReadContextForTest<T>(
  contexts: { postIds?: readonly string[]; topicIds?: readonly string[] },
  action: () => Promise<T>,
): Promise<T> {
  const keys = [
    ...(contexts.postIds ?? []).map(id => `post:${id.toLowerCase()}`),
    ...(contexts.topicIds ?? []).map(id => `topic-rss-feed-attachment:${id.toLowerCase()}`),
  ]
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

/** Wait on the relation pair being written, then commit privacy before its plain guard recheck. */
export async function withRelationPairPrivacyChangeForTest<T>(
  subjectId: string,
  objectId: string,
  start: () => Promise<T>,
): Promise<T> {
  const relationTable = 'relation__post__related__post'
  const ids = [subjectId, objectId].toSorted()
  await using holder = await beginTransaction()
  await lockBidirectionalRelationPairs(holder, relationTable, subjectId, [objectId])
  const { rows } = await holder<{ pid: number }>(
    '/* relationPairHolderPid */ SELECT pg_backend_pid() AS pid',
  )
  return await withTestOwnedPostgresWait(
    {
      holderProcessId: rows[0]!.pid,
      pool: 'write',
      lock: { kind: 'advisory', key: `${relationTable}:${ids[0]}:${ids[1]}` },
      queryMarker: 'lockBidirectionalRelationPairs',
      releaseHolder: () => holder[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const action = start()
      await waitForLock(action)
      await makeRelationParticipantPrivateForTest(subjectId)
      await holder.commit()
      return action
    },
  )
}
