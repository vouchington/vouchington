import { beforeAll, describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  archiveTestCommunity,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createConversation } from '@services/conversations-messages/create'
import type { PrivateUser } from '@services/users/types'

describe('typed request bodies reject unknown fields after authorization', () => {
  let owner: PrivateUser
  let outsider: PrivateUser
  let routes: { method: 'post' | 'patch' | 'put'; path: string; body: object }[]
  let archivedPath: string

  beforeAll(async () => {
    ;[owner, outsider] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request
      .post(`/api/v1/communities/${community.slug}/modmail`)
      .send({})
      .expect(201)
    const prefix = `/api/v1/communities/${community.slug}`
    const threadPath = `${prefix}/modmail/${response.body.thread.id as string}`
    const conversation = await createConversation(owner.id, 'Typed request body')
    routes = [
      { method: 'post', path: '/api/v1/communities', body: { name: 'Typed Request Community' } },
      { method: 'patch', path: prefix, body: { visibility: 'public' } },
      { method: 'post', path: `${prefix}/modmail`, body: {} },
      { method: 'patch', path: threadPath, body: { resolved: false } },
      { method: 'post', path: `${threadPath}/messages`, body: { text: 'Hello' } },
      { method: 'post', path: `${prefix}/saved-replies`, body: { title: 'Hello', body: 'Hello' } },
      {
        method: 'post',
        path: `${prefix}/warnings`,
        body: { userId: outsider.id, reason: 'Reason' },
      },
      { method: 'post', path: '/api/v1/conversations', body: { title: 'Hello' } },
      {
        method: 'post',
        path: `/api/v1/conversations/${conversation.id}/client-generated-chat`,
        body: {
          user_message_id: uuidv7(),
          assistant_message_id: uuidv7(),
          message: 'Hello',
          assistant_content: 'Hi',
          model_provider: 'apple_foundation',
        },
      },
      { method: 'put', path: '/api/v1/auth/oauth/google/connect', body: { credential: 'test' } },
    ]
    const archived = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: archived.id, userId: owner.id, role: 'owner' })
    await archiveTestCommunity({ communityId: archived.id, archivedById: owner.id })
    archivedPath = `/api/v1/communities/${archived.slug}`
  })

  it('returns validator 422 for unknown fields on each authorized route', async () => {
    const request = createRequest()
    await request.authenticateAs(owner)
    for (const { method, path, body } of routes) {
      const response = await request[method](path)
        .send({ ...body, unexpected: true })
        .expect(422)
      expect(response.body.message).toBe('Invalid request body')
    }
  })

  it('returns 401 for each authenticated route before diagnosing invalid bodies', async () => {
    for (const { method, path } of routes) {
      const response = await createRequest()[method](path).send({ unexpected: true }).expect(401)
      expect(response.body.message).toBe('Unauthorized')
    }
  })

  it('checks community permissions before invalid-field and archived-state diagnostics', async () => {
    const request = createRequest()
    await request.authenticateAs(outsider)
    for (const body of [
      null,
      { archive: 'yes' },
      { list_type: 'invalid' },
      { member_roster_visibility: 'invalid' },
      { archive: true },
      { archive: false, name: 'New Name' },
    ]) {
      const response = await request
        .patch(archivedPath)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(body))
        .expect(403)
      expect(response.body.message).toBe('Forbidden')
    }
  })

  it('diagnoses an invalid archived-community body with validator 422 before 409', async () => {
    const request = createRequest()
    await request.authenticateAs(owner)
    for (const body of [
      { archive: 'yes' },
      { list_type: 'invalid' },
      { member_roster_visibility: 'invalid' },
      { archive: true, unexpected: true },
      null,
    ]) {
      const response = await request
        .patch(archivedPath)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(body))
        .expect(422)
      expect(response.body.message).toBe('Invalid request body')
    }
  })
})
