import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityApplication,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
import { getApplicationQuestions } from '@services/communities'

const scopes = ['community-moderation:read', 'community-moderation:write'] as const
const readScopes = ['community-moderation:read'] as const

async function fixture() {
  const owner = await createTestPlusMcpCaller()
  const moderator = await createTestPlusMcpCaller()
  const applicant = await createTestUser()
  const community = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
  await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  await insertTestCommunityMember({
    communityId: community.id,
    userId: moderator.id,
    role: 'moderator',
  })
  return { owner, moderator, applicant, community }
}

describe('community moderation MCP application updates — real PostgreSQL and Valkey', () => {
  it('lets only the owner set application questions and returns the stored shape', async () => {
    const { owner, moderator, community } = await fixture()
    const question = `Why join ${crypto.randomUUID().slice(0, 8)}?`
    const args = optionArgs('set_application_questions', {
      community: community.slug,
      questions: [{ question, field_type: 'long_text', is_required: true }],
    })
    expect(
      await callRejectedMcpTool(moderator, 'update_community_moderation', args, scopes),
    ).toContain('Forbidden')
    const result = await callStructuredMcpTool(owner, 'update_community_moderation', args, scopes)
    expect(result.questions).toEqual([
      expect.objectContaining({
        question: expect.stringContaining(question),
        field_type: 'long_text',
      }),
    ])
    expect(await getApplicationQuestions(community.id)).toEqual([
      expect.objectContaining({ question }),
    ])
  })

  it('reviews a private-community application and exposes the result through the guarded list', async () => {
    const { moderator, applicant, community } = await fixture()
    const application = await insertTestCommunityApplication({
      communityId: community.id,
      userId: applicant.id,
      message: 'I would like to join.',
    })
    const before = await callStructuredMcpTool(
      moderator,
      'read_community_moderation',
      optionArgs('list_applications', { community: community.id, status: 'pending' }),
      readScopes,
    )
    expect(before.results).toEqual([expect.objectContaining({ id: application.id })])
    expect(
      await callStructuredMcpTool(
        moderator,
        'update_community_moderation',
        optionArgs('review_application', {
          community: community.slug,
          id: application.id,
          status: 'approved',
        }),
        scopes,
      ),
    ).toEqual({ success: true })
    const after = await callStructuredMcpTool(
      moderator,
      'read_community_moderation',
      optionArgs('list_applications', { community: community.id, status: 'approved' }),
      readScopes,
    )
    expect(after.results).toEqual([expect.objectContaining({ id: application.id })])
  })
})
