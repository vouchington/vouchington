import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getTestConversationParticipants,
  getTestModerationReportEscalatedAt,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModerationReport,
  insertTestPost,
} from '@voucha/test-helpers'
import {
  getCommunityPostReviewAutomodState,
  insertTestCommunityPostReview,
  insertTestPendingCommunityPostReview,
  setTestCommunityPostReviewAutomodFlag,
} from '@voucha/test-helpers/entities/community-post-reviews'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'
import { attachPostClaims } from '@services/moderation-claims'
import { attachReportClaims } from '@services/moderation-claims/get'

const scopes = ['community-moderation:read', 'community-moderation:write'] as const

async function fixture(kind: 'post' | 'report') {
  const owner = await createTestPlusMcpCaller()
  const moderator = await createTestPlusMcpCaller()
  const member = await createTestPlusMcpCaller()
  const author = await createTestUser()
  const reporter = await createTestUser()
  const community = await insertTestCommunity({ createdById: owner.id })
  await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  await insertTestCommunityMember({
    communityId: community.id,
    userId: moderator.id,
    role: 'moderator',
  })
  await insertTestCommunityMember({ communityId: community.id, userId: member.id })
  const postId = await insertTestPost({
    title: 'Community moderation queue fixture',
    slug: `mcp-mod-queue-${crypto.randomUUID().slice(0, 8)}`,
    markdown: 'A post for moderation.',
    createdById: author.id,
    communityId: community.id,
  })
  const reportId =
    kind === 'report'
      ? await insertTestModerationReport({
          reporterUserId: reporter.id,
          entityType: 'post',
          entityId: postId,
          communityId: community.id,
        })
      : null
  if (kind === 'post')
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: author.id,
    })
  return { owner, moderator, member, author, reporter, community, postId, reportId }
}

function call(
  caller: McpContractCaller,
  tool: 'add_community_moderation' | 'update_community_moderation' | 'remove_community_moderation',
  option: string,
  args: Record<string, unknown>,
) {
  return callStructuredMcpTool(caller, tool, optionArgs(option, args), scopes)
}

describe('community moderation queue MCP writes — real PostgreSQL and Valkey', () => {
  it.each(['post', 'report'] as const)(
    'claims and releases a %s while refusing a regular member',
    async kind => {
      const { moderator, member, community, postId, reportId } = await fixture(kind)
      const target = kind === 'post' ? { postId } : { reportId: reportId! }
      const args = { community: community.slug, ...target }
      const claimOption = kind === 'post' ? 'claim_post' : 'claim_report'
      const releaseOption = kind === 'post' ? 'release_post_claim' : 'release_report_claim'

      expect(
        await callRejectedMcpTool(
          member,
          'update_community_moderation',
          optionArgs(claimOption, args),
          scopes,
        ),
      ).toContain('Forbidden')
      const claimed = await call(moderator, 'update_community_moderation', claimOption, args)
      expect(claimed).toMatchObject({
        claimed_by_other: false,
        claim: {
          claimed_by_id: moderator.id,
          community_id: community.id,
          [kind === 'post' ? 'post_id' : 'report_id']: kind === 'post' ? postId : reportId,
        },
      })
      const current =
        kind === 'post'
          ? (await attachPostClaims([{ id: postId }]))[0]!.claim
          : (await attachReportClaims([{ id: reportId! }]))[0]!.claim
      expect(current?.claimed_by_id).toBe(moderator.id)
      expect(await call(moderator, 'remove_community_moderation', releaseOption, args)).toEqual({
        success: true,
      })
      const released =
        kind === 'post'
          ? (await attachPostClaims([{ id: postId }]))[0]!.claim
          : (await attachReportClaims([{ id: reportId! }]))[0]!.claim
      expect(released).toBeNull()
    },
  )

  it.each(['post', 'report'] as const)(
    'escalates and deescalates a %s with a persisted queue state',
    async kind => {
      const { moderator, member, community, postId, reportId } = await fixture(kind)
      const target = kind === 'post' ? { postId } : { reportId: reportId! }
      const args = { community: community.id, ...target }
      const escalateOption = kind === 'post' ? 'escalate_post' : 'escalate_report'
      const deescalateOption = kind === 'post' ? 'deescalate_post' : 'deescalate_report'
      const escalatedAt = async () => {
        if (kind === 'report') {
          const value = await getTestModerationReportEscalatedAt(reportId!)
          return value?.toISOString() ?? null
        }
        const page = await callStructuredMcpTool(
          moderator,
          'read_community_moderation',
          optionArgs('list_pending_posts', { community: community.id }),
          scopes,
        )
        return (page.posts as Record<string, Record<string, unknown>>)[postId]?.escalated_at
      }
      expect(
        await callRejectedMcpTool(
          member,
          'add_community_moderation',
          optionArgs(escalateOption, args),
          scopes,
        ),
      ).toContain('Forbidden')
      expect(await call(moderator, 'add_community_moderation', escalateOption, args)).toEqual({
        success: true,
      })
      expect(await escalatedAt()).toEqual(expect.any(String))
      expect(await call(moderator, 'remove_community_moderation', deescalateOption, args)).toEqual({
        success: true,
      })
      expect(await escalatedAt()).toBeNull()
    },
  )

  it.each(['post', 'report'] as const)(
    'opens or fetches the same private %s internal thread',
    async kind => {
      const { moderator, member, author, reporter, community, postId, reportId } =
        await fixture(kind)
      const target = kind === 'post' ? { postId } : { reportId: reportId! }
      const args = { community: community.slug, ...target }
      const option =
        kind === 'post' ? 'open_post_mod_internal_thread' : 'open_report_mod_internal_thread'
      expect(
        await callRejectedMcpTool(
          member,
          'add_community_moderation',
          optionArgs(option, args),
          scopes,
        ),
      ).toContain('Forbidden')
      const first = await call(moderator, 'add_community_moderation', option, args)
      const second = await call(moderator, 'add_community_moderation', option, args)
      const conversation = first.conversation as Record<string, unknown>
      expect(conversation).toMatchObject({
        channel_type: 'mod_internal',
        community_id: community.id,
        [kind === 'post' ? 'post_id' : 'moderation_report_id']: kind === 'post' ? postId : reportId,
      })
      expect((second.conversation as Record<string, unknown>).id).toBe(conversation.id)
      const participants = await getTestConversationParticipants(conversation.id as string)
      expect(participants.map(row => row.user_id)).toContain(moderator.id)
      expect(participants.map(row => row.user_id)).not.toContain(author.id)
      expect(participants.map(row => row.user_id)).not.toContain(reporter.id)
    },
  )

  it('dismisses a current automod flag and records the acting moderator', async () => {
    const { moderator, member, community, postId } = await fixture('report')
    await insertTestCommunityPostReview({ communityId: community.id, postId })
    await setTestCommunityPostReviewAutomodFlag({ postId, action: 'review_queue' })
    const args = { community: community.id, postId }
    expect(
      await callRejectedMcpTool(
        member,
        'add_community_moderation',
        optionArgs('dismiss_automod_flag', args),
        scopes,
      ),
    ).toContain('Forbidden')
    expect(await call(moderator, 'add_community_moderation', 'dismiss_automod_flag', args)).toEqual(
      {
        success: true,
      },
    )
    expect(await getCommunityPostReviewAutomodState(postId)).toMatchObject({
      automod_dismissed_at: expect.any(Date),
      automod_dismissed_by_id: moderator.id,
    })
  })
})
