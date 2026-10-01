import { createTestUser } from '@voucha/test-helpers'
import { insertTestTopicParentRelation } from '@voucha/test-helpers/entities/topic-hierarchy'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import type { PrivateUser } from '@services/users/types'
import { beforeAll, describe, expect, it } from 'vitest'

type Summary = { id: string; name: string; slug: string; topic_type: string }
type Details = {
  success: boolean
  id: string
  parents?: Summary[]
  children?: Summary[]
  children_page_info?: {
    has_next_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
}

const SCOPES = ['topics:read'] as const

// Every result goes through the real call path, which checks it against the tool's published output
// schema. The children cursor is the one the tool itself returned, fed back as `children_after`.
describe('get_topic_details hierarchy — real DB', () => {
  const suffix = crypto.randomUUID().slice(0, 8)
  let caller: PrivateUser & { membership_plan: null }
  let bank: string
  let otherBank: string
  let card: string
  let childIds: string[]

  const details = (args: Record<string, unknown>) =>
    callStructuredMcpTool(caller, 'get_topic_details', args, SCOPES) as Promise<Details>

  const createTopic = (name: string, topicType: 'topic' | 'card' = 'topic') =>
    insertTestTopic({
      name: `${name} ${suffix}`,
      slug: `${name.toLowerCase().replaceAll(' ', '-')}-${suffix}`,
      createdById: caller.id,
      topicType,
    })

  beforeAll(async () => {
    const user = await createTestUser()
    caller = { ...user, membership_plan: null }
    bank = await createTopic('Hierarchy Bank')
    otherBank = await createTopic('Hierarchy Other Bank')
    card = await createTopic('Hierarchy Card', 'card')
    childIds = [card]
    await insertTestTopicParentRelation({
      childTopicId: card,
      parentTopicId: bank,
      createdById: caller.id,
    })
    for (const index of [2, 3]) {
      const child = await createTopic(`Hierarchy Card ${index}`, 'card')
      childIds.push(child)
      await insertTestTopicParentRelation({
        childTopicId: child,
        parentTopicId: bank,
        createdById: caller.id,
      })
    }
  })

  it('returns no related topics unless hierarchy is set', async () => {
    const result = await details({ topic_id: bank })

    expect(result).toMatchObject({ success: true, id: bank })
    expect(result).not.toHaveProperty('parents')
    expect(result).not.toHaveProperty('children')
    expect(result).not.toHaveProperty('children_page_info')
  })

  it('returns the parents of a child topic and leaves the children out', async () => {
    const result = await details({ topic_id: card, hierarchy: 'parents' })

    expect(result.parents).toEqual([
      {
        id: bank,
        name: `Hierarchy Bank ${suffix}`,
        slug: `hierarchy-bank-${suffix}`,
        topic_type: 'topic',
      },
    ])
    expect(result).not.toHaveProperty('children')
    expect(result).not.toHaveProperty('children_page_info')
  })

  it('returns one page of the children of a parent topic and leaves the parents out', async () => {
    const result = await details({ topic_id: bank, hierarchy: 'children' })

    expect(result.children!.map(child => child.id)).toEqual(childIds.toSorted())
    expect(result.children![0]).toMatchObject({ topic_type: 'card' })
    expect(result.children_page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(result).not.toHaveProperty('parents')
  })

  it('returns both directions, by slug, for a topic that has each', async () => {
    const middle = await createTopic('Hierarchy Middle')
    const leaf = await createTopic('Hierarchy Leaf')
    await insertTestTopicParentRelation({
      childTopicId: middle,
      parentTopicId: otherBank,
      createdById: caller.id,
    })
    await insertTestTopicParentRelation({
      childTopicId: leaf,
      parentTopicId: middle,
      createdById: caller.id,
    })

    const result = await details({ topic_id: `hierarchy-middle-${suffix}`, hierarchy: 'both' })

    expect(result.id).toBe(middle)
    expect(result.parents!.map(parent => parent.id)).toEqual([otherBank])
    expect(result.children!.map(child => child.id)).toEqual([leaf])
  })

  it('returns empty lists for a topic with no relations', async () => {
    const isolated = await createTopic('Hierarchy Isolated')

    const result = await details({ topic_id: isolated, hierarchy: 'both' })

    expect(result).toMatchObject({ parents: [], children: [] })
    expect(result.children_page_info).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
  })

  it('pages the children with no overlap by following children_page_info.end_cursor', async () => {
    const first = await details({ topic_id: bank, hierarchy: 'children', children_limit: 2 })
    expect(first.children).toHaveLength(2)
    expect(first.children_page_info!.has_next_page).toBe(true)
    expect(first.children_page_info!.end_cursor).toEqual(expect.any(String))

    const second = await details({
      topic_id: bank,
      hierarchy: 'children',
      children_limit: 2,
      children_after: first.children_page_info!.end_cursor!,
    })

    expect(second.children).toHaveLength(1)
    expect(second.children_page_info!.has_next_page).toBe(false)
    const ids = [...first.children!, ...second.children!].map(child => child.id)
    expect(ids).toEqual(childIds.toSorted())
  })

  it('clamps an oversized children_limit and rejects what REST pagination rejects', async () => {
    const clamped = await details({
      topic_id: bank,
      hierarchy: 'children',
      children_limit: 100_000,
    })
    const cursor = (await details({ topic_id: bank, hierarchy: 'children', children_limit: 1 }))
      .children_page_info!.end_cursor!

    expect(clamped.children).toHaveLength(childIds.length)
    await expect(
      callRejectedMcpTool(
        caller,
        'get_topic_details',
        { topic_id: bank, hierarchy: 'children', children_limit: 0 },
        SCOPES,
      ),
    ).resolves.toContain('/children_limit must be >= 1')
    await expect(
      callRejectedMcpTool(
        caller,
        'get_topic_details',
        { topic_id: bank, hierarchy: 'children', children_after: 'not-a-cursor' },
        SCOPES,
      ),
    ).resolves.toContain('Tool execution failed')
    await expect(
      callRejectedMcpTool(
        caller,
        'get_topic_details',
        { topic_id: otherBank, hierarchy: 'children', children_after: cursor },
        SCOPES,
      ),
    ).resolves.toContain('Tool execution failed')
  })

  it('still reports an unknown topic as a normal result when hierarchy is set', async () => {
    const result = await details({ topic_id: `missing-topic-${suffix}`, hierarchy: 'both' })

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
  })
})
