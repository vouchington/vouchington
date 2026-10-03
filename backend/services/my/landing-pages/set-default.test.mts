import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createMyLandingPage } from './create.mts'
import { deleteMyLandingPage } from './delete.mts'
import { listLandingPagesForUser } from './list.mts'
import { setMyLandingPageDefault } from './set-default.mts'
import {
  insertTestLandingPagesInPromotionOrder,
  holdTestLandingPageUserLock,
} from '@voucha/test-helpers/landing-page-default'
import { waitForTestPostgresLockWaiter } from '@voucha/test-helpers/postgres-lock-wait'

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

  it('serializes promotions behind the same user lock used by creation', async () => {
    const user = await createTestUser()
    const first = await createMyLandingPage(user.id, { title: 'First', slug: 'first' })
    const second = await createMyLandingPage(user.id, { title: 'Second', slug: 'second' })
    await using lock = await holdTestLandingPageUserLock(user.id)
    const promotion = setMyLandingPageDefault(user.id, second.id)
    try {
      await waitForTestPostgresLockWaiter(lock.processId, 'lockUserLandingPages')
    } finally {
      await lock.release()
    }
    await promotion
    await Promise.all([
      setMyLandingPageDefault(user.id, first.id),
      setMyLandingPageDefault(user.id, second.id),
    ])
    expect((await listLandingPagesForUser(user.id)).filter(page => page.is_default)).toHaveLength(1)
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

  it('serializes default deletion with promotion and retains one default', async () => {
    const user = await createTestUser()
    const first = await createMyLandingPage(user.id, { title: 'First', slug: 'first' })
    const second = await createMyLandingPage(user.id, { title: 'Second', slug: 'second' })
    await using lock = await holdTestLandingPageUserLock(user.id)
    const deletion = deleteMyLandingPage(user.id, first.id)
    let promotion: ReturnType<typeof setMyLandingPageDefault> | undefined
    try {
      await waitForTestPostgresLockWaiter(lock.processId, 'lockUserLandingPages')
      promotion = setMyLandingPageDefault(user.id, second.id)
    } finally {
      await lock.release()
    }
    await Promise.all([deletion, promotion])
    expect(
      (await listLandingPagesForUser(user.id)).filter(page => page.is_default).map(page => page.id),
    ).toEqual([second.id])
  })
})
