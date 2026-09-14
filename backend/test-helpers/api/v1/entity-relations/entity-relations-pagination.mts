import { expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { insertTestPost, insertTestTopic } from '@voucha/test-helpers'
import { entityRelationMetadatum } from '../../../../services/entity-relations/metadata.mts'
import { upsertEntityRelation } from '../../../../services/entity-relations/index.mts'
import { refreshEntityRelationVoteStatsById } from '../../../../services/elections-votes/entity-relation/refresh-stats.mts'
import type { PrivateUser } from '../../../../services/users/types.mts'

export async function expectEntityRelationPagination(user: PrivateUser): Promise<void> {
  const nonce = crypto.randomUUID().slice(0, 8)
  const postId = await insertTestPost({
    title: 'Paginated relations',
    slug: `paginated-relations-${nonce}`,
    createdById: user.id,
    markdown: 'Test content',
  })
  const topicIds = await Promise.all(
    ['one', 'two'].map(name =>
      insertTestTopic({
        name: `${name} ${nonce}`,
        slug: `relation-${name}-${nonce}`,
        topicType: 'card',
        createdById: user.id,
      }),
    ),
  )
  const metadata = entityRelationMetadatum.find(
    item =>
      item.subject_type === 'post' && item.object_type === 'topic' && item.predicate === 'category',
  )!
  const relations = await upsertEntityRelation(
    user,
    metadata,
    { id: postId },
    topicIds.map(id => ({ id })),
  )
  // Relation creation auto-casts Confirm and schedules an asynchronous projection refresh. Keep
  // the score ordering stable for the cursor assertions below.
  await Promise.all(relations.map(relation => refreshEntityRelationVoteStatsById(relation.id!)))

  const request = createRequest()
  const url = `/api/v1/entity-relations/post/${postId}/category/topic?limit=1`
  const first = await request.get(url).expect(200)
  expect(first.body.page_info.has_next_page).toBe(true)
  const cursor = encodeURIComponent(first.body.page_info.end_cursor as string)
  const second = await request.get(`${url}&after=${cursor}`).expect(200)
  expect(second.body.results[0].id).not.toBe(first.body.results[0].id)
}
