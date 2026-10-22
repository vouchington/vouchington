import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  archiveTestCommunity,
  createTestPost,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestCommunityListItem,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createOwnedList, searchListItems } from '@services/lists'
import { archivePost } from '@services/posts/archive'

const SCOPES = ['lists:read', 'lists:write'] as const
const PRIVATE_SCOPES = [...SCOPES, 'post-relations.owned-private:write'] as const

describe('add_list_item batch — real DB', () => {
  it('reports an archived-community post as ineligible without writing it', async () => {
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    const community = await insertTestCommunity({ createdById: caller.id })
    const post = await createTestPost({ user: caller, community_id: community.id })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: post.id,
      submittedById: caller.id,
    })
    await archiveTestCommunity({ communityId: community.id, archivedById: caller.id })
    const list = await createOwnedList(caller.id, WEB_PROVENANCE, { name: 'Archived community' })
    const result = await callStructuredMcpTool(
      caller,
      'add_list_item',
      {
        list_id: list.id,
        items: [{ item_type: 'post', entity: post.id }],
      },
      SCOPES,
    )
    expect(result.results).toMatchObject([
      { status: 'ineligible', error: "Post can't be added to a list" },
    ])
    expect((await searchListItems(list.id, { currentUserId: caller.id })).results).toEqual([])
  })

  it('reports a named archived post as ineligible and adds an eligible sibling', async () => {
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    const list = await createOwnedList(caller.id, WEB_PROVENANCE, { name: 'Archived batch' })
    const archived = await createTestPost({ user: caller })
    const eligible = await createTestPost({ user: caller })
    await archivePost(archived.id, caller.id)
    const result = await callStructuredMcpTool(
      caller,
      'add_list_item',
      {
        list_id: list.id,
        items: [
          { item_type: 'post', entity: archived.id },
          { item_type: 'post', entity: eligible.id },
        ],
      },
      SCOPES,
    )
    expect(result.results).toMatchObject([
      { status: 'ineligible', error: "Post can't be added to a list" },
      { status: 'added', list_item: { entity_id: eligible.id } },
    ])
    expect(
      (await searchListItems(list.id, { currentUserId: caller.id })).results.map(
        item => item.entity_id,
      ),
    ).toEqual([eligible.id])
  })

  it('adds the visible item and reports the missing one', async () => {
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    const list = await createOwnedList(caller.id, WEB_PROVENANCE, { name: 'Batch' })
    const post = await createTestPost({ user: caller })
    const result = await callStructuredMcpTool(
      caller,
      'add_list_item',
      {
        list_id: list.id,
        items: [
          { item_type: 'post', entity: post.id },
          { item_type: 'post', entity: crypto.randomUUID() },
        ],
      },
      SCOPES,
    )
    expect(result.results).toMatchObject([
      { status: 'added', list_item: { entity_id: post.id } },
      { status: 'not_found', error: 'Not found' },
    ])
    expect((await searchListItems(list.id, {})).results).toHaveLength(1)
  })

  it('rejects 101 items before writing', async () => {
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    const items = Array.from({ length: 101 }, () => ({
      item_type: 'post',
      entity: crypto.randomUUID(),
    }))
    expect(
      await callRejectedMcpTool(
        caller,
        'add_list_item',
        { list_id: crypto.randomUUID(), items },
        SCOPES,
      ),
    ).toContain('Invalid tool arguments')
  })

  it('copies a community list and skips a post the caller cannot see', async () => {
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    const other = await createTestUser()
    const community = await insertTestCommunity({
      createdById: caller.id,
      slug: `batch-community-${createRandomString(8)}`,
    })
    const visible = await createTestPost({ user: caller })
    const hidden = await createTestPost({
      user: other,
      privacy: 'private',
      broadcast: 'followers',
    })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'post',
      entityId: visible.id,
      addedById: caller.id,
    })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'post',
      entityId: hidden.id,
      addedById: caller.id,
    })
    const list = await createOwnedList(caller.id, WEB_PROVENANCE, { name: 'Imported' })
    const twin = await createOwnedList(caller.id, WEB_PROVENANCE, { name: 'REST import' })
    const copied = await callStructuredMcpTool(
      caller,
      'add_list_item',
      { list_id: list.id, source: { community: community.slug } },
      SCOPES,
    )
    const request = createRequest()
    await request.authenticateAs(caller)
    const rest = await request
      .post(`/api/v1/lists/${twin.id}/import`)
      .set('Content-Type', 'application/json')
      .send({ community_slug: community.slug })
      .expect(200)
    expect(copied).toMatchObject({ posts: rest.body.posts, items: rest.body.items })
    const ids = (await searchListItems(list.id, {})).results.map(item => item.entity_id)
    expect(ids).toEqual([visible.id])
  })

  it('adds the caller’s own private post only with the private grant', async () => {
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    const list = await createOwnedList(caller.id, WEB_PROVENANCE, { name: 'Private grant' })
    const post = await createTestPost({ user: caller, privacy: 'private', broadcast: 'users' })
    const args = { list_id: list.id, items: [{ item_type: 'post', entity: post.id }] }
    const denied = await callStructuredMcpTool(caller, 'add_list_item', args, SCOPES)
    expect(denied.results).toMatchObject([{ status: 'forbidden', error: 'Forbidden' }])
    expect((await searchListItems(list.id, { currentUserId: caller.id })).results).toHaveLength(0)
    await callStructuredMcpTool(caller, 'add_list_item', args, PRIVATE_SCOPES)
    expect((await searchListItems(list.id, { currentUserId: caller.id })).results).toHaveLength(1)
  })

  it('reports another user’s private post as not found', async () => {
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    const owner = await createTestUser()
    const list = await createOwnedList(caller.id, WEB_PROVENANCE, { name: 'Hidden post' })
    const post = await createTestPost({ user: owner, privacy: 'private', broadcast: 'followers' })
    const hidden = await callStructuredMcpTool(
      caller,
      'add_list_item',
      { list_id: list.id, items: [{ item_type: 'post', entity: post.id }] },
      PRIVATE_SCOPES,
    )
    expect(hidden.results).toMatchObject([{ status: 'not_found', error: 'Not found' }])
    expect((await searchListItems(list.id, {})).results).toHaveLength(0)
  })

  it('blocks delegated writes and imports of topic-recommendation threads', async () => {
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    const recommendation = await createTestPost({ user: caller, post_type: 'topic_recommendation' })
    const directList = await createOwnedList(caller.id, WEB_PROVENANCE, {
      name: 'Direct recommendation',
    })
    const direct = await callStructuredMcpTool(
      caller,
      'add_list_item',
      { list_id: directList.id, items: [{ item_type: 'post', entity: recommendation.id }] },
      SCOPES,
    )
    expect(direct.results).toMatchObject([{ status: 'not_found', error: 'Not found' }])

    const community = await insertTestCommunity({
      createdById: caller.id,
      slug: `recommendation-community-${createRandomString(8)}`,
    })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'post',
      entityId: recommendation.id,
      addedById: caller.id,
    })
    const importList = await createOwnedList(caller.id, WEB_PROVENANCE, {
      name: 'Recommendation import',
    })
    const imported = await callStructuredMcpTool(
      caller,
      'add_list_item',
      { list_id: importList.id, source: { community: community.slug } },
      SCOPES,
    )
    expect(imported.posts).toBe(0)
    expect((await searchListItems(importList.id, {})).results).toHaveLength(0)
  })
})
