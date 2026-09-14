import { randomUUID } from 'node:crypto'
import { describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserDirect,
  createTestUserWithAge,
  insertTestPost,
} from '@voucha/test-helpers'
import { upsertEntityRelation } from '@services/entity-relations'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'

describe('entity-relation ordinary official voting', () => {
  it('preserves voting for non-user entity relations', async () => {
    const creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const official = await createTestUserDirect({
      withEmail: true,
      extraRoles: ['investor'],
    })
    const postId1 = await insertTestPost({
      title: 'Test Post Ordinary Official Vote 1',
      slug: `test-post-ordinary-official-vote-1-${randomUUID()}`,
      createdById: creator.id,
      markdown: 'Test content',
    })
    const postId2 = await insertTestPost({
      title: 'Test Post Ordinary Official Vote 2',
      slug: `test-post-ordinary-official-vote-2-${randomUUID()}`,
      createdById: creator.id,
      markdown: 'Test content',
    })
    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'related',
      objectType: 'post',
    })
    const [relation] = await upsertEntityRelation(creator, metadata, { id: postId1 }, [
      { id: postId2 },
    ])
    const request = createRequest()
    await request.authenticateAs(official)

    await request
      .put(`/api/v1/entity-relations/${relation!.id}/vote`)
      .send({ choice: 'confirm' })
      .expect(204)
  })
})
