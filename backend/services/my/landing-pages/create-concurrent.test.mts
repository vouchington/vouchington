import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { getTestLandingPageCount } from '@voucha/test-helpers/landing-page-count'
import { runTestLandingPageFirstCreateRace } from '@voucha/test-helpers/landing-page-create-race'
import { runTestLandingPageDeleteRace } from '@voucha/test-helpers/landing-page-delete-race'
import { createMyLandingPage, insertLandingPageRecord } from './create.mts'
import { deleteLandingPageInTransaction } from './delete.mts'
import { listLandingPagesForUser, listLandingPagesForUserPage } from './list.mts'
import { getPublicLandingPage } from './public.mts'
import { getMyLandingPage } from './get.mts'
import { updateMyLandingPage } from './update.mts'

describe('landing page concurrent first/default creation', () => {
  it('admits two first creates with distinct slugs and exactly one default', async () => {
    const user = await createTestUserDirect()
    expect(await listLandingPagesForUser(user.id)).toEqual([])
    const { held, other } = await runTestLandingPageFirstCreateRace({
      createHeld: query =>
        insertLandingPageRecord(user.id, { title: 'First', subtitle: null, slug: 'first' }, query),
      createOther: () => createMyLandingPage(user.id, { title: 'Second', slug: 'second' }),
    })
    expect(held.is_default).toBe(true)
    expect(other.is_default).toBe(false)
    const pages = await listLandingPagesForUser(user.id)
    expect(pages.map(page => page.id).toSorted()).toEqual([held.id, other.id].toSorted())
    expect(pages.filter(page => page.is_default).map(page => page.id)).toEqual([held.id])
    expect(await getTestLandingPageCount(user.id)).toBe(2)
  })

  it('keeps one effective default after a create races deletion of the only page', async () => {
    const user = await createTestUserDirect()
    const original = await createMyLandingPage(user.id, { title: 'Original', slug: 'original' })
    await runTestLandingPageDeleteRace({
      queryMarker: 'createMyLandingPage',
      deleteHeld: query => deleteLandingPageInTransaction(user.id, original.id, query),
      deleteOther: async () => {
        const replacement = await createMyLandingPage(user.id, {
          title: 'Replacement',
          slug: 'replacement',
        })
        expect(replacement.slug).toBe('replacement')
      },
    })
    expect(await listLandingPagesForUser(user.id)).toMatchObject([
      { slug: 'replacement', is_default: true },
    ])
    expect((await getPublicLandingPage(user.username!))?.landing_page.slug).toBe('replacement')
    const paged = await listLandingPagesForUserPage(user.id, { limit: 1 })
    expect(paged.results).toMatchObject([{ slug: 'replacement', is_default: true }])
    const fallbackId = paged.results[0]!.id
    expect((await getMyLandingPage(user.id, fallbackId)).is_default).toBe(true)
    expect(
      (await updateMyLandingPage(user.id, fallbackId, { title: 'Updated replacement' })).is_default,
    ).toBe(true)
    const later = await createMyLandingPage(user.id, { title: 'Later', slug: 'later' })
    expect(later.is_default).toBe(false)
    const firstPage = await listLandingPagesForUserPage(user.id, { limit: 1 })
    expect(firstPage.page_info.has_next_page).toBe(true)
    const nextPage = await listLandingPagesForUserPage(user.id, {
      limit: 1,
      after: firstPage.page_info.end_cursor,
    })
    expect(nextPage.results).toMatchObject([{ id: later.id, is_default: false }])
    expect((await getPublicLandingPage(user.username!))?.landing_page.id).toBe(fallbackId)
    expect(await getTestLandingPageCount(user.id)).toBe(2)
  })
})
