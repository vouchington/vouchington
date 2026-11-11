import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  insertTestTopicParentRelation,
} from '@voucha/test-helpers'
import { searchUrlHostnames } from './search.mts'

describe('hostname topic filters without a text query', () => {
  const suffix = randomUUID().slice(0, 8)

  it('walks descendant topics and requires every root for topic_match=all', async () => {
    const user = await createTestUser()
    const firstRoot = await createTestTopic({ hostname: `walk-${suffix}-root-1.com` })
    const secondRoot = await createTestTopic({ hostname: `walk-${suffix}-root-2.com` })
    const bothHostname = `walk-${suffix}-both.com`
    const partialHostname = `walk-${suffix}-partial.com`
    const both = await createTestTopic({ hostname: bothHostname })
    const partial = await createTestTopic({ hostname: partialHostname })
    await Promise.all(
      [
        [both, firstRoot],
        [both, secondRoot],
        [partial, firstRoot],
      ].map(([child, parent]) =>
        insertTestTopicParentRelation({
          childTopicId: child!.id,
          parentTopicId: parent!.id,
          createdById: user.id,
        }),
      ),
    )

    const all = await searchUrlHostnames({
      topic_ids: [firstRoot.id, secondRoot.id],
      topic_match: 'all',
      include_descendants: true,
    })
    expect(all.results.map(row => row.hostname)).toEqual([bothHostname])

    const any = await searchUrlHostnames({
      topic_ids: [firstRoot.id, secondRoot.id],
      include_descendants: true,
    })
    expect(any.results.map(row => row.hostname)).toEqual(
      expect.arrayContaining([bothHostname, partialHostname]),
    )
  })

  it('matches direct topics with any, and matches nothing for all', async () => {
    const first = await createTestTopic({ hostname: `direct-${suffix}-1.com` })
    const second = await createTestTopic({ hostname: `direct-${suffix}-2.com` })
    const topic_ids = [first.id, second.id]

    const any = await searchUrlHostnames({ topic_ids })
    expect(any.results.map(row => row.hostname).toSorted()).toEqual([
      `direct-${suffix}-1.com`,
      `direct-${suffix}-2.com`,
    ])

    const all = await searchUrlHostnames({ topic_ids, topic_match: 'all' })
    expect(all.results).toEqual([])
  })
})
