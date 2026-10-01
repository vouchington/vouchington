import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestPost,
  createTestRssFeedItemWithUrl,
  createTestUser,
  insertTestPost,
  insertTestRssFeed,
  insertTestTopic,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { createOwnedList, getListForWrite, searchListItems, searchUserLists } from '@services/lists'
import addListItemTool from './add-list-item.mts'
import deleteListTool from './delete-list.mts'
import removeListItemTool from './remove-list-item.mts'
import updateListTool from './update-list.mts'

const SCOPES = ['lists:read', 'lists:write'] as const
const PRIVATE_SCOPES = [...SCOPES, 'post-relations.owned-private:write'] as const

async function createCaller(plan: 'plus' | null = 'plus') {
  return { ...(await createTestUser()), membership_plan: plan }
}

const listName = () => `Tool List ${createRandomString(8)}`

async function createPostFor(userId: string): Promise<string> {
  return insertTestPost({
    title: `Tool post ${createRandomString(8)}`,
    slug: `tool-post-${createRandomString(8)}`,
    createdById: userId,
    markdown: 'content',
  })
}

async function createFeedItem(userId: string): Promise<string> {
  const topicId = await insertTestTopic({
    name: `Tool topic ${createRandomString(8)}`,
    slug: `tool-topic-${createRandomString(8)}`,
    createdById: userId,
  })
  const feedId = await insertTestRssFeed({ topicId, title: `Tool feed ${createRandomString(8)}` })
  return (await createTestRssFeedItemWithUrl(feedId)).id
}

const listCount = async (userId: string) => (await searchUserLists(userId, {})).results.length
const itemCount = async (listId: string) => (await searchListItems(listId, {})).results.length

