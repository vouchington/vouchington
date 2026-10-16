import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
  insertTestRssFeed,
  insertTestTopic,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
import { searchCommunityListItems } from '@services/communities/list-items/get'

const scopes = ['community-moderation:read', 'community-moderation:write'] as const
const cases = [
  { kind: 'domain', entityType: 'url_hostname', field: 'url_hostname_id' },
  { kind: 'post', entityType: 'post', field: 'post_id' },
  { kind: 'rss_feed', entityType: 'rss_feed', field: 'rss_feed_id' },
  { kind: 'topic', entityType: 'topic', field: 'topic_id' },
  { kind: 'url', entityType: 'url', field: 'url_id' },
] as const

async function entityFor(
  kind: (typeof cases)[number]['kind'],
  ownerId: string,
  communityId: string,
) {
  const suffix = crypto.randomUUID().slice(0, 8)
  if (kind === 'post') {
    const postId = await insertTestPost({
      title: 'List candidate',
      slug: `list-candidate-${suffix}`,
      markdown: 'A post to add to the list.',
      createdById: ownerId,
      communityId,
    })
    await insertTestCommunityPostReview({ communityId, postId, submittedById: ownerId })
    return postId
  }
  if (kind === 'topic' || kind === 'rss_feed') {
    const topicId = await insertTestTopic({
      name: `List topic ${suffix}`,
      slug: `list-topic-${suffix}`,
      createdById: ownerId,
    })
    if (kind === 'topic') return topicId
    return insertTestRssFeed({ topicId, title: `List feed ${suffix}` })
  }
  const url = await insertTestUrlDirect(ownerId, `https://list-${suffix}.example.com/post`)
  if (!url) throw new Error('Expected a public test URL')
  return kind === 'domain' ? url.hostname.id : url.id
}

describe('community moderation MCP list writes — real PostgreSQL and Valkey', () => {
  it.each(cases)('adds and removes a $kind with the REST list guard', async entry => {
    const owner = await createTestPlusMcpCaller()
    const member = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    const entityId = await entityFor(entry.kind, owner.id, community.id)
    const addArgs = optionArgs(`add_${entry.kind}_to_list`, {
      community: community.slug,
      [entry.field]: entityId,
    })

    expect(
      await callRejectedMcpTool(
        { ...owner, membership_plan: null },
        'add_community_moderation',
        addArgs,
        scopes,
      ),
    ).toContain('requires a higher plan')
    expect(
      await callRejectedMcpTool(
        { ...member, membership_plan: 'plus' },
        'add_community_moderation',
        addArgs,
        scopes,
      ),
    ).toContain('Forbidden')

    const added = await callStructuredMcpTool(owner, 'add_community_moderation', addArgs, scopes)
    expect(added.community_list_item).toMatchObject({
      community_id: community.id,
      entity_id: entityId,
      item_type: entry.entityType,
    })
    const itemId = (added.community_list_item as { id: string }).id
    expect((await searchCommunityListItems(community.id, entry.entityType)).results).toEqual([
      expect.objectContaining({ id: itemId }),
    ])

    const removeArgs = optionArgs(`remove_${entry.kind}_from_list`, {
      community: community.id,
      itemId,
    })
    expect(
      await callRejectedMcpTool(
        { ...member, membership_plan: 'plus' },
        'remove_community_moderation',
        removeArgs,
        scopes,
      ),
    ).toContain('Forbidden')
    expect(
      await callStructuredMcpTool(owner, 'remove_community_moderation', removeArgs, scopes),
    ).toEqual({ success: true })
    expect((await searchCommunityListItems(community.id, entry.entityType)).results).toEqual([])
  })
})
