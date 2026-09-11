import { describe, it, expect, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { createUnlinkedTopicAlias } from '@services/topics/aliases'
import { getTopicIdByAnyCached } from '@services/entity-cache/lookups'

describe('topics', () => {
  describe('Topics Collection Routes', () => {
    let user: PrivateUser

    let admin: PrivateUser

    beforeAll(async () => {
      user = await createTestUser({ administrator: true })
      admin = user // In this file, user needs admin permissions for some tests
    })

    describe('POST /api/v1/topics', () => {
      it('should create a new topic when user is admin', async () => {
        const request = createRequest()
        await request.authenticateAs(admin!)

        const random = Math.random().toString(36).slice(2, 8)
        const slug = `new-topic-${random}`
        const name = `New Topic ${random}`
        const response = await request.post('/api/v1/topics').send({ name, slug }).expect(201)

        expect(response.body.topic).toHaveProperty('id')
        expect(response.body.topic.name).toBe(name)
        expect(response.body.topic).toHaveProperty('created_by')
        expect(response.body.topic.created_by).toHaveProperty('id')
      })

      it('should return 401 when not authenticated', async () => {
        const request = createRequest()
        await request
          .post('/api/v1/topics')
          .send({
            name: 'New Topic',
            slug: 'new-topic',
          })
          .expect(401)
      })

      it('should return 403 when user is not admin', async () => {
        const nonAdminUser = await createTestUser()
        const request = createRequest()
        await request.authenticateAs(nonAdminUser!)

        const random = Math.random().toString(36).slice(2, 8)
        await request
          .post('/api/v1/topics')
          .send({
            name: `New Topic ${random}`,
            slug: `new-topic-403-${random}`,
          })
          .expect(403)
      })

      it('rejects a suspended administrator before claiming a source alias', async () => {
        const suspendedAdmin = await createTestUser({ administrator: true })
        const suffix = Math.random().toString(36).slice(2, 10)
        const alias = await createUnlinkedTopicAlias(`suspended-create-${suffix}`)
        await suspendTestUser(suspendedAdmin.id)
        const request = createRequest()
        await request.authenticateAs(suspendedAdmin)

        try {
          const response = await request
            .post('/api/v1/topics')
            .send({
              name: `Suspended topic ${suffix}`,
              slug: `suspended-topic-${suffix}`,
              source_topic_alias_id: alias.id,
            })
            .expect(403)

          expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
          await expect(getTopicIdByAnyCached(alias.alias)).resolves.toBeNull()
        } finally {
          await unsuspendTestUser(suspendedAdmin.id)
        }
      })

      it('should return 415 for non-JSON content type', async () => {
        const request = createRequest()
        await request.authenticateAs(admin!)

        await request.post('/api/v1/topics').send('not json').expect(415)
      })

      it('should return 422 when topic_type is rss_feed', async () => {
        const request = createRequest()
        await request.authenticateAs(admin!)

        const random = Math.random().toString(36).slice(2, 8)
        const response = await request
          .post('/api/v1/topics')
          .send({ name: `RSS Feed ${random}`, slug: `rss-feed-${random}`, topic_type: 'rss_feed' })
          .expect(422)
        expect(response.body.message).toMatch('Source topics can only be created')
      })

      it('should return 422 when topic_type is fediverse_instance', async () => {
        const request = createRequest()
        await request.authenticateAs(admin!)

        const random = Math.random().toString(36).slice(2, 8)
        const response = await request
          .post('/api/v1/topics')
          .send({
            name: `Instance ${random}`,
            slug: `instance-${random}`,
            topic_type: 'fediverse_instance',
          })
          .expect(422)
        expect(response.body.message).toMatch('Instance topics can only be created')
      })

      it('rejects a malformed source hashtag alias ID', async () => {
        const request = createRequest()
        await request.authenticateAs(admin!)

        await request
          .post('/api/v1/topics')
          .send({
            name: 'Malformed source alias',
            slug: `malformed-source-alias-${Math.random().toString(36).slice(2, 8)}`,
            source_topic_alias_id: 'not-a-uuid',
          })
          .expect(422)
      })
    })
  })
})
