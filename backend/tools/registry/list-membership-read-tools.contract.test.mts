import { randomUUID } from 'node:crypto'
import { addListItem, softDeleteList } from '@services/lists'
import { membershipBenefitCatalog } from '@ts-shared/utils/membership-benefit-catalog'
import {
  createRandomString,
  createTestRssFeedItemWithUrl,
  createTestUser,
  insertTestList,
  insertTestPost,
  insertTestRssFeed,
  insertTestTopic,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'
import { beforeAll, describe, expect, it } from 'vitest'
import getMyListsContainingTool from '../get-my-lists-containing.mts'

type Scopes = Parameters<typeof callStructuredMcpTool>[3]
type Visibility = 'public' | 'unlisted' | 'private'

const READ = ['lists:read'] as const
const OWNED_PRIVATE = ['lists:read', 'post-relations.owned-private:write'] as const
const BROAD = ['lists:read', 'mcp.user:read', 'mcp.user:write'] as const
const INVALID = { success: false, error: 'Invalid entity_id' }
const random = createRandomString(6)

const asCaller = (user: Awaited<ReturnType<typeof createTestUser>>): McpContractCaller => ({
  ...user,
  membership_plan: null,
})

describe('get_my_lists_containing — real DB', () => {
  let ownerUser: Awaited<ReturnType<typeof createTestUser>>
  let owner: McpContractCaller
  let stranger: McpContractCaller
  let postId: string
  let lonePostId: string
  let lists: Record<Visibility | 'removed' | 'strangers', string>

  const containing = (entity_id: string, args: object = {}, who = owner, scopes: Scopes = READ) =>
    callStructuredMcpTool(
      who,
      'get_my_lists_containing',
      { item_type: 'post', entity_id, ...args },
      scopes,
    )
  const makeList = (who: McpContractCaller, label: string, visibility: Visibility) =>
    insertTestList({ ownerUserId: who.id, name: `${label} ${random}`, visibility })
  const newPost = (label: string) =>
    insertTestPost({
      title: `Contains ${label} ${random}`,
      slug: `contains-${label}-${random}`,
      createdById: owner.id,
      markdown: 'Body of the post',
    })

  beforeAll(async () => {
    const users = await Promise.all([createTestUser(), createTestUser()])
    ownerUser = users[0]
    ;[owner, stranger] = users.map(asCaller) as [McpContractCaller, McpContractCaller]
    ;[postId, lonePostId] = await Promise.all([newPost('held'), newPost('lone')])
    const [open, unlisted, hidden, removed, strangers] = await Promise.all([
      makeList(owner, 'public', 'public'),
      makeList(owner, 'unlisted', 'unlisted'),
      makeList(owner, 'private', 'private'),
      makeList(owner, 'removed', 'public'),
      makeList(stranger, 'strangers', 'public'),
    ])
    lists = {
      public: open.id,
      unlisted: unlisted.id,
      private: hidden.id,
      removed: removed.id,
      strangers: strangers.id,
    }
    await Promise.all(Object.values(lists).map(id => addListItem(id, 'post', postId)))
    await softDeleteList(owner.id, lists.removed)
  })

  // Lists made in the same millisecond tie on created_at, so the ids are compared as a set.
  const listIds = async (...args: Parameters<typeof containing>) =>
    ((await containing(...args))['list_ids'] as string[]).toSorted()

  it('names the public and unlisted lists, and never a removed or another user list', async () => {
    const expected = [lists.public, lists.unlisted].toSorted()

    expect(await listIds(postId)).toEqual(expected)
    expect(await listIds(postId, {}, owner, BROAD)).toEqual(expected)
    expect(await listIds(postId, {}, stranger)).toEqual([lists.strangers])
  })

  it('names the private list too, as REST does, only for the owner with the exact private grant', async () => {
    const request = createRequest()
    await request.authenticateAs(ownerUser)
    const rest = await request
      .get('/api/v1/lists/contains')
      .query({ item_type: 'post', entity_id: postId })
      .expect(200)

    const granted = await listIds(postId, {}, owner, OWNED_PRIVATE)

    expect(granted).toEqual([lists.private, lists.public, lists.unlisted].toSorted())
    expect(granted).toEqual((rest.body.list_ids as string[]).toSorted())
    expect(await listIds(postId, {}, stranger, OWNED_PRIVATE)).toEqual([lists.strangers])
  })

  it('finds an RSS feed item on a list', async () => {
    const topicId = await insertTestTopic({
      name: `Contains topic ${random}`,
      slug: `contains-topic-${random}`,
      createdById: owner.id,
    })
    const item = await createTestRssFeedItemWithUrl(
      await insertTestRssFeed({ topicId, title: `Contains feed ${random}` }),
    )
    await addListItem(lists.public, 'rss_feed_item', item.id)

    expect(await containing(item.id, { item_type: 'rss_feed_item' })).toEqual({
      success: true,
      list_ids: [lists.public],
    })
    expect(await containing(item.id)).toEqual({ success: true, list_ids: [] })
  })

  it('answers an empty list for an entity on no list, and refuses an id that is not a UUID', async () => {
    expect(await containing(lonePostId)).toEqual({ success: true, list_ids: [] })
    expect(await containing(randomUUID())).toEqual({ success: true, list_ids: [] })
    expect(
      await callRejectedMcpTool(
        owner,
        'get_my_lists_containing',
        { item_type: 'post', entity_id: 'not-a-uuid' },
        READ,
      ),
    ).toEqual(expect.stringContaining('entity_id'))
    expect(
      await getMyListsContainingTool.function(ownerUser)({
        item_type: 'post',
        entity_id: 'not-a-uuid',
      }),
    ).toEqual(INVALID)
  })
})

describe('get_membership_plans — real DB', () => {
  let caller: McpContractCaller

  const plans = (who = caller) =>
    callStructuredMcpTool(who, 'get_membership_plans', {}, ['reference-data:read'])

  beforeAll(async () => {
    caller = asCaller(await createTestUser())
  })

  it('returns the catalog signed-out REST returns, with the benefit catalog', async () => {
    const rest = await createRequest().get('/api/v1/memberships/plans').expect(200)

    const result = await plans()

    expect(result).toEqual({ success: true, ...rest.body })
    expect(rest.body.benefit_catalog).toEqual(JSON.parse(JSON.stringify(membershipBenefitCatalog)))
  })

  it('says nothing about the caller, so another user and a plus user read the same plans', async () => {
    const plus = { ...asCaller(await createTestUser()), membership_plan: 'plus' as const }

    expect(await plans(plus)).toEqual(await plans())
  })
})
