import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { createEntityRelationAction } from '../create.mts'
import {
  createTestPost,
  insertTestTopic,
  createTestUserWithAge,
  createTestUrlWithHostname,
  CONTRIBUTING_USER_AGE_MS,
  getEntityRelation,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { getEntityRelationMetadataOrThrow, upsertEntityRelation } from '@services/entity-relations'

describe('createEntityRelationAction', () => {
  it('requires the exact delegated private-post grant while preserving first-party access', async () => {
    const owner = (await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)) as PrivateUser
    const post = await createTestPost({
      user: owner,
      privacy: 'private',
      broadcast: 'followers',
    })
    const urlId = await createTestUrlWithHostname()
    const input = {
      entityType: 'post',
      entityId: post.id,
      predicate: 'related',
      objectType: 'url',
      objectId: urlId,
    }

    await expect(
      createEntityRelationAction(
        owner,
        { kind: 'delegated', credentialOwnerId: owner.id, grantedScopes: [] },
        input,
      ),
    ).rejects.toMatchObject({ statusCode: 403 })

    await expect(
      createEntityRelationAction(
        owner,
        {
          kind: 'delegated',
          credentialOwnerId: owner.id,
          grantedScopes: ['entity-relations:read', 'entity-relations:write'],
        },
        input,
      ),
    ).rejects.toMatchObject({ statusCode: 403 })

    const delegated = await createEntityRelationAction(
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
      input,
    )
    expect(delegated.relation.object_id).toBe(urlId)

    const topicId = await insertTestTopic({
      name: `Private object ${crypto.randomUUID()}`,
      slug: `private-object-${crypto.randomUUID()}`,
      topicType: 'card',
      createdById: owner.id,
    })
    const privateObject = await createTestPost({
      user: owner,
      privacy: 'private',
      broadcast: 'followers',
    })
    const privateObjectResult = await createEntityRelationAction(
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
        entityType: 'topic',
        entityId: topicId,
        predicate: 'faq',
        objectType: 'post',
        objectId: privateObject.id,
      },
    )
    expect(privateObjectResult.relation.object_id).toBe(privateObject.id)

    await expect(
      createEntityRelationAction(
        owner,
        { kind: 'first_party' },
        {
          entityType: 'post',
          entityId: 'not-a-post-id',
          predicate: 'related',
          objectType: 'url',
          objectId: urlId,
        },
      ),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('denies an own reply beneath another owner private root despite the exact grant, without disclosing a hidden root', async () => {
    const rootOwner = (await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)) as PrivateUser
    const replyAuthor = (await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)) as PrivateUser
    const privateRoot = await createTestPost({
      user: rootOwner,
      privacy: 'private',
      broadcast: 'followers',
    })
    const ownReply = await createTestPost({
      user: replyAuthor,
      post_type: 'comment',
      parent_post_id: privateRoot.id,
      root_post_id: privateRoot.id,
    })
    const urlId = await createTestUrlWithHostname()
    const authority = {
      kind: 'delegated' as const,
      credentialOwnerId: replyAuthor.id,
      grantedScopes: [
        'entity-relations:read' as const,
        'entity-relations:write' as const,
        'post-relations.owned-private:write' as const,
      ],
    }
    const input = {
      entityType: 'post',
      entityId: ownReply.id,
      predicate: 'related',
      objectType: 'url',
      objectId: urlId,
    }
    const related = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'related',
      objectType: 'url',
    })

    await expect(createEntityRelationAction(replyAuthor, authority, input)).rejects.toMatchObject({
      statusCode: 404,
    })
    await expect(getEntityRelation(related.table_name, ownReply.id, urlId)).resolves.toEqual([])

    const follow = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      predicate: 'follow',
      objectType: 'user',
    })
    await upsertEntityRelation(replyAuthor, follow, { id: replyAuthor.id }, [{ id: rootOwner.id }])

    await expect(createEntityRelationAction(replyAuthor, authority, input)).rejects.toMatchObject({
      statusCode: 403,
    })
    await expect(
      createEntityRelationAction(replyAuthor, authority, {
        ...input,
        entityId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
    await expect(getEntityRelation(related.table_name, ownReply.id, urlId)).resolves.toEqual([])
  })
})
