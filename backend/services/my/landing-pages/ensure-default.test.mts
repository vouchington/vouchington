import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { deriveSlugFromUsername, ensureDefaultLandingPage } from './ensure-default.mts'
import { createMyLandingPage } from './create.mts'
import { listLandingPagesForUser } from './list.mts'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'

describe('deriveSlugFromUsername', () => {
  it('lowercases and replaces underscores with hyphens', () => {
    expect(deriveSlugFromUsername('My_User_Name')).toBe('my-user-name')
    expect(deriveSlugFromUsername('already-lowercase')).toBe('already-lowercase')
    expect(deriveSlugFromUsername('MixedCase123')).toBe('mixedcase123')
  })
})

describe('ensureDefaultLandingPage', () => {
  it('propagates a storage failure without creating a default page and permits a later retry', async () => {
    const user = await createTestUser()
    const failure = await withPostgresQueryFailureForTest(
      '/* createMyLandingPage */',
      async () => {
        try {
          await ensureDefaultLandingPage(user.id, user.username!)
          throw new Error('Default page creation unexpectedly succeeded')
        } catch (err) {
          return err
        }
      },
      { command: 'INSERT' },
    )

    expect(failure.result).toMatchObject({ code: '25P02' })
    expect(failure.result).toBe(failure.error)
    expect(await listLandingPagesForUser(user.id)).toEqual([])
    await ensureDefaultLandingPage(user.id, user.username!)
    expect(await listLandingPagesForUser(user.id)).toHaveLength(1)
  })

  it('creates a default landing page for a user with no pages', async () => {
    const user = await createTestUser()

    await ensureDefaultLandingPage(user.id, user.username!)

    const pages = await listLandingPagesForUser(user.id)
    expect(pages).toHaveLength(1)
    expect(pages[0]!.is_default).toBe(true)
    expect(pages[0]!.slug).toBe(deriveSlugFromUsername(user.username!))
  })

  it('skips creation when pages already exist', async () => {
    const user = await createTestUser()

    await createMyLandingPage(user.id, { title: 'Existing', slug: 'existing-page' })

    await ensureDefaultLandingPage(user.id, user.username!)

    const pages = await listLandingPagesForUser(user.id)
    expect(pages).toHaveLength(1)
    expect(pages[0]!.slug).toBe('existing-page')
  })
})
