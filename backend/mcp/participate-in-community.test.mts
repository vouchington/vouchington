import { describe, expect, it } from 'vitest'
import {
  archiveTestCommunity,
  createTestUser,
  getTestCommunityMember,
  insertTestCommunity,
  insertTestCommunityMember,
  removeTestCommunityMember,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
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

async function createCommunityFixture(visibility: 'public' | 'private' = 'public') {
  const owner = await createTestPlusMcpCaller()
  const community = await insertTestCommunity({ createdById: owner.id, visibility })
  await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  return { owner, community }
}

async function restOpen(
  caller: PrivateUser,
  community: string,
  subjectUserId?: string,
  status = 201,
) {
  const request = createRequest()
  await request.authenticateAs(caller)
  return request
    .post(`/api/v1/communities/${community}/modmail`)
    .send(subjectUserId ? { subject_user_id: subjectUserId } : {})
    .expect(status)
}

describe('participate_in_community(open_modmail) — REST twin and real PostgreSQL', () => {
  it('opens the caller thread and ignores a member subject override just like REST', async () => {
    const { community } = await createCommunityFixture()
    const member = await createTestPlusMcpCaller()
    const otherMember = await createTestUser()
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: member.id }),
      insertTestCommunityMember({ communityId: community.id, userId: otherMember.id }),
    ])

    const result = await callStructuredMcpTool(
      member,
      TOOL,
      optionArgs('open_modmail', {
        community_id: community.slug,
        subject_user_id: otherMember.id,
      }),
      SCOPES,
    )
    const thread = result.thread as Record<string, unknown>
    expect(thread).toMatchObject({
      id: expect.any(String),
      channel_type: 'modmail',
      community_id: community.id,
      subject_user_id: member.id,
    })
    const restResponse = await restOpen(member, community.slug, otherMember.id)
    expect(restResponse.body.thread).toMatchObject({ id: thread.id, subject_user_id: member.id })
    const read = createRequest()
    await read.authenticateAs(member)
    expect(
      (await read.get(`/api/v1/communities/${community.slug}/modmail/${thread.id}`).expect(200))
        .body.thread,
    ).toMatchObject({ id: thread.id, subject_user_id: member.id })
  })

  it('lets a moderator open for an active member and rejects removed or unknown subjects', async () => {
    const { community } = await createCommunityFixture()
    const moderator = await createTestPlusMcpCaller()
    const subject = await createTestUser()
    const removedSubject = await createTestUser()
    await Promise.all([
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
      insertTestCommunityMember({ communityId: community.id, userId: subject.id }),
      insertTestCommunityMember({ communityId: community.id, userId: removedSubject.id }),
    ])
    await removeTestCommunityMember(community.id, removedSubject.id)

    const response = await restOpen(moderator, community.slug, subject.id)
    const result = await callStructuredMcpTool(
      moderator,
      TOOL,
      optionArgs('open_modmail', { community_id: community.id, subject_user_id: subject.id }),
      SCOPES,
    )
    expect(result.thread).toMatchObject({
      id: response.body.thread.id,
      subject_user_id: subject.id,
      community_id: community.id,
    })

    await restOpen(moderator, community.slug, removedSubject.id, 422)
    await expectMcpToolFunctionThrows(
      moderator,
      TOOL,
      optionArgs('open_modmail', {
        community_id: community.slug,
        subject_user_id: removedSubject.id,
      }),
      { status: 422, message: 'Subject user is not an active community member' },
    )
    const unknownId = crypto.randomUUID()
    await restOpen(moderator, community.slug, unknownId, 404)
    await expectMcpToolFunctionThrows(
      moderator,
      TOOL,
      optionArgs('open_modmail', { community_id: community.slug, subject_user_id: unknownId }),
      { status: 404, message: 'Subject user not found' },
    )
  })

  it('allows active members in private and archived communities, but not removed members', async () => {
    const { owner, community: privateCommunity } = await createCommunityFixture('private')
    const privateMember = await createTestPlusMcpCaller()
    await insertTestCommunityMember({ communityId: privateCommunity.id, userId: privateMember.id })
    const privateArgs = optionArgs('open_modmail', { community_id: privateCommunity.id })
    const privateRest = await restOpen(privateMember, privateCommunity.slug)
    const privateMcp = await callStructuredMcpTool(privateMember, TOOL, privateArgs, SCOPES)
    expect(privateMcp.thread).toMatchObject({
      id: privateRest.body.thread.id,
      subject_user_id: privateMember.id,
    })

    const archivedOwner = await createTestPlusMcpCaller()
    const archivedCommunity = await insertTestCommunity({ createdById: archivedOwner.id })
    const archivedMember = await createTestPlusMcpCaller()
    await Promise.all([
      insertTestCommunityMember({
        communityId: archivedCommunity.id,
        userId: archivedOwner.id,
        role: 'owner',
      }),
      insertTestCommunityMember({ communityId: archivedCommunity.id, userId: archivedMember.id }),
    ])
    await archiveTestCommunity({
      communityId: archivedCommunity.id,
      archivedById: archivedOwner.id,
    })
    const archivedRest = await restOpen(archivedMember, archivedCommunity.slug)
    const archivedMcp = await callStructuredMcpTool(
      archivedMember,
      TOOL,
      optionArgs('open_modmail', { community_id: archivedCommunity.slug }),
      SCOPES,
    )
    expect(archivedMcp.thread).toMatchObject({
      id: archivedRest.body.thread.id,
      community_id: archivedCommunity.id,
    })

    await removeTestCommunityMember(archivedCommunity.id, archivedMember.id)
    expect(await getTestCommunityMember(archivedCommunity.id, archivedMember.id)).toBeNull()
    await restOpen(archivedMember, archivedCommunity.slug, undefined, 403)
    await expectMcpToolFunctionThrows(
      archivedMember,
      TOOL,
      optionArgs('open_modmail', { community_id: archivedCommunity.slug }),
      { status: 403, message: 'You must be a community member to open a modmail thread' },
    )

    // The private owner remains an active member; private visibility does not block modmail.
    expect(await getTestCommunityMember(privateCommunity.id, owner.id)).toMatchObject({
      role: 'owner',
    })
  })

  it('rejects a suspended member without creating a thread', async () => {
    const { community } = await createCommunityFixture()
    const member = await createTestPlusMcpCaller()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    await suspendTestUser(member.id)
    try {
      const args = optionArgs('open_modmail', { community_id: community.id })
      await restOpen(member, community.slug, undefined, 403)
      expect(await callRejectedMcpTool(member, TOOL, args, SCOPES)).toContain('suspended')
      const inbox = createRequest()
      await inbox.authenticateAs(member)
      expect(
        (await inbox.get(`/api/v1/communities/${community.slug}/modmail`).expect(200)).body.results,
      ).toEqual([])
    } finally {
      await unsuspendTestUser(member.id)
    }
  })
})
