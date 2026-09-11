import { describe, it, expect } from 'vitest'
import { getTopicBySlug } from '@services/topics/get'
import { getTopicParents } from '@services/topics/hierarchy'
import { seedTopicsFromRows } from './seed-csvs.mts'

describe('seedTopicsFromRows', () => {
  it('imports a fixture batch, linking a cross-row parent relation on the pass-2 retry', async () => {
    const suffix = crypto.randomUUID()
    const parentSlug = `seed-csvs-parent-${suffix}`
    const childSlug = `seed-csvs-child-${suffix}`
    const standaloneSlug = `seed-csvs-standalone-${suffix}`
    // `topics.name` has its own global unique index (idx_topics__name, LOWER(name)), independent
    // of the slug's unique index — a fixed name collides with a prior run's leftover row against
    // the persistent local/dirty DB, so the suffix has to appear in both.
    const childName = `Seed CSV Child ${suffix}`
    const parentName = `Seed CSV Parent ${suffix}`
    const standaloneName = `Seed CSV Standalone ${suffix}`

    // The child row is listed before its parent, so pass 1 must silently skip the parent link
    // (the parent doesn't exist yet — see seed-csvs.mts's pass-2 comment) and pass 2 must
    // establish it once every row in the batch has been created.
    const rows = [
      { slug: childSlug, name: childName, parent_slugs: parentSlug },
      { slug: parentSlug, name: parentName, parent_slugs: '' },
      { slug: standaloneSlug, name: standaloneName, parent_slugs: '' },
    ]

    const result = await seedTopicsFromRows(rows)

    expect(result).toEqual({ processed: rows.length, errors: [] })

    const [child, parent, standalone] = await Promise.all([
      getTopicBySlug(childSlug),
      getTopicBySlug(parentSlug),
      getTopicBySlug(standaloneSlug),
    ])
    expect(child?.name).toBe(childName)
    expect(parent?.name).toBe(parentName)
    expect(standalone?.name).toBe(standaloneName)

    const parents = await getTopicParents(child!.id)
    expect(parents.map(topic => topic.id)).toEqual([parent!.id])
  })
})
