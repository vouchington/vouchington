import { describe, expect, it } from 'vitest'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { insertTestCommunity, insertTestCommunityMember } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  callStructuredMcpTool,
  expectMcpToolFunctionThrows,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
import { participateInCommunityGroup } from './participate-in-community.mts'

const TOOL = 'participate_in_community'
const SCOPES = ['communities:read', 'communities:write'] as const

async function threadFixture() {
  const subject = await createTestPlusMcpCaller()
  const community = await insertTestCommunity({ createdById: subject.id })
  await insertTestCommunityMember({ communityId: community.id, userId: subject.id, role: 'owner' })
  const request = createRequest()
  await request.authenticateAs(subject)
  const response = await request
    .post(`/api/v1/communities/${community.slug}/modmail`)
    .send({})
    .expect(201)
  return { subject, community, conversationId: response.body.thread.id as string }
}

function replyArgs(communityId: string, conversationId: string, text: string) {
  return optionArgs('reply_modmail', { community_id: communityId, conversationId, text })
}

describe('participate_in_community modmail body limits and REST authorization parity', () => {
  it('rejects oversized open_modmail bodies after checking membership', async () => {
    const subject = await createTestPlusMcpCaller()
    const community = await insertTestCommunity({ createdById: subject.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: subject.id,
      role: 'owner',
    })
    const subjectUserId = 'x'.repeat(10 * 1024)
    // The merged envelope bounds subject references; exercise the option's body guard directly.
    const open = participateInCommunityGroup.options.find(
      entry => entry.option === 'open_modmail',
    )!.source
    await expect(
      open.function(subject)({ community_id: community.slug, subject_user_id: subjectUserId }),
    ).rejects.toMatchObject({ status: 413, message: 'Request entity too large' })
    const outsider = await createTestPlusMcpCaller()
    const rest = createRequest()
    await rest.authenticateAs(outsider)
    await rest
      .post(`/api/v1/communities/${community.slug}/modmail`)
      .send({ subject_user_id: subjectUserId })
      .expect(403)
    await expect(
      open.function(outsider)({ community_id: community.slug, subject_user_id: subjectUserId }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'You must be a community member to open a modmail thread',
    })
  })

  it('accepts a reply whose serialized REST body is exactly 10 KB', async () => {
    const { subject, community, conversationId } = await threadFixture()
    const text = 'x'.repeat(10 * 1024 - JSON.stringify({ text: '' }).length)
    expect(JSON.stringify({ text })).toHaveLength(10 * 1024)
    await callStructuredMcpTool(
      subject,
      TOOL,
      replyArgs(community.slug, conversationId, text),
      SCOPES,
    )
    const request = createRequest()
    await request.authenticateAs(subject)
    const response = await request
      .get(`/api/v1/communities/${community.slug}/modmail/${conversationId}/messages`)
      .expect(200)
    expect(response.body.results).toContainEqual(
      expect.objectContaining({ body_text: text, created_by_id: subject.id }),
    )
  })

  it('rejects a non-participant before reading an oversized reply, matching REST', async () => {
    const { community, conversationId } = await threadFixture()
    const outsider = await createTestPlusMcpCaller()
    const text = 'x'.repeat(10 * 1024)
    const rest = createRequest()
    await rest.authenticateAs(outsider)
    await rest
      .post(`/api/v1/communities/${community.slug}/modmail/${conversationId}/messages`)
      .send({ text })
      .expect(403)
    await expectMcpToolFunctionThrows(
      outsider,
      TOOL,
      replyArgs(community.slug, conversationId, text),
      {
        status: 403,
        message: 'Access denied',
      },
    )
  })
})
