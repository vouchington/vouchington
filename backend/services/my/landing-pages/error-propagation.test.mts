import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createMyLandingPage } from './create.mts'
import { listLandingPagesForUser } from './list.mts'
import { updateMyLandingPage } from './update.mts'

describe('landing-page PostgreSQL error propagation', () => {
  it('preserves text encoding failures without partial create or update', async () => {
    const user = await createTestUser()
    const originalTitle = 'Original landing page title'
    const slug = `landing-page-error-${crypto.randomUUID()}`
    const page = await createMyLandingPage(user.id, { title: originalTitle, slug })
    const invalidTitle = 'Invalid\u0000landing page title'

    await expect(
      createMyLandingPage(user.id, {
        title: invalidTitle,
        slug: `landing-page-invalid-${crypto.randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: '22021' })

    const pagesAfterCreateFailure = await listLandingPagesForUser(user.id)
    expect(pagesAfterCreateFailure).toHaveLength(1)
    expect(pagesAfterCreateFailure[0]).toMatchObject({
      id: page.id,
      title: originalTitle,
      slug,
    })

    await expect(
      updateMyLandingPage(user.id, page.id, { title: invalidTitle }),
    ).rejects.toMatchObject({ code: '22021' })

    const pagesAfterUpdateFailure = await listLandingPagesForUser(user.id)
    expect(pagesAfterUpdateFailure).toHaveLength(1)
    expect(pagesAfterUpdateFailure[0]).toMatchObject({
      id: page.id,
      title: originalTitle,
      slug,
    })

    await expect(
      updateMyLandingPage(user.id, page.id, { title: 'Updated after encoding failures' }),
    ).resolves.toMatchObject({ id: page.id, title: 'Updated after encoding failures' })
  })
})
