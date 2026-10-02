import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  readTestContentProvenance,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

const SWIFT_CLIENT = { 'x-voucha-client': 'swift', 'x-voucha-platform': 'ios' }

describe('POST /api/v1/communities/:idOrSlug/modmail/:conversationId/messages provenance', () => {
  let mod: PrivateUser
  let community: Community

  beforeAll(async () => {
    const owner = await createTestUser()
    mod = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({ communityId: community.id, userId: mod.id, role: 'moderator' }),
    ])
  })

  // A member has one modmail thread per community, so each test opens it with a new member.
  async function openThread() {
    const member = await createTestUser()
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member.id,
      role: 'member',
    })
    const request = createRequest()
    await request.authenticateAs(member)
    const response = await request
      .post(`/api/v1/communities/${community.slug}/modmail`)
      .send({})
      .expect(201)
    const path = `/api/v1/communities/${community.slug}/modmail/${response.body.thread.id as string}/messages`
    return { member, path }
  }

  async function signedInAs(user: PrivateUser, clientHeaders: Record<string, string> = {}) {
    const request = createRequest()
    request.setClientInfo(clientHeaders)
    await request.authenticateAs(user)
    return request
  }

  it('stores the channel each participant wrote through and exposes none', async () => {
    const { member, path } = await openThread()
    const memberRequest = await signedInAs(member)
    const modRequest = await signedInAs(mod, SWIFT_CLIENT)

    const fromMember = await memberRequest.post(path).send({ text: 'Question' }).expect(201)
    const fromMod = await modRequest.post(path).send({ text: 'Answer' }).expect(201)

    await expect(
      readTestContentProvenance('conversation_messages', fromMember.body.message.id),
    ).resolves.toEqual({ createdVia: 'web', oauthClientId: null })
    await expect(
      readTestContentProvenance('conversation_messages', fromMod.body.message.id),
    ).resolves.toEqual({ createdVia: 'swift', oauthClientId: null })
    const listed = await modRequest.get(path).expect(200)
    expect(listed.body.results).toHaveLength(2)
    expect(JSON.stringify({ fromMember: fromMember.body, fromMod: fromMod.body })).not.toMatch(
      /created_?via|oauth/i,
    )
    expect(JSON.stringify(listed.body)).not.toMatch(/created_?via|oauth/i)
  })

  it('rejects a message whose client information is invalid and stores nothing', async () => {
    const { path } = await openThread()
    const request = await signedInAs(mod, { 'x-voucha-client': 'unclassified-client' })

    const response = await request.post(path).send({ text: 'Answer' }).expect(400)

    expect(response.body.code).toBe('INVALID_CLIENT_INFO')
    const listed = await (await signedInAs(mod)).get(path).expect(200)
    expect(listed.body.results).toEqual([])
  })
})
