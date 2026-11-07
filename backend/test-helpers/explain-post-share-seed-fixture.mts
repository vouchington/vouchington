import { randomInt } from 'node:crypto'
import { onTestFinished } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUserDirect } from './entities/users-direct.mts'
import { hardDeleteTestUser } from './entities/users-lifecycle.mts'
import { hardDeleteTestPosts } from './entities/posts-deletion.mts'
import { insertTestPostBatch } from './entities/publication-impact-batches.mts'
import type { seedPostFeedShares } from '../scripts/explain-analyze/seed-data/post-feed-shares.mts'

type SeedIdentities = NonNullable<Parameters<typeof seedPostFeedShares>[0]>
type OwnedShare = {
  recipient_user_id: string
  id: string
  shared_by_id: string
  post_id: string
}

/** Minimal owned parents for the seed's fixed sparse/dense delivery cardinalities. */
export async function createOwnedPostShareSeedFixture(): Promise<SeedIdentities> {
  const userIds: string[] = []
  let postIds: string[] = []
  onTestFinished(async () => {
    await write(sql`/* cleanOwnedPostShareSeedDeliveries */
      DELETE FROM post_feed_shares WHERE recipient_user_id = ANY(${userIds}::uuid[])
    `)
    await write(sql`/* cleanOwnedPostShareSeedFollow */
      DELETE FROM relation__user__follow__user
      WHERE subject_id = ANY(${userIds}::uuid[]) AND object_id = ANY(${userIds}::uuid[])
    `)
    await hardDeleteTestPosts(postIds)
    await Promise.all(userIds.map(id => hardDeleteTestUser(id)))
  })
  for (let index = 0; index < 4; index++) {
    userIds.push((await createTestUserDirect()).id)
  }
  postIds = await insertTestPostBatch(userIds[2]!, 1000)
  return {
    recipientIds: [userIds[0]!, userIds[1]!],
    sharedById: userIds[2]!,
    emptyRecipientId: userIds[3]!,
    targetPostIds: postIds,
    deliveryIdBase: randomInt(2 ** 40),
  }
}

/** Only fixture-owned recipients; the extra row makes oversized output fail the literal counts. */
export async function readOwnedPostShareSeedRows(identities: SeedIdentities) {
  const { rows } = await write<OwnedShare>(sql`/* readOwnedPostShareSeedRows */
    SELECT recipient_user_id, id, shared_by_id, post_id
    FROM post_feed_shares
    WHERE recipient_user_id = ANY(${[...identities.recipientIds, identities.emptyRecipientId]}::uuid[])
    ORDER BY recipient_user_id, id
    LIMIT 4129
  `)
  const { rows: follows } = await write<{
    subject_id: string
    object_id: string
    created_by_id: string
  }>(sql`/* readOwnedPostShareSeedFollow */
    SELECT subject_id, object_id, created_by_id
    FROM relation__user__follow__user
    WHERE subject_id = ${identities.emptyRecipientId} AND object_id = ${identities.sharedById}
    LIMIT 2
  `)
  return { rows, follows }
}
