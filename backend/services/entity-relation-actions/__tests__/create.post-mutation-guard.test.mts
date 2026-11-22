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
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
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

  it('rejects a symmetric relation when a participant becomes private after admission', async () => {
    const owner = (await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)) as PrivateUser
    const subject = await createTestPost({ user: owner })
    const object = await createTestPost({ user: owner })
    const restore = runBeforePostgresStatementForTest('/* assertPostMutationAccess */', () =>
      makeRelationParticipantPrivateForTest(subject.id),
    )
    try {
      await expect(
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
      ).rejects.toMatchObject({ statusCode: 403 })
    } finally {
      restore()
    }
    await expect(
      getEntityRelation('relation__post__related__post', subject.id, object.id),
    ).resolves.toEqual([])
    await expect(
      getEntityRelation('relation__post__related__post', object.id, subject.id),
    ).resolves.toEqual([])
  })
})
