import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
import {
  runTestLandingPageDefaultRace,
  clearTestLandingPageDefaults,
  withTestLandingPagePromotionHeld,
} from '@voucha/test-helpers/landing-page-default-race'
import { createMyLandingPage } from './create.mts'
import { listLandingPagesForUser } from './list.mts'
import { setMyLandingPageDefault } from './set-default.mts'
import { landingPageLimitsConfig } from './limits.mts'

describe('landing page default promotion retry', () => {
  it('retries the native default-unique conflict from overlapping clear snapshots', async () => {
    const user = await createTestUserDirect()
    await createMyLandingPage(user.id, { title: 'First', slug: 'first' })
    const second = await createMyLandingPage(user.id, { title: 'Second', slug: 'second' })
    const third = await createMyLandingPage(user.id, { title: 'Third', slug: 'third' })
    const result = await runTestLandingPageDefaultRace({
      userId: user.id,
      targetPageId: second.id,
      promoteOther: () => setMyLandingPageDefault(user.id, third.id),
    })
    expect(result).toMatchObject({ id: third.id, is_default: true })
    const pages = await listLandingPagesForUser(user.id)
    expect(pages).toHaveLength(3)
    expect(pages.filter(page => page.is_default).map(page => page.id)).toEqual([third.id])
  })

  it('preserves the native default-unique error when the attempt budget is exhausted', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(landingPageLimitsConfig, { transaction_attempts: 1 }),
    )
    const user = await createTestUserDirect()
    await createMyLandingPage(user.id, { title: 'First', slug: 'first' })
    const second = await createMyLandingPage(user.id, { title: 'Second', slug: 'second' })
    const third = await createMyLandingPage(user.id, { title: 'Third', slug: 'third' })
    await runTestLandingPageDefaultRace({
      userId: user.id,
      targetPageId: second.id,
      promoteOther: () =>
        expect(setMyLandingPageDefault(user.id, third.id)).rejects.toMatchObject({
          code: '23505',
          constraint: 'idx_user_landing_pages__user_id_default',
        }),
    })
    const pages = await listLandingPagesForUser(user.id)
    expect(pages).toHaveLength(3)
    expect(pages.filter(page => page.is_default).map(page => page.id)).toEqual([second.id])
  })

  it('creates a nondefault page while the fallback page is promoted', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(landingPageLimitsConfig, { transaction_attempts: 1 }),
    )
    const user = await createTestUserDirect()
    const first = await createMyLandingPage(user.id, { title: 'First', slug: 'first' })
    await clearTestLandingPageDefaults(user.id)
    const second = await withTestLandingPagePromotionHeld(user.id, first.id, () =>
      createMyLandingPage(user.id, { title: 'Second', slug: 'second' }),
    )
    expect(second.is_default).toBe(false)
    expect(await listLandingPagesForUser(user.id)).toMatchObject([
      { id: first.id, is_default: true },
      { id: second.id, is_default: false },
    ])
  })

  it('does not retry a different slug-unique conflict', async () => {
    const user = await createTestUserDirect()
    await createMyLandingPage(user.id, { title: 'Original', slug: 'same' })
    const { queries } = await observeTestPostgresClientQueries(() =>
      expect(
        createMyLandingPage(user.id, { title: 'Duplicate', slug: 'same' }),
      ).rejects.toMatchObject({
        status: 409,
        message: 'You already have a landing page with this slug',
      }),
    )
    expect(queries.filter(query => query.text.includes('/* createMyLandingPage */'))).toHaveLength(
      1,
    )
    expect(await listLandingPagesForUser(user.id)).toHaveLength(1)
  })
})
