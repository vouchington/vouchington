import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { getTestLandingPageCount } from '@voucha/test-helpers/landing-page-count'
import { runTestLandingPageDeleteRace } from '@voucha/test-helpers/landing-page-delete-race'
import { createMyLandingPage } from './create.mts'
import { deleteMyLandingPage, deleteLandingPageInTransaction } from './delete.mts'
import { listLandingPagesForUser } from './list.mts'

describe('landing page concurrent deletion', () => {
  it('promotes the survivor when default and next page are deleted concurrently', async () => {
    const user = await createTestUserDirect()
    const first = await createMyLandingPage(user.id, { title: 'Default', slug: 'default' })
    const second = await createMyLandingPage(user.id, { title: 'Next default', slug: 'second' })
    const third = await createMyLandingPage(user.id, { title: 'Survivor', slug: 'third' })
    expect(first.is_default).toBe(true)
    expect(second.is_default).toBe(false)
    await runTestLandingPageDeleteRace({
      deleteHeld: query => deleteLandingPageInTransaction(user.id, first.id, query),
      deleteOther: () => deleteMyLandingPage(user.id, second.id),
    })
    expect(await listLandingPagesForUser(user.id)).toMatchObject([
      { id: third.id, is_default: true },
    ])
    expect(await getTestLandingPageCount(user.id)).toBe(1)
  })

  it('does not delete an owned page when the requested page does not exist', async () => {
    const user = await createTestUserDirect()
    await createMyLandingPage(user.id, { title: 'Owned', slug: 'owned' })
    await expect(deleteMyLandingPage(user.id, randomUUID())).rejects.toMatchObject({ status: 404 })
    expect(await getTestLandingPageCount(user.id)).toBe(1)
  })
})
