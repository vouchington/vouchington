import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { enableQueryCapture, stopTestQueryCapture } from '../../test-helpers/query-capture.mts'
import { bookmarkEntity } from './upsert.mts'
import { getUserBookmarkRelationsForEntityType } from './bloom-filter.mts'
import { queryBookmarksForAllRelations, queryBookmarksForRelation } from './query.mts'

describe('bookmark query root annotation', () => {
  afterEach(() => {
    stopTestQueryCapture()
    vi.unstubAllEnvs()
  })

  it('preserves one annotated multi-relation statement with parameterized IDs and actual bookmarks', async () => {
    const { user, topicId, relations } = await createFixture()
    enableProductionAnnotationContract()
    const result = await queryBookmarksForAllRelations(user.id, 'topic', relations, [topicId])
    expect(result).toEqual({ [topicId]: { follow: true } })
    const captured = stopTestQueryCapture()
    expect(captured).toHaveLength(1)
    expect(captured[0]!.text.trimStart()).toMatch(/^\/\* queryEntityBookmarksForRelations \*\//)
    expect(captured[0]!.text).toContain(' UNION ALL ')
    expect(captured[0]!.values).toEqual([user.id, [topicId]])
  })

  it('uses the same annotated root for a narrowed single-relation read', async () => {
    const { user, topicId, relations } = await createFixture()
    const relation = relations.find(item => item.predicate === 'follow')!
    enableProductionAnnotationContract()
    expect(await queryBookmarksForRelation(user.id, 'topic', relation, [topicId])).toEqual([
      { object_id: topicId, _bookmark_type: 'follow' },
    ])
    const captured = stopTestQueryCapture()
    expect(captured).toHaveLength(1)
    expect(captured[0]!.text.trimStart()).toMatch(/^\/\* queryEntityBookmarksForRelations \*\//)
    expect(captured[0]!.text).not.toContain(' UNION ALL ')
    expect(captured[0]!.values).toEqual([user.id, [topicId]])
  })
})

async function createFixture() {
  const user = await createTestUser()
  const suffix = crypto.randomUUID()
  const topicId = await insertTestTopic({
    name: `Bookmark ${suffix}`,
    slug: `bookmark-${suffix}`,
    createdById: user.id,
  })
  await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')
  return { user, topicId, relations: getUserBookmarkRelationsForEntityType('topic') }
}

function enableProductionAnnotationContract() {
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('VITEST', 'false')
  enableQueryCapture()
}
