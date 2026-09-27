import { describe } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  insertTestPost,
} from '@voucha/test-helpers'
import { upsertEntityRelation } from '@services/entity-relations'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import type { PrivateUser } from '@services/users/types'
import { registerVoteListPaginationTests } from '../../../../test-helpers/vote-list-pagination-tests.mts'

function randomSlug(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

async function createTestEntityRelation(creator: PrivateUser) {
  const postId1 = await insertTestPost({
    title: 'Entity Relation Votes Pagination 1',
    slug: randomSlug('er-votes-pagination-1'),
    createdById: creator.id,
    markdown: 'Test content',
  })
  const postId2 = await insertTestPost({
    title: 'Entity Relation Votes Pagination 2',
    slug: randomSlug('er-votes-pagination-2'),
    createdById: creator.id,
    markdown: 'Test content',
  })
  const metadata = entityRelationMetadatum.find(
    m => m.subject_type === 'post' && m.object_type === 'post' && m.predicate === 'related',
  )!
  const relations = await upsertEntityRelation(
    creator,
    metadata,
    { id: postId1 },
    [{ id: postId2 }],
    { vote: false },
  )
  return relations[0]
}

describe('GET /api/v1/entity-relations/:id/votes pagination', () => {
  registerVoteListPaginationTests({
    segment: 'entity-relations',
    createId: async () => {
      const creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const relation = await createTestEntityRelation(creator)
      if (relation?.id == null) throw new Error('expected an entity relation id')
      return relation.id
    },
    ownChoice: 'confirm',
    otherChoice: 'dispute',
  })
})
