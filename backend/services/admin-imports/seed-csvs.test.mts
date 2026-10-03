import { createTestUser } from '@voucha/test-helpers'
import { importAdminTopics } from './topic-import.mts'
import { createTopic } from '@services/topics/create'
import { SYSTEM_PROVENANCE } from '@voucha/types/entities/content-provenance'
import { upsertSystemUser } from '@services/users/system-users'
import { getPrivateUserByAny } from '@services/users/get'
import { describe, it, expect } from 'vitest'
import { getTopicBySlug } from '@services/topics/get'
import { getTopicParents } from '@services/topics/hierarchy'
import { seedTopicsFromRows } from './seed-csvs.mts'

describe('seedTopicsFromRows', () => {
  it('rejects a nonstaff administrative import and unscoped system writes', async () => {
    const suffix = crypto.randomUUID()
    const ordinary = await createTestUser()
    const slug = `nonstaff-import-${suffix}`
    await expect(
      importAdminTopics(ordinary, `slug,name\n${slug},Rejected ${suffix}`),
    ).rejects.toMatchObject({ status: 403 })
    await expect(getTopicBySlug(slug)).resolves.toBeNull()
    const system = await upsertSystemUser(`unscoped-seed-${suffix}`)
    const actor = (await getPrivateUserByAny(system.id, { readOnly: false }))!
    await expect(
      createTopic(actor, SYSTEM_PROVENANCE, { slug, name: `Rejected ${suffix}` }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(getTopicBySlug(slug)).resolves.toBeNull()
  })

  it('imports a fixture batch, linking a cross-row parent relation on the pass-2 retry', async () => {
    const suffix = crypto.randomUUID()
    const system = await upsertSystemUser(`seed-actor-${suffix}`)
    const actor = (await getPrivateUserByAny(system.id, { readOnly: false }))!
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

    const result = await seedTopicsFromRows(actor, rows)

    expect(result).toEqual({ processed: rows.length, errors: [] })

    const [child, parent, standalone] = await Promise.all([
      getTopicBySlug(childSlug),
      getTopicBySlug(parentSlug),
      getTopicBySlug(standaloneSlug),
    ])
    expect(child?.name).toBe(childName)
    expect(parent?.name).toBe(parentName)
    expect(standalone?.name).toBe(standaloneName)
    expect(actor).toMatchObject({ account_type: 'system', roles: [] })
    expect(child?.created_by?.id).toBe(actor.id)
    expect(parent?.created_by?.id).toBe(actor.id)
    expect(standalone?.created_by?.id).toBe(actor.id)
    const persistedActor = await getPrivateUserByAny(actor.id, { readOnly: false })
    expect(persistedActor).toMatchObject({ account_type: 'system', roles: [] })

    const parents = await getTopicParents(child!.id)
    expect(parents.map(topic => topic.id)).toEqual([parent!.id])
  })

  it('keeps importing valid rows and returns the invalid row error', async () => {
    const suffix = crypto.randomUUID()
    const system = await upsertSystemUser(`seed-actor-${suffix}`)
    const actor = (await getPrivateUserByAny(system.id, { readOnly: false }))!
    const invalidSlug = `seed-csvs-invalid-${suffix}`
    const validSlug = `seed-csvs-valid-${suffix}`

    const result = await seedTopicsFromRows(actor, [
      {
        slug: invalidSlug,
        name: `Invalid seed topic ${suffix}`,
        topic_type: 'not-a-topic-type',
      },
      {
        slug: validSlug,
        name: `Valid seed topic ${suffix}`,
      },
    ])

    expect(result.processed).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({
      slug: invalidSlug,
      error: { status: 422, message: expect.stringContaining('Invalid topic type') },
    })
    await expect(getTopicBySlug(validSlug)).resolves.toMatchObject({
      slug: validSlug,
      name: `Valid seed topic ${suffix}`,
    })
  })
})
