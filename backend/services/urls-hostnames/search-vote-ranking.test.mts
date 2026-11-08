import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestTopic,
  insertTestUrlHostname,
  setTestTopicHostnameLink,
  setUrlHostnameVotes,
} from '@voucha/test-helpers'
import { searchUrlHostnames } from './search.mts'

describe('hostname vote ranking', () => {
  const prefix = `vote-ranking-${randomUUID()}`
  const ownedIds: string[] = []
  let topicId: string
  let confidentId: string
  let contestedId: string
  let mixedNegativeId: string
  let negativeId: string
  let unvotedId: string

  beforeAll(async () => {
    topicId = (await createTestTopic()).id
    const ids = await Promise.all(
      ['confident', 'contested', 'mixed', 'tie-a', 'tie-b'].map(name =>
        insertTestUrlHostname({ hostname: `${prefix}-${name}.example.com` }),
      ),
    )
    ownedIds.push(...ids)
    confidentId = ids[0]!
    contestedId = ids[1]!
    mixedNegativeId = ids[2]!
    // Put the negative hostname first in the id tie so an extra net-score key changes the page.
    const tied = ids.slice(3).toSorted((a, b) => b.localeCompare(a))
    negativeId = tied[0]!
    unvotedId = tied[1]!
    await Promise.all(ownedIds.map(id => setTestTopicHostnameLink(topicId, id)))
    await Promise.all([
      setUrlHostnameVotes(confidentId, 5, 0),
      setUrlHostnameVotes(contestedId, 100, 90),
      setUrlHostnameVotes(mixedNegativeId, 1, 100),
      setUrlHostnameVotes(negativeId, 0, 1),
    ])
  })

  afterAll(async () => {
    await Promise.all(ownedIds.map(id => setUrlHostnameVotes(id, 0, 0)))
  })

  it('paginates trust by confidence through negative and unvoted score ties', async () => {
    const options = { query: prefix, sort: 'trust' as const, limit: 2 }
    const first = await searchUrlHostnames(options)
    expect(first.results.map(row => row.id)).toEqual([confidentId, contestedId])
    expect(first.results.map(row => row.votes_score_net)).toEqual([5, 10])
    expect(first.page_info.has_next_page).toBe(true)
    expect(first.results[0]).not.toHaveProperty('cursor_score')
    expect(first.results[0]).not.toHaveProperty('votes_score_sort')

    const second = await searchUrlHostnames({ ...options, after: first.page_info.end_cursor! })
    expect(second.results.map(row => row.id)).toEqual([mixedNegativeId, negativeId])
    expect(second.results.map(row => row.votes_score_net)).toEqual([-99, -1])
    expect(second.page_info.has_next_page).toBe(true)

    const third = await searchUrlHostnames({ ...options, after: second.page_info.end_cursor! })
    expect(third.results.map(row => row.id)).toEqual([unvotedId])
    expect(third.page_info.has_next_page).toBe(false)
  })

  it('paginates trust within a topic using confidence', async () => {
    const options = { topic_id: topicId, sort: 'trust' as const, limit: 1 }
    const first = await searchUrlHostnames(options)
    expect(first.results.map(row => row.id)).toEqual([confidentId])
    expect(first.page_info.has_next_page).toBe(true)
    expect(first.results[0]).not.toHaveProperty('cursor_score')
    expect(first.results[0]).not.toHaveProperty('votes_score_sort')

    const second = await searchUrlHostnames({ ...options, after: first.page_info.end_cursor! })
    expect(second.results.map(row => row.id)).toEqual([contestedId])
    expect(second.page_info.has_next_page).toBe(true)

    const third = await searchUrlHostnames({ ...options, after: second.page_info.end_cursor! })
    expect(third.results.map(row => row.id)).toEqual([mixedNegativeId])
    expect(third.results[0]?.votes_score_net).toBe(-99)
    expect(third.page_info.has_next_page).toBe(true)
  })
})
