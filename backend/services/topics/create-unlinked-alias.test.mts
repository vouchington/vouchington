import { describe, expect, it } from 'vitest'
import { createRandomString } from '@voucha/test-helpers'
import { createUnlinkedTopicAlias, createUnlinkedTopicAliases } from './aliases.mts'

describe('createUnlinkedTopicAliases', () => {
  it('creates new aliases and returns existing ones in one call, keyed by normalized key', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const existing = await createUnlinkedTopicAlias(`#batch-existing-${suffix}`)
    const aliases = await createUnlinkedTopicAliases([
      `#batch-new-${suffix}`,
      `#batch-existing-${suffix}`,
      `#batch-new-${suffix}`,
    ])
    expect(aliases.size).toBe(2)
    expect(aliases.get(existing.alias)?.id).toBe(existing.id)
    expect(aliases.get(`batch-new-${suffix}`)?.topic_id).toBeNull()
  })

  it('rejects an invalid hashtag', async () => {
    await expect(createUnlinkedTopicAliases(['   '])).rejects.toMatchObject({ status: 422 })
  })
})
