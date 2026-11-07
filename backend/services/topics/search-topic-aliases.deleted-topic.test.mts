import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser, softDeleteTopic } from '@voucha/test-helpers'
import { createTopicAliases } from './aliases.mts'
import { searchTopicAliases } from './search-topic-aliases.mts'

describe('searchTopicAliases deleted topics', () => {
  it('returns later aliases when a deleted topic sits between them', async () => {
    const user = await createTestUser()
    const prefix = `zzbound${crypto.randomUUID().slice(0, 8)}`
    const topics = []
    for (const suffix of ['a', 'b', 'c']) {
      const topic = await createTestTopic({ user, name: `${prefix} ${suffix}` })
      await createTopicAliases(topic.id, `${prefix}-${suffix}`)
      topics.push(topic)
    }
    await softDeleteTopic(topics[1]!.id, user.id)

    const seen: string[] = []
    let after: string | undefined
    let emptyContinuation = false
    for (let step = 0; step < 6; step++) {
      const page = await searchTopicAliases({ prefixQuery: prefix, limit: 1, after })
      seen.push(...page.results.map(row => row.alias))
      if (page.results.length === 0 && page.hasNextPage) emptyContinuation = true
      if (!page.hasNextPage) break
      after = page.endAlias ?? undefined
    }

    expect(seen).toEqual([`${prefix}-a`, `${prefix}-c`])
    expect(emptyContinuation).toBe(true)
  })
})
