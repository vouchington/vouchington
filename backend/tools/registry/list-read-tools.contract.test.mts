import { randomUUID } from 'node:crypto'
import { softDeleteList } from '@services/lists'
import { createRandomString, createTestUser, insertTestList } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'
import { beforeAll, describe, expect, it } from 'vitest'
import getListTool from '../get-list.mts'

type Body = Record<string, unknown>
type Row = { id: string; name: string; visibility: string }
type Page = {
  success: true
  results: Row[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

type Scopes = Parameters<typeof callStructuredMcpTool>[3]
type Visibility = 'public' | 'unlisted' | 'private'

const NOT_FOUND = { success: false, error: 'List not found' }
const INVALID_CURSOR = { success: false, error: 'Invalid cursor' }
const READ = ['lists:read'] as const
const OWNED_PRIVATE = ['lists:read', 'post-relations.owned-private:write'] as const
const BROAD = ['lists:read', 'mcp.user:read', 'mcp.user:write'] as const

const asCaller = (user: Awaited<ReturnType<typeof createTestUser>>): McpContractCaller => ({
  ...user,
  membership_plan: null,
})
const ids = (page: { results: Row[] }) => page.results.map(row => row.id)

const random = createRandomString(6)

const make = (ownerUserId: string, label: string, visibility: Visibility, description?: string) =>
  insertTestList({ ownerUserId, name: `${label} ${random}`, visibility, description })

// One after another: lists page newest first by id, so creation order is the page order.
async function makeInOrder(ownerUserId: string, label: string, visibilities: Visibility[]) {
  const made = []
  for (const [index, visibility] of visibilities.entries()) {
    made.push(await make(ownerUserId, `${label} ${index}`, visibility))
  }
  return made
}

describe('get_list and get_my_lists — real DB', () => {
  let owner: McpContractCaller
  let stranger: McpContractCaller
  let lists: Record<'public' | 'unlisted' | 'private' | 'strangers' | 'removed', string>

  const getList = (list_id: string, who = owner, scopes: Scopes = READ) =>
    callStructuredMcpTool(who, 'get_list', { list_id }, scopes)
  const myLists = (args: Body = {}, who = owner, scopes: Scopes = READ) =>
    callStructuredMcpTool(who, 'get_my_lists', args, scopes) as Promise<Page>

  beforeAll(async () => {
    ;[owner, stranger] = (await Promise.all([createTestUser(), createTestUser()])).map(
      asCaller,
    ) as McpContractCaller[]
    const pub = await make(owner.id, 'Public', 'public', 'Open reading')
    const unlisted = await make(owner.id, 'Unlisted', 'unlisted')
    const priv = await make(owner.id, 'Private', 'private', 'Secret plans')
    const strangers = await make(stranger.id, 'Strangers private', 'private')
    const removed = await make(owner.id, 'Removed', 'public')
    await softDeleteList(owner.id, removed.id)
    lists = {
      public: pub.id,
      unlisted: unlisted.id,
      private: priv.id,
      strangers: strangers.id,
      removed: removed.id,
    }
  })

  describe('get_list', () => {
    it('returns a public or unlisted list to its owner and to anyone else', async () => {
      for (const who of [owner, stranger]) {
        expect(await getList(lists.public, who)).toEqual({
          success: true,
          list: {
            id: lists.public,
            owner_user_id: owner.id,
            name: `Public ${random}`,
            description: expect.stringContaining('Open reading'),
            visibility: 'public',
            created_at: expect.any(String),
            updated_at: expect.any(String),
          },
        })
        expect(await getList(lists.unlisted, who)).toMatchObject({
          list: { id: lists.unlisted, visibility: 'unlisted', description: null },
        })
      }
    })

    it('wraps the description as external content', async () => {
      const { list } = (await getList(lists.public)) as { list: Body }

      expect(list['description']).not.toBe('Open reading')
    })

    it('matches the signed-out REST list', async () => {
      const rest = await createRequest().get(`/api/v1/lists/${lists.public}`).expect(200)
      const { list } = (await getList(lists.public)) as { list: Body }

      expect(list['id']).toBe(rest.body.list.id)
      expect(list['name']).toBe(rest.body.list.name)
      expect(list['visibility']).toBe(rest.body.list.visibility)
    })

    it('hides a private list from its owner without the exact private grant', async () => {
      for (const scopes of [READ, BROAD]) {
        expect(await getList(lists.private, owner, scopes)).toEqual(NOT_FOUND)
      }
    })

    it('shows a private list to its owner with the exact private grant', async () => {
      expect(await getList(lists.private, owner, OWNED_PRIVATE)).toMatchObject({
        success: true,
        list: { id: lists.private, visibility: 'private' },
      })
    })

    it('answers every argument trick the same as an unknown list', async () => {
      const denials = [
        await getList(lists.strangers, owner, OWNED_PRIVATE),
        await getList(lists.private, stranger, OWNED_PRIVATE),
        await getList(lists.private, stranger, BROAD),
        await getList(lists.removed, owner, OWNED_PRIVATE),
        await getList(randomUUID(), owner, OWNED_PRIVATE),
      ]

      expect(denials).toEqual(denials.map(() => NOT_FOUND))
    })

    it('rejects an argument that is not a list id', async () => {
      for (const list_id of ['not-a-uuid', '', lists.private.toUpperCase().slice(0, 8)]) {
        expect(
          await callRejectedMcpTool(owner, 'get_list', { list_id }, OWNED_PRIVATE),
        ).toBeTruthy()
      }
    })

    it('ignores a context that is missing or belongs to another credential', async () => {
      const read = (context?: { credentialOwnerId: string; grantedScopes: string[] }) =>
        getListTool.function(owner)({ list_id: lists.private }, context as never)
      const grantedScopes = [...OWNED_PRIVATE]

      expect(await read()).toEqual(NOT_FOUND)
      expect(await read({ credentialOwnerId: stranger.id, grantedScopes })).toEqual(NOT_FOUND)
      expect(await read({ credentialOwnerId: owner.id, grantedScopes })).toMatchObject({
        success: true,
      })
    })
  })

  describe('get_my_lists', () => {
    it('lists the public and unlisted lists, newest first, and never a removed one', async () => {
      const page = await myLists()

      expect(ids(page)).toEqual([lists.unlisted, lists.public])
      expect(page.page_info.has_next_page).toBe(false)
    })

    it('adds the private lists only with the exact private grant', async () => {
      expect(ids(await myLists({}, owner, BROAD))).toEqual([lists.unlisted, lists.public])
      expect(ids(await myLists({}, owner, OWNED_PRIVATE))).toEqual([
        lists.private,
        lists.unlisted,
        lists.public,
      ])
    })

    it('never returns another user’s lists', async () => {
      expect(ids(await myLists({}, stranger, OWNED_PRIVATE))).toEqual([lists.strangers])
    })

    it('pages by cursor like authenticated REST and ends the pages cleanly', async () => {
      const reader = await createTestUser()
      await makeInOrder(reader.id, 'Paged', ['public', 'public', 'public'])
      const request = createRequest()
      await request.authenticateAs(reader)
      const rest = await request.get('/api/v1/lists?limit=2').expect(200)

      const first = await myLists({ limit: 2 }, asCaller(reader))
      const second = await myLists(
        { limit: 2, after: first.page_info.end_cursor! },
        asCaller(reader),
      )

      expect(ids(first)).toEqual(rest.body.results.map((row: { id: string }) => row.id))
      expect(first.page_info.end_cursor).toBe(rest.body.page_info.end_cursor)
      expect(first.page_info.has_next_page).toBe(true)
      expect(second.results).toHaveLength(1)
      expect(second.page_info.has_next_page).toBe(false)
    })

    it('keeps a private list out of the cursor when the grant is missing', async () => {
      const reader = await createTestUser()
      const [a, , c] = await makeInOrder(reader.id, 'Gap', ['public', 'private', 'public'])

      const first = await myLists({ limit: 1 }, asCaller(reader))
      const second = await myLists(
        { limit: 1, after: first.page_info.end_cursor! },
        asCaller(reader),
      )

      expect([ids(first), ids(second)]).toEqual([[c.id], [a.id]])
      expect(second.page_info.has_next_page).toBe(false)
    })

    it('refuses a malformed cursor', async () => {
      expect(await myLists({ after: 'not-a-cursor' })).toEqual(INVALID_CURSOR)
    })
  })
})
