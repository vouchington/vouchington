import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { hardDeleteTestUser } from '@voucha/test-helpers/entities/users-lifecycle'
import {
  getTestLandingPageCount,
  rollBackTestLandingPageInsert,
  seedTestLandingPageCount,
  upsertTestLandingPage,
} from '@voucha/test-helpers/landing-page-count'
import { createMyLandingPage } from './create.mts'
import { deleteMyLandingPage } from './delete.mts'
import { listLandingPagesForUser } from './list.mts'
import { MAX_LANDING_PAGES } from './shared.mts'
import { landingPageLimitsConfig } from './limits.mts'

describe('landing page slots', () => {
  it('caps concurrent inserts and admits another after deletion', async () => {
    const user = await createTestUser()
    await seedTestLandingPageCount(user.id, MAX_LANDING_PAGES - 1)
    const outcomes = await Promise.allSettled([
      createMyLandingPage(user.id, { title: 'A', slug: 'a' }),
      createMyLandingPage(user.id, { title: 'B', slug: 'b' }),
    ])
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1)
    expect(await getTestLandingPageCount(user.id)).toBe(MAX_LANDING_PAGES)
    const pages = await listLandingPagesForUser(user.id)
    expect(pages).toHaveLength(MAX_LANDING_PAGES)
    await deleteMyLandingPage(user.id, pages.find(page => !page.is_default)!.id)
    expect(await getTestLandingPageCount(user.id)).toBe(MAX_LANDING_PAGES - 1)
    await createMyLandingPage(user.id, { title: 'Replacement', slug: 'replacement' })
    expect(await getTestLandingPageCount(user.id)).toBe(MAX_LANDING_PAGES)
  })

  it('enforces a lowered configured cap even when a lower slot is free', async () => {
    const user = await createTestUser()
    const first = await createMyLandingPage(user.id, { title: 'First', slug: 'first' })
    const second = await createMyLandingPage(user.id, { title: 'Second', slug: 'second' })
    await createMyLandingPage(user.id, { title: 'Third', slug: 'third' })
    await deleteMyLandingPage(user.id, first.id)
    onTestFinished(
      overrideDynamicConfigFieldsForTest(landingPageLimitsConfig, { pages_per_user: 2 }),
    )
    await expect(
      createMyLandingPage(user.id, { title: 'Overflow', slug: 'overflow' }),
    ).rejects.toMatchObject({ status: 400 })
    await deleteMyLandingPage(user.id, second.id)
    await createMyLandingPage(user.id, { title: 'Replacement', slug: 'replacement' })
  })

  it('rolls back inserts, ignores upsert updates, and cascades with the owner', async () => {
    const user = await createTestUser()
    const page = await createMyLandingPage(user.id, { title: 'First', slug: 'first' })
    await rollBackTestLandingPageInsert(user.id)
    await upsertTestLandingPage(user.id, page.id)
    expect(await getTestLandingPageCount(user.id)).toBe(1)
    await hardDeleteTestUser(user.id)
    expect(await getTestLandingPageCount(user.id)).toBe(0)
  })
})
