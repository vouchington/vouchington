import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserWithAge,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { getTopicByAny } from '@services/topics'
import { getPostByAny } from '@services/posts'

describe('index.generated', () => {
  let user: PrivateUser
  let admin: PrivateUser

  beforeAll(async () => {
    user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    admin = await createTestUser({ administrator: true })
  })
  describe('Topic Recommendations API', () => {
    it('keeps topic recommendations out of the anonymous post list', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      const suffix = crypto.randomUUID()
      await request
        .post('/api/v1/posts')
        .send({
          post_type: 'topic_recommendation',
          markdown: 'Owned private recommendation',
          topic_title: suffix,
          topic_slug: `owned-${suffix}`,
        })
        .expect(201)
      const response = await createRequest()
        .get(`/api/v1/posts?post_types=topic_recommendation&creator=${user.id}`)
        .expect(200)
      expect(response.body.results).toEqual([])
    })

    it('rejects invalid list limits', async () => {
      const requestAsUser = createRequest()
      await requestAsUser.authenticateAs(user)

      await requestAsUser.get('/api/v1/posts?post_types=topic_recommendation&limit=wat').expect(400)
    })

    it('creates and lists a topic recommendation for logged-in users', async () => {
      const requestAsUser = createRequest()
      await requestAsUser.authenticateAs(user)

      const random = Math.random().toString(36).slice(2, 10)
      const slug = `topic-recommendation-${Date.now()}-${random}`
      const hostname = `${slug}.example.com`
      const topicTitle = `Test Topic Recommendation ${random}`
      const createResponse = await requestAsUser
        .post('/api/v1/posts')
        .send({
          post_type: 'topic_recommendation',
          title: 'Need this topic',
          markdown: 'People keep discussing this issuer but there is no topic yet.',
          topic_title: topicTitle,
          topic_slug: slug,
          topic_markdown: 'A proposed topic summary.',
          topic_hostname: hostname,
          topic_hostnames: [hostname],
          topic_aliases: [`topic-rec-alias-${random}`],
        })
        .expect(201)

      expect(createResponse.body.post.post_type).toBe('topic_recommendation')
      expect(createResponse.body.post.topic_recommendation.topic_slug).toBe(slug)
      const listResponse = await requestAsUser
        .get(`/api/v1/posts?post_types=topic_recommendation&q=${encodeURIComponent(random)}`)
        .expect(200)
      const found = listResponse.body.results.find(
        (result: { id: string }) => result.id === createResponse.body.post.id,
      )
      expect(found).toBeDefined()
      expect(
        listResponse.body.posts[createResponse.body.post.id].topic_recommendation.topic_title,
      ).toBe(topicTitle)
    })

    it('lists an authored pending recommendation in generic post search', async () => {
      const requestAsUser = createRequest()
      await requestAsUser.authenticateAs(user)

      const random = Math.random().toString(36).slice(2, 10)
      const slug = `generic-post-exclusion-${Date.now()}-${random}`
      const createResponse = await requestAsUser
        .post('/api/v1/posts')
        .send({
          post_type: 'topic_recommendation',
          markdown: 'This should stay in the dedicated queue only.',
          topic_title: `Hidden From Generic Posts ${random}`,
          topic_slug: slug,
        })
        .expect(201)
      const postsResponse = await requestAsUser.get(`/api/v1/posts?creator=${user.id}`).expect(200)
      const found = postsResponse.body.results.find(
        (result: { id: string }) => result.id === createResponse.body.post.id,
      )
      expect(found).toBeDefined()
      expect(postsResponse.body.posts[createResponse.body.post.id]?.post_type).toBe(
        'topic_recommendation',
      )

      await requestAsUser.get(`/api/v1/posts/${createResponse.body.post.id}`).expect(200)
    })

    it('lets admins approve a pending recommendation and create a topic', async () => {
      const requestAsAdmin = createRequest()
      await requestAsAdmin.authenticateAs(admin)

      const random = Math.random().toString(36).slice(2, 10)
      const slug = `approved-topic-${Date.now()}-${random}`
      const hostname = `${slug}.example.com`
      const approvedAliases = [1, 2, 3].map(index => `approved-topic-alias-${random}-${index}`)
      const createResponse = await requestAsAdmin
        .post('/api/v1/posts')
        .send({
          post_type: 'topic_recommendation',
          markdown: 'This one should be approved.',
          topic_title: `Approved Topic Recommendation ${random}`,
          topic_slug: slug,
          topic_markdown: 'Approved topic markdown.',
          topic_hostname: hostname,
          topic_hostnames: [hostname],
          topic_aliases: approvedAliases,
        })
        .expect(201)
      const approveResponse = await requestAsAdmin
        .post(`/api/v1/posts/${createResponse.body.post.id}/approvals`)
        .send({})
        .expect(200)

      expect(approveResponse.body.post.topic_recommendation.status).toBe('approved')
      expect(approveResponse.body.topic_id).toBeTruthy()

      const createdTopic = await getTopicByAny(approveResponse.body.topic_id)
      expect(createdTopic?.slug).toBe(slug)
      for (const alias of approvedAliases) expect(createdTopic?.aliases).toContain(alias)
    })

    it('lets the author withdraw a pending recommendation', async () => {
      const requestAsUser = createRequest()
      await requestAsUser.authenticateAs(user)

      const random = Math.random().toString(36).slice(2, 10)
      const createResponse = await requestAsUser
        .post('/api/v1/posts')
        .send({
          post_type: 'topic_recommendation',
          markdown: `Withdraw from API ${random}`,
          topic_title: `API Withdraw Topic ${random}`,
          topic_slug: `api-withdraw-topic-${Date.now()}-${random}`,
        })
        .expect(201)

      await requestAsUser.delete(`/api/v1/posts/${createResponse.body.post.id}`).expect(204)

      expect(await getPostByAny(createResponse.body.post.id)).toBeNull()
      const listResponse = await requestAsUser
        .get(`/api/v1/posts?post_types=topic_recommendation&q=${encodeURIComponent(random)}`)
        .expect(200)
      expect(
        listResponse.body.results.find(
          (result: { id: string }) => result.id === createResponse.body.post.id,
        ),
      ).toBeUndefined()
    })

    it('rejects withdraw attempts from non-owners or after review', async () => {
      const requestAsUser = createRequest()
      const requestAsAdmin = createRequest()
      const requestAsOther = createRequest()
      await requestAsUser.authenticateAs(user)
      await requestAsAdmin.authenticateAs(admin)

      const otherUser = await createTestUser()
      await requestAsOther.authenticateAs(otherUser)

      const random = Math.random().toString(36).slice(2, 10)
      const createResponse = await requestAsUser
        .post('/api/v1/posts')
        .send({
          post_type: 'topic_recommendation',
          markdown: `Protected API withdraw ${random}`,
          topic_title: `Protected API Withdraw ${random}`,
          topic_slug: `protected-api-withdraw-${Date.now()}-${random}`,
        })
        .expect(201)

      await requestAsOther.delete(`/api/v1/posts/${createResponse.body.post.id}`).expect(403)

      const approveResponse = await requestAsAdmin
        .post(`/api/v1/posts/${createResponse.body.post.id}/approvals`)
        .send({})
        .expect(200)

      await requestAsUser.delete(`/api/v1/posts/${approveResponse.body.post.id}`).expect(403)
    })

    it('lets admins withdraw a pending recommendation through the API', async () => {
      const requestAsUser = createRequest()
      const requestAsAdmin = createRequest()
      await requestAsUser.authenticateAs(user)
      await requestAsAdmin.authenticateAs(admin)

      const random = Math.random().toString(36).slice(2, 10)
      const createResponse = await requestAsUser
        .post('/api/v1/posts')
        .send({
          post_type: 'topic_recommendation',
          markdown: `Admin withdraw ${random}`,
          topic_title: `Admin Withdraw ${random}`,
          topic_slug: `admin-withdraw-${Date.now()}-${random}`,
        })
        .expect(201)

      await requestAsAdmin.delete(`/api/v1/posts/${createResponse.body.post.id}`).expect(204)

      expect(await getPostByAny(createResponse.body.post.id)).toBeNull()
    })

    it('rejects malformed topic payload arrays', async () => {
      const requestAsUser = createRequest()
      await requestAsUser.authenticateAs(user)

      await requestAsUser
        .post('/api/v1/posts')
        .send({
          post_type: 'topic_recommendation',
          markdown: 'Bad payload',
          topic_title: 'Bad payload topic',
          topic_slug: `bad-payload-${Date.now()}`,
          topic_hostnames: 'example.com',
        })
        .expect(422)
    })
  })
})
