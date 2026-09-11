import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserDirect,
  createTestUserWithAge,
  suspendTestUser,
} from '@voucha/test-helpers'
import { getUserTagTopics } from '@services/topics/user-tag-topics'
import {
  getEntityRelationElectionVote,
  upsertEntityRelationElectionVotes,
} from '@services/elections-votes/entity-relation'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { softDeleteEntityRelation } from '@services/entity-relations/delete'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { deleteUserAndDrainForTest } from '@services/users/delete-test-support'
import { getEntityRelations } from '@services/entity-relations/query'
import { updateEntityRelationElectionVoteStatsFromPrimary } from '@services/elections-votes/entity-relation/vote-stats'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'

describe('user tag authorization and voting', () => {
  it('returns the curated catalog in its fixed order', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/topics/user-tags').expect(200)

    expect(response.body.user_tags.map((tag: { slug: string }) => tag.slug)).toEqual([
      'bot',
      'spammer',
    ])
  })

  it('rejects ineligible and ordinary official users', async () => {
    const ineligible = await createTestUserDirect()
    const official = await createTestUserDirect({ withEmail: true, extraRoles: ['investor'] })
    const target = await createTestUser()
    const [tag] = await getUserTagTopics()

    for (const actor of [ineligible, official]) {
      const request = createRequest()
      await request.authenticateAs(actor)
      await request
        .post(`/api/v1/entity-relations/user/${target.id}/category/topic`)
        .send({ objectId: tag!.id })
        .expect(403)
    }
  })

  it('rejects ineligible, ordinary official, and self-target user-tag votes', async () => {
    const admin = await createTestUser({ administrator: true })
    const ineligible = await createTestUserDirect()
    const official = await createTestUserDirect({ withEmail: true, extraRoles: ['investor'] })
    const selfTarget = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const [tag] = await getUserTagTopics()
    const adminRequest = createRequest()
    await adminRequest.authenticateAs(admin)
    const targetRelation = await adminRequest
      .post(`/api/v1/entity-relations/user/${selfTarget.id}/category/topic`)
      .send({ objectId: tag!.id })
      .expect(201)

    for (const actor of [ineligible, official, selfTarget]) {
      const request = createRequest()
      await request.authenticateAs(actor)
      await request
        .put(`/api/v1/entity-relations/${targetRelation.body.relation.id}/vote`)
        .send({ choice: 'dispute' })
        .expect(403)
    }
  })

  it('rejects missing and suspended targets for adds', async () => {
    const admin = await createTestUser({ administrator: true })
    const suspended = await createTestUser()
    await suspendTestUser(suspended.id)
    const [tag] = await getUserTagTopics()
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .post(`/api/v1/entity-relations/user/${randomUUID()}/category/topic`)
      .send({ objectId: tag!.id })
      .expect(404)
    await request
      .post(`/api/v1/entity-relations/user/${suspended.id}/category/topic`)
      .send({ objectId: tag!.id })
      .expect(403)
  })

  it.each(['follow/user', 'mute/user', 'block/user', 'save/post'])(
    'keeps user %s relations out of the generic API',
    async tuple => {
      const user = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(user)
      await request.get(`/api/v1/entity-relations/user/${user.id}/${tuple}`).expect(400)
    },
  )

  it('supports duplicate and concurrent adds without creating multiple relations', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUser()
    const [tag] = await getUserTagTopics()
    const add = async () => {
      const request = createRequest()
      await request.authenticateAs(voter)
      return request
        .post(`/api/v1/entity-relations/user/${target.id}/category/topic`)
        .send({ objectId: tag!.id })
        .expect(201)
    }

    const responses = await Promise.all([add(), add(), add()])
    expect(new Set(responses.map(response => response.body.relation.id)).size).toBe(1)
  })

  it('reactivates a deleted user-tag relation', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser()
    const [tag] = await getUserTagTopics()
    const request = createRequest()
    await request.authenticateAs(admin)
    const first = await request
      .post(`/api/v1/entity-relations/user/${target.id}/category/topic`)
      .send({ objectId: tag!.id })
      .expect(201)
    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      predicate: 'category',
      objectType: 'topic',
    })
    await softDeleteEntityRelation(admin, metadata, target, [tag!])

    const reactivated = await request
      .post(`/api/v1/entity-relations/user/${target.id}/category/topic`)
      .send({ objectId: tag!.id })
      .expect(201)

    expect(reactivated.body.relation.id).toBe(first.body.relation.id)
    expect(reactivated.body.relation.deleted_at).toBeNull()
  })

  it('records dispute and confirm vote transitions and rejects voting on suspended targets', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser()
    const [tag] = await getUserTagTopics()
    const request = createRequest()
    await request.authenticateAs(admin)
    const created = await request
      .post(`/api/v1/entity-relations/user/${target.id}/category/topic`)
      .send({ objectId: tag!.id })
      .expect(201)
    const relationId = created.body.relation.id as string

    for (const choice of ['dispute', 'confirm'] as const) {
      await request.put(`/api/v1/entity-relations/${relationId}/vote`).send({ choice }).expect(204)
      await expect(getEntityRelationElectionVote(admin.id, relationId)).resolves.toMatchObject({
        choice,
      })
      const positive = await request
        .get(`/api/v1/entity-relations/user/${target.id}/category/topic`)
        .query({ positiveNetVoteScore: true })
        .expect(200)
      expect(positive.body.results).toHaveLength(choice === 'confirm' ? 1 : 0)
    }

    await request.delete(`/api/v1/entity-relations/${relationId}/vote`).expect(204)
    await expect(getEntityRelationElectionVote(admin.id, relationId)).resolves.toBeNull()

    await suspendTestUser(target.id)
    await request
      .put(`/api/v1/entity-relations/${relationId}/vote`)
      .send({ choice: 'dispute' })
      .expect(403)
  })

  it('allows an official account to clear its historical user-tag ballot', async () => {
    const admin = await createTestUser({ administrator: true })
    const historicalVoter = await createTestUserDirect({
      withEmail: true,
      extraRoles: ['investor'],
    })
    const target = await createTestUser()
    const [tag] = await getUserTagTopics()
    const adminRequest = createRequest()
    await adminRequest.authenticateAs(admin)
    const created = await adminRequest
      .post(`/api/v1/entity-relations/user/${target.id}/category/topic`)
      .send({ objectId: tag!.id })
      .expect(201)
    const relationId = created.body.relation.id as string

    await upsertEntityRelationElectionVotes(historicalVoter.id, [
      { entityId: relationId, score: 1 },
    ])

    const request = createRequest()
    await request.authenticateAs(historicalVoter)
    await request.delete(`/api/v1/entity-relations/${relationId}/vote`).expect(204)
    await expect(getEntityRelationElectionVote(historicalVoter.id, relationId)).resolves.toBeNull()
  })

  it('removes entity-relation votes cast by a deleted user', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUser()
    const [tag] = await getUserTagTopics()
    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      predicate: 'category',
      objectType: 'topic',
    })
    const [relation] = await upsertEntityRelation(voter, metadata, target, [tag!])
    await expect(getEntityRelationElectionVote(voter.id, relation!.id!)).resolves.toMatchObject({
      choice: 'confirm',
    })
    await updateEntityRelationElectionVoteStatsFromPrimary(
      createEntityRelationElectionTarget(relation!.id!, 'relation__user__category__topic'),
    )
    await expect(getEntityRelations('user', target.id, 'category', 'topic')).resolves.toEqual([
      expect.objectContaining({ id: relation!.id, votes_count_up: 1, votes_score_net: 1 }),
    ])

    await deleteUserAndDrainForTest(voter, voter)

    await expect(getEntityRelationElectionVote(voter.id, relation!.id!)).resolves.toBeNull()
    await expect(getEntityRelations('user', target.id, 'category', 'topic')).resolves.toEqual([
      expect.objectContaining({ id: relation!.id, votes_count_up: 0, votes_score_net: 0 }),
    ])
  })
})