describe('list write tools contract — real DB', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it('create_list returns the list the REST route creates, private unless set otherwise', async () => {
    const caller = await createCaller()
    const name = listName()
    const request = createRequest()
    await request.authenticateAs(caller)
    const rest = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name })
      .expect(201)

    const result = await callStructuredMcpTool(caller, 'create_list', { name }, SCOPES)
    const full = await callStructuredMcpTool(
      caller,
      'create_list',
      { name, description: 'About', visibility: 'public' },
      SCOPES,
    )

    expect(Object.keys(result.list as object).toSorted()).toEqual(
      Object.keys(rest.body.list).toSorted(),
    )
    expect(result.list).toMatchObject({ name, description: null, visibility: 'private' })
    expect(result.list).toMatchObject({ owner_user_id: caller.id, removed_at: null })
    expect(full.list).toMatchObject({ description: 'About', visibility: 'public' })
    expect(await listCount(caller.id)).toBe(3)
  })

  it('update_list changes only the fields sent and clears a description with null', async () => {
    const caller = await createCaller()
    const list = await createOwnedList(caller.id, {
      name: listName(),
      description: 'Before',
      visibility: 'public',
    })

    const renamed = await callStructuredMcpTool(
      caller,
      'update_list',
      { list_id: list.id, name: 'Renamed' },
      SCOPES,
    )
    const cleared = await callStructuredMcpTool(
      caller,
      'update_list',
      { list_id: list.id, description: null, visibility: 'unlisted' },
      SCOPES,
    )

    expect(renamed.list).toMatchObject({
      name: 'Renamed',
      description: 'Before',
      visibility: 'public',
    })
    expect(cleared.list).toMatchObject({
      name: 'Renamed',
      description: null,
      visibility: 'unlisted',
    })
    expect(await getListForWrite(list.id)).toMatchObject({
      name: 'Renamed',
      visibility: 'unlisted',
    })
  })

  it('delete_list removes the list, and deleting it again is refused as not found', async () => {
    const caller = await createCaller()
    const list = await createOwnedList(caller.id, { name: listName() })

    expect(
      await callStructuredMcpTool(caller, 'delete_list', { list_id: list.id }, SCOPES),
    ).toEqual({
      success: true,
    })
    expect(await getListForWrite(list.id)).toBeNull()
    await expect(deleteListTool.function(caller)({ list_id: list.id })).rejects.toMatchObject({
      status: 404,
    })
  })

  it.each([
    ['post', createPostFor],
    ['rss_feed_item', createFeedItem],
  ] as const)(
    'add_list_item and remove_list_item mirror the REST %s routes',
    async (type, make) => {
      const caller = await createCaller()
      const list = await createOwnedList(caller.id, { name: listName() })
      const entityId = await make(caller.id)
      const args = { list_id: list.id, item_type: type, entity_id: entityId }

      const first = await callStructuredMcpTool(caller, 'add_list_item', args, SCOPES)
      const again = await callStructuredMcpTool(caller, 'add_list_item', args, SCOPES)

      expect(first.list_item).toMatchObject({
        list_id: list.id,
        item_type: type,
        entity_id: entityId,
      })
      expect(again).toEqual(first)
      expect(await itemCount(list.id)).toBe(1)

      expect(await callStructuredMcpTool(caller, 'remove_list_item', args, SCOPES)).toEqual({
        success: true,
      })
      expect(await itemCount(list.id)).toBe(0)
      await expect(removeListItemTool.function(caller)(args)).rejects.toMatchObject({ status: 404 })
    },
  )

  it('never lets one user change another user’s list, and a missing list is not found', async () => {
    const caller = await createCaller()
    const owner = await createTestUser()
    const list = await createOwnedList(owner.id, { name: 'Owner list' })
    const postId = await createPostFor(owner.id)
    const itemArgs = { list_id: list.id, item_type: 'post' as const, entity_id: postId }
    await callStructuredMcpTool(
      { ...owner, membership_plan: 'plus' },
      'add_list_item',
      itemArgs,
      SCOPES,
    )

    await expect(
      updateListTool.function(caller)({ list_id: list.id, name: 'Taken' }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(deleteListTool.function(caller)({ list_id: list.id })).rejects.toMatchObject({
      status: 403,
    })
    await expect(removeListItemTool.function(caller)(itemArgs)).rejects.toMatchObject({
      status: 403,
    })
    await expect(
      addListItemTool.function(caller)(itemArgs, {
        credentialOwnerId: caller.id,
        grantedScopes: SCOPES,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      deleteListTool.function(caller)({ list_id: crypto.randomUUID() }),
    ).rejects.toMatchObject({ status: 404 })

    expect(await getListForWrite(list.id)).toMatchObject({ name: 'Owner list' })
    expect(await itemCount(list.id)).toBe(1)
  })

  it('refuses a read-only scope grant and a free plan on every list tool', async () => {
    const caller = await createCaller()
    const free = await createCaller(null)
    const list = await createOwnedList(caller.id, { name: 'Guarded' })
    const item = { list_id: list.id, item_type: 'post', entity_id: crypto.randomUUID() }
    const calls = [
      ['create_list', { name: listName() }],
      ['update_list', { list_id: list.id, name: 'Nope' }],
      ['delete_list', { list_id: list.id }],
      ['add_list_item', item],
      ['remove_list_item', item],
    ] as const

    for (const [name, args] of calls) {
      expect(await callRejectedMcpTool(caller, name, args, ['lists:read'])).toContain(
        'Tool requires scopes lists:read, lists:write',
      )
      expect(await callRejectedMcpTool(free, name, args, SCOPES)).toContain(
        'requires a higher plan',
      )
    }

    expect(await getListForWrite(list.id)).toMatchObject({ name: 'Guarded' })
    expect(await listCount(caller.id)).toBe(1)
  })

  it('refuses a suspended user before any list change', async () => {
    const caller = await createCaller()
    const list = await createOwnedList(caller.id, { name: 'Frozen' })
    const entityId = await createPostFor(caller.id)
    const item = { list_id: list.id, item_type: 'post', entity_id: entityId }
    await callStructuredMcpTool(caller, 'add_list_item', item, SCOPES)
    await suspendTestUser(caller.id)
    suspendedUserIds.push(caller.id)

    await callRejectedMcpTool(caller, 'create_list', { name: listName() }, SCOPES)
    await callRejectedMcpTool(caller, 'update_list', { list_id: list.id, name: 'Thawed' }, SCOPES)
    await callRejectedMcpTool(caller, 'remove_list_item', item, SCOPES)
    await callRejectedMcpTool(caller, 'delete_list', { list_id: list.id }, SCOPES)

    expect(await listCount(caller.id)).toBe(1)
    expect(await getListForWrite(list.id)).toMatchObject({ name: 'Frozen' })
    expect(await itemCount(list.id)).toBe(1)
  })

  it.each([
    ['create_list', { name: '' }],
    ['create_list', { name: 'x'.repeat(256) }],
    ['create_list', { name: 'ok', visibility: 'secret' }],
    ['create_list', {}],
    ['update_list', { list_id: 'nope', name: 'ok' }],
    ['delete_list', { list_id: 'nope' }],
    [
      'add_list_item',
      { list_id: crypto.randomUUID(), item_type: 'comment', entity_id: crypto.randomUUID() },
    ],
    ['remove_list_item', { list_id: crypto.randomUUID(), item_type: 'post', entity_id: 'nope' }],
  ])('refuses invalid %s arguments before any change', async (name, args) => {
    const caller = await createCaller()

    expect(await callRejectedMcpTool(caller, name, args, SCOPES)).toContain(
      'Invalid tool arguments',
    )
    expect(await listCount(caller.id)).toBe(0)
  })

  it('reaches the caller’s own private post only with the exact private grant', async () => {
    const caller = await createCaller()
    const list = await createOwnedList(caller.id, { name: listName() })
    const post = await createTestPost({ user: caller, privacy: 'private', broadcast: 'users' })
    const args = { list_id: list.id, item_type: 'post', entity_id: post.id }

    await callRejectedMcpTool(caller, 'add_list_item', args, SCOPES)
    expect(await itemCount(list.id)).toBe(0)

    await callStructuredMcpTool(caller, 'add_list_item', args, PRIVATE_SCOPES)
    expect(await itemCount(list.id)).toBe(1)
  })

  it('hides another user’s private post even from a credential with the private grant', async () => {
    const caller = await createCaller()
    const owner = await createTestUser()
    const list = await createOwnedList(caller.id, { name: listName() })
    const post = await createTestPost({ user: owner, privacy: 'private', broadcast: 'followers' })

    await callRejectedMcpTool(
      caller,
      'add_list_item',
      { list_id: list.id, item_type: 'post', entity_id: post.id },
      PRIVATE_SCOPES,
    )

    expect(await itemCount(list.id)).toBe(0)
  })
})
