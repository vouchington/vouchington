import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser, getTopicRevisionsForTest } from '@voucha/test-helpers'
import { createTopicAliases, createUnlinkedTopicAlias } from './aliases.mts'
import { getTopicAliasesForTest } from '@voucha/test-helpers/topic-aliases'
import {
  createTopicMergeAliasTestOperation,
  deleteTopicMergeAliasTestOperation,
  runTopicMergeAliasTestPage,
} from '@voucha/test-helpers/topic-merge-alias-pages'

describe('bounded topic merge alias history', () => {
  it('crosses each alias page boundary and retains exact sorted revision snapshots', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user: admin })
    const destination = await createTestTopic({ user: admin })
    const marker = crypto.randomUUID()
    const sourceAliases = [`a-first-${marker}`, `z-last-${marker}`]
    const destinationAliases = [`b-existing-${marker}`, `c-existing-${marker}`]
    await createTopicAliases(source.id, sourceAliases)
    await createTopicAliases(destination.id, destinationAliases)
    await createUnlinkedTopicAlias(source.slug)
    const operationId = await createTopicMergeAliasTestOperation(
      source.id,
      destination.id,
      admin.id,
    )
    const pages = [0, 0, 0, 0, 0]
    try {
      let done = false
      for (let page = 0; page < 30 && !done; page++) {
        const result = await runTopicMergeAliasTestPage(operationId, 1)
        pages[result.phase]!++
        done = result.done
      }
      expect(done).toBe(true)
      for (const phase of [0, 1, 2, 4]) expect(pages[phase]).toBeGreaterThan(1)
      const aliasesAfter = [...destinationAliases, source.slug, ...sourceAliases].toSorted()
      await expect(getTopicAliasesForTest(source.id)).resolves.toEqual({
        results: [],
        hasNextPage: false,
      })
      await expect(getTopicAliasesForTest(destination.id)).resolves.toEqual({
        results: aliasesAfter,
        hasNextPage: false,
      })
      const sourceRevision = (await getTopicRevisionsForTest(source.id)).at(-1)
      const destinationRevision = (await getTopicRevisionsForTest(destination.id)).at(-1)
      expect(sourceRevision?.changes.changes).toEqual({
        topic_aliases: {
          before: [source.slug, ...sourceAliases].toSorted(),
          after: [],
        },
      })
      expect(destinationRevision?.changes.changes).toEqual({
        topic_aliases: {
          before: destinationAliases.toSorted(),
          after: aliasesAfter,
        },
      })
      expect(sourceRevision?.changes.revised_by_roles).toContain('administrator')
      expect(destinationRevision?.changes.revised_by_roles).toContain('administrator')
    } finally {
      await deleteTopicMergeAliasTestOperation(operationId)
    }
  })
})
