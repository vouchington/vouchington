import { upsertSystemUser } from '@services/users/system-users'
import { getPrivateUserByAny } from '@services/users/get'
import { describe, expect, it } from 'vitest'
import { getTopicBySlug } from '@services/topics/get'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
import { seedTopicsFromRows } from '../seed-csvs.mts'

describe('seed second-pass recovery', () => {
  it('returns a second-pass row failure while retaining the first-pass topic', async () => {
    const suffix = crypto.randomUUID()
    const system = await upsertSystemUser(`seed-actor-${suffix}`)
    const actor = (await getPrivateUserByAny(system.id, { readOnly: false }))!
    const slug = `seed-recovery-child-${suffix}`
    const name = `Seed recovery child ${suffix}`
    const { result, error } = await withPostgresQueryFailureForTest(
      '/* updateTopicInStore */',
      () =>
        seedTopicsFromRows(actor, [{ slug, name, parent_slugs: `seed-recovery-parent-${suffix}` }]),
      { command: 'UPDATE' },
    )

    expect(error).toMatchObject({ code: '25P02' })
    expect(result.processed).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.slug).toBe(slug)
    expect(result.errors[0]?.error).toBe(error)
    expect(await getTopicBySlug(slug)).toMatchObject({ slug, name })
  })
})
