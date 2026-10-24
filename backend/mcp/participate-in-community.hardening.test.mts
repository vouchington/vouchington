import { describe, expect, it } from 'vitest'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  insertTestCommunity,
  insertTestCommunityMember,
  removeTestCommunityMember,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import type { PrivateUser } from '@services/users/types'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  expectMcpToolFunctionThrows,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'

const TOOL = 'participate_in_community'
const SCOPES = ['communities:read', 'communities:write'] as const

async function threadFixture() {
  const owner = await createTestPlusMcpCaller()
  const moderator = await createTestPlusMcpCaller()
  const subject = await createTestPlusMcpCaller()
  const community = await insertTestCommunity({ createdById: owner.id })
  await Promise.all([
    insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
    insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    }),
    insertTestCommunityMember({ communityId: community.id, userId: subject.id }),
  ])
  const open = createRequest()
  await open.authenticateAs(subject)
  const response = await open
    .post(`/api/v1/communities/${community.slug}/modmail`)
    .send({})
    .expect(201)
  return { owner, moderator, subject, community, conversationId: response.body.thread.id as string }
}

function replyArgs(communityId: string, conversationId: string, text: string) {
  return optionArgs('reply_modmail', { community_id: communityId, conversationId, text })
}

async function readMessages(user: PrivateUser, communitySlug: string, conversationId: string) {
  const request = createRequest()
  await request.authenticateAs(user)
  return request
    .get(`/api/v1/communities/${communitySlug}/modmail/${conversationId}/messages`)
    .expect(200)
}

