import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { createEntityRelationAction } from '../create.mts'
import {
  beginTransaction,
  createTestPost,
  createTestUserWithAge,
  getEntityRelation,
  getTestPostgresBackendProcessId,
  insertTestTopic,
  waitForTestPostgresLockWaiter,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations'
import type { PrivateUser } from '@services/users/types'
import { lockPostPublication } from '@services/post-publication'

describe('createEntityRelationAction post mutation guard', () => {
  it.each(['subject', 'object'] as const)(
    'rechecks delegated private access after a public %s post becomes private while waiting for publication',
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
      const locked = Promise.withResolvers<number>()
      const release = Promise.withResolvers<void>()
      const holder = holdPublicationLockThenMutate(post.id, locked, release, query =>
        query(`UPDATE posts SET privacy = 'private', broadcast = 'followers' WHERE id = $1`, [
          post.id,
        ]),
      )
      const holderPid = await locked.promise

      const creating = createEntityRelationAction(
        owner,
        {
          kind: 'delegated',
          credentialOwnerId: owner.id,
          grantedScopes: ['entity-relations:read', 'entity-relations:write'],
        },
        input,
      ).catch(err => err)
      try {
        await waitForTestPostgresLockWaiter(holderPid, 'lockPostPublicationCaptures')
      } finally {
        release.resolve()
      }
      await holder
      await expect(creating).resolves.toMatchObject({ statusCode: 403 })
      await expect(
        getEntityRelation(relation.table_name, input.entityId, input.objectId),
      ).resolves.toEqual([])
    },
  )

  it('rolls back both directions when a public post relation becomes private while locked', async () => {
    const owner = (await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)) as PrivateUser
    const subject = await createTestPost({ user: owner })
    const object = await createTestPost({ user: owner })
    const locked = Promise.withResolvers<number>()
    const release = Promise.withResolvers<void>()
    const holder = holdPublicationLockThenMutate(subject.id, locked, release, query =>
      query(`UPDATE posts SET privacy = 'private', broadcast = 'followers' WHERE id = $1`, [
        subject.id,
      ]),
    )
    const holderPid = await locked.promise

    const creating = createEntityRelationAction(
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
    ).catch(err => err)
    try {
      await waitForTestPostgresLockWaiter(holderPid, 'lockPostPublicationCaptures')
    } finally {
      release.resolve()
    }
    await holder

    await expect(creating).resolves.toMatchObject({ statusCode: 403 })
    await expect(
      getEntityRelation('relation__post__related__post', subject.id, object.id),
    ).resolves.toEqual([])
    await expect(
      getEntityRelation('relation__post__related__post', object.id, subject.id),
    ).resolves.toEqual([])
  })

  it('fails closed when a participant effective root changes while waiting for publication', async () => {
    const owner = (await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)) as PrivateUser
    const firstRoot = await createTestPost({ user: owner })
    const secondRoot = await createTestPost({ user: owner })
    const reply = await createTestPost({
      user: owner,
      post_type: 'comment',
      parent_post_id: firstRoot.id,
      root_post_id: firstRoot.id,
    })
    const topicId = await insertTestTopic({
      name: `Effective root race ${crypto.randomUUID()}`,
      slug: `effective-root-race-${crypto.randomUUID()}`,
      topicType: 'card',
      createdById: owner.id,
    })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'category',
      objectType: 'topic',
    })
    const locked = Promise.withResolvers<number>()
    const release = Promise.withResolvers<void>()
    const holder = holdPublicationLockThenMutate(reply.id, locked, release, query =>
      query(`UPDATE posts SET root_post_id = $1, parent_post_id = $1 WHERE id = $2`, [
        secondRoot.id,
        reply.id,
      ]),
    )
    const holderPid = await locked.promise

    const creating = createEntityRelationAction(
      owner,
      {
        kind: 'delegated',
        credentialOwnerId: owner.id,
        grantedScopes: [
          'entity-relations:read',
          'entity-relations:write',
          'post-relations.owned-private:write',
        ],
      },
      {
        entityType: 'post',
        entityId: reply.id,
        predicate: 'category',
        objectType: 'topic',
        objectId: topicId,
      },
    ).catch(err => err)
    try {
      await waitForTestPostgresLockWaiter(holderPid, 'lockPostPublicationCaptures')
    } finally {
      release.resolve()
    }
    await holder
    await expect(creating).resolves.toMatchObject({ statusCode: 404 })
    await expect(getEntityRelation(relation.table_name, reply.id, topicId)).resolves.toEqual([])
  })
})

async function holdPublicationLockThenMutate(
  postId: string,
  locked: PromiseWithResolvers<number>,
  release: PromiseWithResolvers<void>,
  mutate: (query: Awaited<ReturnType<typeof beginTransaction>>) => Promise<unknown>,
): Promise<void> {
  await using query = await beginTransaction()
  await lockPostPublication(query, postId)
  locked.resolve(await getTestPostgresBackendProcessId(query))
  await release.promise
  await mutate(query)
  await query.commit()
}
