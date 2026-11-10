import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createMyLandingPage } from './create.mts'
import { listLandingPagesForUser } from './list.mts'
import { setMyLandingPageDefault } from './set-default.mts'
import { insertTestLandingPagesInPromotionOrder } from '@voucha/test-helpers/landing-page-default'

describe('setMyLandingPageDefault', () => {
  it('promotes a heap row preceding the current default without a unique-index collision', async () => {
    const user = await createTestUser()
    const { targetId, defaultId, targetPrecedesDefault } =
      await insertTestLandingPagesInPromotionOrder(user.id)
    expect(targetPrecedesDefault).toBe(true)
    expect((await setMyLandingPageDefault(user.id, targetId)).is_default).toBe(true)
    const pages = await listLandingPagesForUser(user.id)
    expect(pages.find(page => page.id === defaultId)?.is_default).toBe(false)
    expect(pages.filter(page => page.is_default).map(page => page.id)).toEqual([targetId])
  })

  it('keeps the current default when the requested page belongs to another user', async () => {
    const user = await createTestUser()
    const other = await createTestUser()
    const page = await createMyLandingPage(user.id, { title: 'Own', slug: 'own' })
    const foreign = await createMyLandingPage(other.id, { title: 'Foreign', slug: 'foreign' })
    await expect(setMyLandingPageDefault(user.id, foreign.id)).rejects.toMatchObject({
      status: 404,
    })
    expect(
      (await listLandingPagesForUser(user.id)).find(row => row.id === page.id)?.is_default,
    ).toBe(true)
  })
})
