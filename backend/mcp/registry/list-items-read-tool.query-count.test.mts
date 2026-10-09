import { addListItem } from '@services/lists'
import {
  createRandomString,
  createTestUser,
  insertTestList,
  insertTestPost,
} from '@voucha/test-helpers'
import {
  callStructuredMcpTool,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'
import { captureScopedTestQueries } from '@voucha/test-helpers/query-capture'
import { beforeAll, describe, expect, it } from 'vitest'

type Page = { success: true; results: { entity_id: string }[] }
type Parent = { id: string; root: string }

const random = createRandomString(6)

describe('get_list_items thread resolution — real DB', () => {
  let owner: McpContractCaller
  let counter = 0

  const getItems = (listId: string) =>
    callStructuredMcpTool(owner, 'get_list_items', { list_id: listId }, [
      'lists:read',
    ]) as Promise<Page>
  const post = (privacy: 'public' | 'private', parent?: Parent) => {
    const label = `${random}-${(counter += 1)}`
    return insertTestPost({
      title: `Thread ${label}`,
      slug: `thread-${label}`,
      createdById: owner.id,
      markdown: 'Body',
      privacy,
      broadcast: privacy === 'private' ? 'users' : 'everyone',
      ...(parent && { postType: 'comment' as const, parentId: parent.id, rootId: parent.root }),
    })
  }
  async function listOf(postIds: string[]): Promise<string> {
    const list = await insertTestList({
      ownerUserId: owner.id,
      name: `Threads ${random} ${(counter += 1)}`,
      visibility: 'public',
    })
    for (const postId of postIds) await addListItem(list.id, 'post', postId)
    return list.id
  }

  beforeAll(async () => {
    owner = { ...(await createTestUser()), membership_plan: null }
  })

  it('hides every comment of a thread whose root the caller may not read', async () => {
    const publicRoot = await post('public')
    const publicReply = await post('public', { id: publicRoot, root: publicRoot })
    const nestedReply = await post('public', { id: publicReply, root: publicRoot })
    const privateRoot = await post('private')
    const hiddenReply = await post('public', { id: privateRoot, root: privateRoot })
    const listId = await listOf([publicRoot, publicReply, nestedReply, privateRoot, hiddenReply])

    const page = await getItems(listId)

    expect(page.results.map(item => item.entity_id)).toEqual([nestedReply, publicReply, publicRoot])
  })

  it('issues the same number of queries however many items the page holds', async () => {
    const [first, second, hidden] = [
      await post('public'),
      await post('public'),
      await post('private'),
    ]
    const replies = [
      await post('public', { id: first, root: first }),
      await post('public', { id: second, root: second }),
    ]
    const small = await listOf([first])
    const large = await listOf([first, second, hidden, ...replies])
    // Warm the entity cache so both pages read the same way.
    await getItems(small)
    await getItems(large)

    const smallQueries = await captureScopedTestQueries(() => getItems(small))
    const largeQueries = await captureScopedTestQueries(() => getItems(large))

    expect(smallQueries.length).toBeGreaterThan(0)
    expect(largeQueries.length).toBe(smallQueries.length)
  })
})
