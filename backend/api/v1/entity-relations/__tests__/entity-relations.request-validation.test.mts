import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  insertTestPost,
  insertTestTopic,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const suffix = () => randomUUID().slice(0, 8)

describe('entity-relations routes - request contract validation', () => {
  let author: PrivateUser
  let postId: string
  let topicId: string
  let relationsPath: string

  beforeAll(async () => {
    author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    postId = await insertTestPost({
      title: `Validation ${suffix()}`,
      slug: `validation-${suffix()}`,
      createdById: author.id,
      markdown: 'Validation body',
    })
    topicId = await insertTestTopic({
      name: `Validation ${suffix()}`,
      slug: `validation-${suffix()}`,
      topicType: 'card',
      createdById: author.id,
    })
    relationsPath = `/api/v1/entity-relations/post/${postId}/category/topic`
  }, 60_000)

  describe('GET', () => {
    it('returns 401 without a diagnostic for an anonymous user-subject read with a malformed query', async () => {
      const response = await createRequest()
        .get(`/api/v1/entity-relations/user/${author.id}/category/topic`)
        .query({ sort: 'oldest', positiveNetVoteScore: 'maybe' })
        .expect(401)
      expect(response.body.message).toBe('Unauthorized')
    })

    it.each([
      ['an unknown sort', { sort: 'oldest' }],
      ['a non-boolean positiveNetVoteScore', { positiveNetVoteScore: 'maybe' }],
      ['a non-boolean summary', { summary: 'maybe' }],
      ['a repeated cursor', { after: ['a', 'b'] }],
    ])('returns 422 for %s', async (_name, query) => {
      await createRequest().get(relationsPath).query(query).expect(422)
    })

    it.each([
      ['a non-numeric limit', { limit: 'abc' }],
      ['a non-numeric minNetVoteScore', { minNetVoteScore: 'abc' }],
    ])('keeps the parser 400 for %s', async (_name, query) => {
      await createRequest().get(relationsPath).query(query).expect(400)
    })

    it('keeps clamping an out-of-range limit instead of rejecting it', async () => {
      await createRequest().get(relationsPath).query({ limit: 0 }).expect(200)
      await createRequest().get(relationsPath).query({ limit: 5000 }).expect(200)
    })
  })

  describe('POST', () => {
    it('returns 401 without a diagnostic for an anonymous caller with a malformed body', async () => {
      const response = await createRequest()
        .post(relationsPath)
        .send({ objectId: 5, extra: true })
        .expect(401)
      expect(response.body.message).toBe('Unauthorized')
    })

    it.each([
      ['a non-string objectId', { objectId: 5 }],
      ['an unknown field', { objectId: randomUUID(), extra: true }],
      ['an array body', []],
    ])('returns 422 for %s without creating a relation', async (_name, body) => {
      const request = createRequest()
      await request.authenticateAs(author)
      await request.post(relationsPath).send(body).expect(422)

      const listed = await request.get(relationsPath).expect(200)
      expect(listed.body.results).toHaveLength(0)
    })

    it('keeps the semantic 400 for a missing objectId', async () => {
      const request = createRequest()
      await request.authenticateAs(author)
      await request.post(relationsPath).send({}).expect(400)
    })

    it('still creates a relation for a valid body', async () => {
      const otherPostId = await insertTestPost({
        title: `Validation ${suffix()}`,
        slug: `validation-${suffix()}`,
        createdById: author.id,
        markdown: 'Validation body',
      })
      const request = createRequest()
      await request.authenticateAs(author)
      await request
        .post(`/api/v1/entity-relations/post/${otherPostId}/category/topic`)
        .send({ objectId: topicId })
        .expect(201)
    })
  })
})