describe('participate_in_community(reply_modmail) — REST twin and real PostgreSQL', () => {
  it('rejects a reply whose serialized REST body exceeds 10 KB', async () => {
    const { subject, community, conversationId } = await threadFixture()
    const text = 'x'.repeat(10 * 1024)
    await expectMcpToolFunctionThrows(
      subject,
      TOOL,
      replyArgs(community.slug, conversationId, text),
      { status: 413, message: 'Request entity too large' },
    )
    expect((await readMessages(subject, community.slug, conversationId)).body.results).toEqual([])
  })

  it('persists member, moderator, and subject replies across REST and MCP, including after removal', async () => {
    const { subject, community, conversationId } = await threadFixture()
    const mcpText = `MCP member reply ${crypto.randomUUID()}`
    const mcpResult = await callStructuredMcpTool(
      subject,
      TOOL,
      replyArgs(community.slug, conversationId, mcpText),
      SCOPES,
    )
    const mcpMessage = mcpResult.message as Record<string, unknown>
    expect(mcpMessage).toMatchObject({
      conversation_id: conversationId,
      created_by_id: subject.id,
    })
    expect(mcpMessage.body_text).toEqual(expect.stringContaining('<external-content'))
    expect(
      (await readMessages(subject, community.slug, conversationId)).body.results,
    ).toContainEqual(
      expect.objectContaining({
        id: mcpMessage.id,
        body_text: mcpText,
        created_by_id: subject.id,
      }),
    )

    const restText = `REST member reply ${crypto.randomUUID()}`
    const rest = createRequest()
    await rest.authenticateAs(subject)
    const restResponse = await rest
      .post(`/api/v1/communities/${community.slug}/modmail/${conversationId}/messages`)
      .send({ text: restText })
      .expect(201)
    expect(restResponse.body.message).toMatchObject({
      conversation_id: conversationId,
      body_text: restText,
      created_by_id: subject.id,
    })

    // This moderator joined after the thread was opened, so the reply path must admit them.
    const lateModerator = await createTestPlusMcpCaller()
    await insertTestCommunityMember({
      communityId: community.id,
      userId: lateModerator.id,
      role: 'moderator',
    })
    const lateRestText = `Late moderator REST reply ${crypto.randomUUID()}`
    const lateRest = createRequest()
    await lateRest.authenticateAs(lateModerator)
    await lateRest
      .post(`/api/v1/communities/${community.slug}/modmail/${conversationId}/messages`)
      .send({ text: lateRestText })
      .expect(201)
    expect(
      (await readMessages(subject, community.slug, conversationId)).body.results,
    ).toContainEqual(
      expect.objectContaining({ body_text: lateRestText, created_by_id: lateModerator.id }),
    )

    const laterModerator = await createTestPlusMcpCaller()
    await insertTestCommunityMember({
      communityId: community.id,
      userId: laterModerator.id,
      role: 'moderator',
    })
    const lateMcpText = `Late moderator MCP reply ${crypto.randomUUID()}`
    const lateMcp = await callStructuredMcpTool(
      laterModerator,
      TOOL,
      replyArgs(community.id, conversationId, lateMcpText),
      SCOPES,
    )
    expect((lateMcp.message as Record<string, unknown>).body_text).toEqual(
      expect.stringContaining('<external-content'),
    )
    expect(
      (await readMessages(subject, community.slug, conversationId)).body.results,
    ).toContainEqual(
      expect.objectContaining({ body_text: lateMcpText, created_by_id: laterModerator.id }),
    )

    await removeTestCommunityMember(community.id, subject.id)
    const removedSubjectText = `Removed subject reply ${crypto.randomUUID()}`
    await callStructuredMcpTool(
      subject,
      TOOL,
      replyArgs(community.slug, conversationId, removedSubjectText),
      SCOPES,
    )
    const removedSubjectRest = createRequest()
    await removedSubjectRest.authenticateAs(subject)
    await removedSubjectRest
      .post(`/api/v1/communities/${community.slug}/modmail/${conversationId}/messages`)
      .send({ text: `${removedSubjectText} REST` })
      .expect(201)
    expect((await readMessages(subject, community.slug, conversationId)).body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ body_text: removedSubjectText, created_by_id: subject.id }),
        expect.objectContaining({
          body_text: `${removedSubjectText} REST`,
          created_by_id: subject.id,
        }),
      ]),
    )
  })

  it('hides cross-community threads, rejects unrelated users, and blocks resolved or suspended replies', async () => {
    const { moderator, subject, community, conversationId } = await threadFixture()
    const otherOwner = await createTestPlusMcpCaller()
    const otherMod = await createTestPlusMcpCaller()
    const outsider = await createTestPlusMcpCaller()
    const otherCommunity = await insertTestCommunity({ createdById: otherOwner.id })
    await Promise.all([
      insertTestCommunityMember({
        communityId: otherCommunity.id,
        userId: otherOwner.id,
        role: 'owner',
      }),
      insertTestCommunityMember({
        communityId: otherCommunity.id,
        userId: otherMod.id,
        role: 'moderator',
      }),
    ])

    const before = (await readMessages(subject, community.slug, conversationId)).body.results
    const crossArgs = replyArgs(otherCommunity.slug, conversationId, `Cross ${crypto.randomUUID()}`)
    const crossRequest = createRequest()
    await crossRequest.authenticateAs(otherMod)
    await crossRequest
      .post(`/api/v1/communities/${otherCommunity.slug}/modmail/${conversationId}/messages`)
      .send({ text: `Cross REST ${crypto.randomUUID()}` })
      .expect(404)
    await expectMcpToolFunctionThrows(otherMod, TOOL, crossArgs, {
      status: 404,
      message: 'Modmail thread not found',
    })

    const outsiderArgs = replyArgs(
      community.slug,
      conversationId,
      `Outsider ${crypto.randomUUID()}`,
    )
    const outsiderRequest = createRequest()
    await outsiderRequest.authenticateAs(outsider)
    await outsiderRequest
      .post(`/api/v1/communities/${community.slug}/modmail/${conversationId}/messages`)
      .send({ text: `Outsider REST ${crypto.randomUUID()}` })
      .expect(403)
    await expectMcpToolFunctionThrows(outsider, TOOL, outsiderArgs, {
      status: 403,
      message: 'Access denied',
    })

    const resolve = createRequest()
    await resolve.authenticateAs(moderator)
    await resolve
      .patch(`/api/v1/communities/${community.slug}/modmail/${conversationId}`)
      .send({ resolved: true })
      .expect(200)
    const resolvedArgs = replyArgs(
      community.slug,
      conversationId,
      `Resolved ${crypto.randomUUID()}`,
    )
    const resolvedRequest = createRequest()
    await resolvedRequest.authenticateAs(subject)
    await resolvedRequest
      .post(`/api/v1/communities/${community.slug}/modmail/${conversationId}/messages`)
      .send({ text: `Resolved REST ${crypto.randomUUID()}` })
      .expect(409)
    await expectMcpToolFunctionThrows(subject, TOOL, resolvedArgs, {
      status: 409,
      message: 'Thread is resolved; resolve must be undone before replying',
    })

    await suspendTestUser(moderator.id)
    try {
      const suspendedArgs = replyArgs(
        community.slug,
        conversationId,
        `Suspended ${crypto.randomUUID()}`,
      )
      const suspendedRequest = createRequest()
      await suspendedRequest.authenticateAs(moderator)
      await suspendedRequest
        .post(`/api/v1/communities/${community.slug}/modmail/${conversationId}/messages`)
        .send({ text: `Suspended REST ${crypto.randomUUID()}` })
        .expect(403)
      expect(await callRejectedMcpTool(moderator, TOOL, suspendedArgs, SCOPES)).toContain(
        'suspended',
      )
    } finally {
      await unsuspendTestUser(moderator.id)
    }
    expect((await readMessages(subject, community.slug, conversationId)).body.results).toEqual(
      before,
    )
  })
})
