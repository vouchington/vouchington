import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { createEntityRelationAction } from '../create.mts'
import {
  createTestPost,
  createTestUserWithAge,
  getEntityRelation,
  insertTestTopic,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
import { makeRelationParticipantPrivateForTest } from '@voucha/test-helpers/relation-read-context'
import { commitRelationWriteDuringCompetingMutationForTest } from '@voucha/test-helpers/relation-write-interleaving'
import { softDeleteEntityRelation } from '@services/entity-relations/delete'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations'
import type { PrivateUser } from '@services/users/types'

describe('createEntityRelationAction post mutation guard', () => {
  it.each(['subject', 'object'] as const)(
    'rejects delegated access after the public %s post becomes private',
    async participant => {
      const owner = (await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)) as PrivateUser
      const post = await createTestPost({ user: owner })
      const topicId = await insertTestTopic({
        name: `Publication race ${crypto.randomUUID()}`,
        slug: `publication-race-${crypto.randomUUID()}`,
        topicType: 'card',
        createdById: owner.id,
      })
      const input =
        participant === 'subject'
          ? {
              entityType: 'post',
              entityId: post.id,
              predicate: 'category',
              objectType: 'topic',
              objectId: topicId,
            }
          : {
              entityType: 'topic',
              entityId: topicId,
              predicate: 'faq',
              objectType: 'post',
              objectId: post.id,
            }
      const relation = getEntityRelationMetadataOrThrow(
        participant === 'subject'
          ? { subjectType: 'post', predicate: 'category', objectType: 'topic' }
          : { subjectType: 'topic', predicate: 'faq', objectType: 'post' },
      )
      await makeRelationParticipantPrivateForTest(post.id)
      const creating = createEntityRelationAction(
        owner,
        {
          kind: 'delegated',
          credentialOwnerId: owner.id,
          grantedScopes: ['entity-relations:read', 'entity-relations:write'],
        },
        input,
      ).catch((err: unknown) => err)
      await expect(creating).resolves.toMatchObject({ statusCode: 403 })
      await expect(
        getEntityRelation(relation.table_name, input.entityId, input.objectId),
      ).resolves.toEqual([])
    },
  )

  it('rolls back both directions when a participant becomes private during the upsert wait', async () => {
    const owner = (await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)) as PrivateUser
    const subject = await createTestPost({ user: owner })
    const object = await createTestPost({ user: owner })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'related',
      objectType: 'post',
    })
    await expect(
      upsertEntityRelation(owner, relation, subject, [object], { vote: false }),
    ).resolves.toHaveLength(1)

    await expect(
      commitRelationWriteDuringCompetingMutationForTest(
        query => softDeleteEntityRelation(owner, relation, subject, [object], { query }),
        '/* buildBidirectionalInsertQuery */',
        () =>
          createEntityRelationAction(
            owner,
            {
              kind: 'delegated',
              credentialOwnerId: owner.id,
              grantedScopes: ['entity-relations:read', 'entity-relations:write'],
            },
            {
              entityType: 'post',
              entityId: subject.id,
              predicate: 'related',
              objectType: 'post',
              objectId: object.id,
            },
          ),
        () => makeRelationParticipantPrivateForTest(subject.id),
      ),
    ).rejects.toMatchObject({ statusCode: 403 })
    await expect(getEntityRelation(relation.table_name, subject.id, object.id)).resolves.toEqual([
      expect.objectContaining({ deleted_at: expect.any(Date), deleted_by_id: owner.id }),
    ])
    await expect(getEntityRelation(relation.table_name, object.id, subject.id)).resolves.toEqual([
      expect.objectContaining({ deleted_at: expect.any(Date), deleted_by_id: owner.id }),
    ])
  })
})
