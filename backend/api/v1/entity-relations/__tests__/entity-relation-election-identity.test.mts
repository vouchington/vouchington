import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createSameIdElectionRelations } from '@voucha/test-helpers/entities/entity-relation-election-collisions'

async function createFixture() {
  return createSameIdElectionRelations({
    postCategory: 3,
    topicRelated: 7,
    viewerVotes: { postCategory: 1, topicRelated: -1 },
  })
}

describe('entity-relation election identity', () => {
  it('assembles each relation table its own election and viewer vote for a shared UUID', async () => {
    const fixture = await createFixture()
    const request = createRequest()
    await request.authenticateAs(fixture.viewer)

    const postCategory = await request
      .get(`/api/v1/entity-relations/post/${fixture.postCategory.subjectId}/category/topic`)
      .expect(200)
    const topicRelated = await request
      .get(`/api/v1/entity-relations/topic/${fixture.topicRelated.subjectId}/related/post`)
      .expect(200)

    expect(postCategory.body.entity_relation_elections[fixture.id]).toMatchObject({
      id: fixture.id,
      votes_score_net: 3,
    })
    expect(topicRelated.body.entity_relation_elections[fixture.id]).toMatchObject({
      id: fixture.id,
      votes_score_net: 7,
    })
    expect(postCategory.body.election_votes[fixture.id]).toMatchObject({ choice: 'confirm' })
    expect(topicRelated.body.election_votes[fixture.id]).toMatchObject({ choice: 'dispute' })
  })

  it('serves the same election to anonymous viewers per relation table', async () => {
    const fixture = await createFixture()
    const request = createRequest()

    const postCategory = await request
      .get(`/api/v1/entity-relations/post/${fixture.postCategory.subjectId}/category/topic`)
      .expect(200)
    const topicRelated = await request
      .get(`/api/v1/entity-relations/topic/${fixture.topicRelated.subjectId}/related/post`)
      .expect(200)

    expect(postCategory.body.entity_relation_elections[fixture.id].votes_score_net).toBe(3)
    expect(topicRelated.body.entity_relation_elections[fixture.id].votes_score_net).toBe(7)
    expect(postCategory.body.election_votes).toBeUndefined()
  })

  it('rejects a bare-id vote route for a UUID shared by two relation tables', async () => {
    const fixture = await createFixture()
    const request = createRequest()
    await request.authenticateAs(fixture.viewer)

    await request
      .put(`/api/v1/entity-relations/${fixture.id}/vote`)
      .send({ choice: 'confirm' })
      .expect(409)
    await request.delete(`/api/v1/entity-relations/${fixture.id}/vote`).expect(409)
    await request.get(`/api/v1/entity-relations/${fixture.id}/votes`).expect(409)
  })

  it('still resolves a bare-id route for a UUID held by one relation table', async () => {
    const fixture = await createFixture()
    const request = createRequest()
    await request.authenticateAs(fixture.viewer)

    const votes = await request
      .get(`/api/v1/entity-relations/${fixture.uniqueTopicRelatedId}/votes`)
      .expect(200)

    expect(votes.body.results).toEqual([])
    await request.get(`/api/v1/entity-relations/${crypto.randomUUID()}/votes`).expect(404)
  })
})
