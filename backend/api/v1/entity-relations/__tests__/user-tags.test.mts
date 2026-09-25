import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserDirect,
  createTestUserWithAge,
  createRandomEmailAddress,
  createRandomPhoneNumber,
  insertTestLocalFollow,
  insertTestTopic,
  readAllQueueJobs,
  suspendTestUser,
} from '@voucha/test-helpers'
import { getUserTagTopics } from '@services/topics/user-tag-topics'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { getEntityRelations } from '@services/entity-relations/query'
import { elections } from '@queues/elections/queues'
import { SYSTEM_ENTITY_RELATION_VIEWER } from '@services/entity-relations/viewer'

describe('user tag entity relations', () => {
  it('requires authentication to list user tags', async () => {
    const target = await createTestUser()
    await createRequest()
      .get(`/api/v1/entity-relations/user/${target.id}/category/topic`)
      .expect(401)
    await createRequest().get('/api/v1/topics/user-tags').expect(401)
  })

  it('allows an eligible user to add a curated tag to another user', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUser()
    const [tag] = await getUserTagTopics()
    expect(tag).toBeDefined()
    const request = createRequest()
    await request.authenticateAs(voter)

    const response = await request
      .post(`/api/v1/entity-relations/user/${target.username}/category/topic`)
      .send({ objectId: tag!.id })
      .expect(201)

    expect(response.body.relation).toMatchObject({
      subject_id: target.id,
      object_id: tag!.id,
      votes_count_up: 1,
      votes_score_net: 1,
      object_data: expect.objectContaining({ id: tag!.id, name: tag!.label }),
    })
    await expect(getQueuedElectionJobs(response.body.relation.id)).resolves.toEqual([])
  })

  it('rejects a suspended user-tag voter', async () => {
    const admin = await createTestUser({ administrator: true })
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUser()
    const [tag] = await getUserTagTopics()
    const adminRequest = createRequest()
    await adminRequest.authenticateAs(admin)
    const created = await adminRequest
      .post(`/api/v1/entity-relations/user/${target.id}/category/topic`)
      .send({ objectId: tag!.id })
      .expect(201)
    await suspendTestUser(voter.id)
    const voterRequest = createRequest()
    await voterRequest.authenticateAs(voter)

    await voterRequest
      .put(`/api/v1/entity-relations/${created.body.relation.id}/vote`)
      .send({ choice: 'confirm' })
      .expect(403)
  })

  it('rejects registered and unregistered contact identifiers identically', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUserDirect({ withEmail: true, phone_number: true })
    const [tag] = await getUserTagTopics()
    const request = createRequest()
    await request.authenticateAs(voter)

    for (const identifier of [
      target.email_address!,
      createRandomEmailAddress(),
      target.phone_number!,
      createRandomPhoneNumber(),
    ]) {
      await request
        .post(`/api/v1/entity-relations/user/${encodeURIComponent(identifier)}/category/topic`)
        .send({ objectId: tag!.id })
        .expect(422)
    }
  })

  it('does not change follow or mute relations when adding a user tag', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUser()
    await insertTestLocalFollow(voter.id, target.id)
    const [tag] = await getUserTagTopics()
    const request = createRequest()
    await request.authenticateAs(voter)

    const created = await request
      .post(`/api/v1/entity-relations/user/${target.id}/category/topic`)
      .send({ objectId: tag!.id })
      .expect(201)
    await request
      .put(`/api/v1/entity-relations/${created.body.relation.id}/vote`)
      .send({ choice: 'dispute' })
      .expect(204)
    await expect(getQueuedElectionJobs(created.body.relation.id)).resolves.toEqual([])

    await expect(
      getEntityRelations('user', voter.id, 'follow', 'user', {
        viewer: SYSTEM_ENTITY_RELATION_VIEWER,
      }),
    ).resolves.toHaveLength(1)
    await expect(
      getEntityRelations('user', voter.id, 'mute', 'user', {
        viewer: SYSTEM_ENTITY_RELATION_VIEWER,
      }),
    ).resolves.toHaveLength(0)
  })

  it('rejects self tagging', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const [tag] = await getUserTagTopics()
    const request = createRequest()
    await request.authenticateAs(voter)
    await request
      .post(`/api/v1/entity-relations/user/${voter.id}/category/topic`)
      .send({ objectId: tag!.id })
      .expect(403)
  })

  it('rejects non-curated tag topics', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Arbitrary user tag ${randomUUID()}`,
      slug: `arbitrary-user-tag-${randomUUID()}`,
      createdById: voter.id,
    })
    const request = createRequest()
    await request.authenticateAs(voter)
    await request
      .post(`/api/v1/entity-relations/user/${target.id}/category/topic`)
      .send({ objectId: topicId })
      .expect(422)
  })

  it('rejects non-curated user tags at the service boundary', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Service arbitrary user tag ${randomUUID()}`,
      slug: `service-arbitrary-user-tag-${randomUUID()}`,
      createdById: voter.id,
    })
    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      predicate: 'category',
      objectType: 'topic',
    })

    await expect(
      upsertEntityRelation(voter, metadata, { id: target.id }, [{ id: topicId }]),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('allows administrators to add and vote on user tags as moderation', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser()
    const [tag] = await getUserTagTopics()
    const request = createRequest()
    await request.authenticateAs(admin)
    const created = await request
      .post(`/api/v1/entity-relations/user/${target.id}/category/topic`)
      .send({ objectId: tag!.id })
      .expect(201)

    await request
      .put(`/api/v1/entity-relations/${created.body.relation.id}/vote`)
      .send({ choice: 'dispute' })
      .expect(204)
  })
})

async function getQueuedElectionJobs(relationId: string) {
  const jobs = await readAllQueueJobs(elections)
  return jobs.filter(job => (job.data as { electionId?: string }).electionId === relationId)
}
