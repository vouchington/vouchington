import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserDirect,
  createTestUserWithAge,
  insertTestPost,
} from '@voucha/test-helpers'
import {
  createAccountTypeTestAgent,
  setAccountTypeTestUserKind,
} from '@voucha/test-helpers/account-types'
import { getEntityRelationElectionVote } from '@services/elections-votes/entity-relation'
import { upsertEntityRelation } from '@services/entity-relations'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { getPrivateUserByAny } from '@services/users'

async function createPostRelation() {
  const creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  const [postId1, postId2] = await Promise.all(
    [1, 2].map(n =>
      insertTestPost({
        title: `Test Post Ordinary Official Vote ${n}`,
        slug: `test-post-ordinary-official-vote-${n}-${randomUUID()}`,
        createdById: creator.id,
        markdown: 'Test content',
      }),
    ),
  )
  const metadata = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    predicate: 'related',
    objectType: 'post',
  })
  const [relation] = await upsertEntityRelation(creator, metadata, { id: postId1! }, [
    { id: postId2! },
  ])
  return relation!
}

describe('entity-relation ordinary official voting', () => {
  it('preserves voting for non-user entity relations', async () => {
    const relation = await createPostRelation()
    const official = await createTestUserDirect({
      withEmail: true,
      extraRoles: ['investor'],
    })
    const request = createRequest()
    await request.authenticateAs(official)

    await request
      .put(`/api/v1/entity-relations/${relation.id}/vote`)
      .send({ choice: 'confirm' })
      .expect(204)
  })

  it.each(['official', 'system', 'ai_agent'] as const)(
    'persists a structural relation vote from a %s account',
    async kind => {
      const relation = await createPostRelation()
      const account = await createTestUserDirect({ withEmail: true })
      await setAccountTypeTestUserKind(account.id, kind === 'official' ? 'official' : 'system')
      if (kind === 'ai_agent') await createAccountTypeTestAgent(account.id, false, true)
      expect((await getPrivateUserByAny(account.id))?.account_type).toBe(kind)
      const request = createRequest()
      await request.authenticateAs(account)

      await request
        .put(`/api/v1/entity-relations/${relation.id}/vote`)
        .send({ choice: 'confirm' })
        .expect(204)

      await expect(getEntityRelationElectionVote(account.id, relation.id)).resolves.toMatchObject({
        choice: 'confirm',
      })
    },
    60_000,
  )
})
