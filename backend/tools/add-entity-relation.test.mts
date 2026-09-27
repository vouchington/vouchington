import { describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestPost,
  createTestUrlWithHostname,
  createTestUserWithAge,
  getEntityRelation,
} from '@voucha/test-helpers'
import addEntityRelationTool from './add-entity-relation.mts'

describe('add_entity_relation', () => {
  it('uses delegated context for a REST-allowed public relation on another author post', async () => {
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const post = await createTestPost({ user: author })
    const urlId = await createTestUrlWithHostname()
    const execute = addEntityRelationTool.function(contributor)

    const result = await execute(
      {
        action: 'add_relation',
        entity_type: 'post',
        entity_id: post.id,
        predicate: 'related',
        object_type: 'url',
        object_id: urlId,
      },
      {
        credentialOwnerId: contributor.id,
        grantedScopes: ['entity-relations:read', 'entity-relations:write'],
      },
    )

    expect(result).toMatchObject({
      relation_id: expect.any(String),
      subject_type: 'post',
      subject_id: post.id,
      predicate: 'related',
      object_type: 'url',
      object_id: urlId,
    })
    expect(await getEntityRelation('relation__post__related__url', post.id, urlId)).toHaveLength(1)
  })

  it('fails closed without trusted returned-callable context', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const post = await createTestPost({ user })
    const urlId = await createTestUrlWithHostname()

    await expect(
      addEntityRelationTool.function(user)({
        action: 'add_relation',
        entity_type: 'post',
        entity_id: post.id,
        predicate: 'related',
        object_type: 'url',
        object_id: urlId,
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(await getEntityRelation('relation__post__related__url', post.id, urlId)).toHaveLength(0)
  })

  it('rejects a delegated context owned by someone other than the tool user', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const credentialOwner = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const post = await createTestPost({ user })
    const urlId = await createTestUrlWithHostname()

    await expect(
      addEntityRelationTool.function(user)(
        {
          action: 'add_relation',
          entity_type: 'post',
          entity_id: post.id,
          predicate: 'related',
          object_type: 'url',
          object_id: urlId,
        },
        {
          credentialOwnerId: credentialOwner.id,
          grantedScopes: ['entity-relations:read', 'entity-relations:write'],
        },
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(await getEntityRelation('relation__post__related__url', post.id, urlId)).toHaveLength(0)
  })

  it('keeps add_tag on the authored PATCH-equivalent boundary', async () => {
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const otherUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const post = await createTestPost({ user: author })

    await expect(
      addEntityRelationTool.function(otherUser)(
        { action: 'add_tag', post_id: post.id, tag: '#not-author' },
        {
          credentialOwnerId: otherUser.id,
          grantedScopes: ['entity-relations:read', 'entity-relations:write'],
        },
      ),
    ).rejects.toMatchObject({ status: 403 })
  })
})
