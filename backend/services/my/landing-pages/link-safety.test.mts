import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestUrlHostname } from '@voucha/test-helpers'
import { createMyLandingPage } from './create.mts'
import { getMyLandingPage } from './get.mts'
import { replaceMyLandingPageItems } from './replace-items.mts'

describe('landing page link safety', () => {
  it('rejects a blocked hostname without replacing existing items', async () => {
    const user = await createTestUser()
    const page = await createMyLandingPage(user.id, { title: 'Safe links', slug: 'safe-links' })
    await replaceMyLandingPageItems(user.id, page.id, [
      { type: 'link', label: 'Existing', url: 'https://example.com/existing' },
    ])
    const hostname = `blocked-${randomUUID()}.example.com`
    await insertTestUrlHostname({ hostname, blocked: true })

    await expect(
      replaceMyLandingPageItems(user.id, page.id, [
        { type: 'link', label: 'Blocked', url: `https://${hostname}/page` },
      ]),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('blocked') })
    expect((await getMyLandingPage(user.id, page.id)).items).toEqual([
      expect.objectContaining({
        type: 'link',
        label: 'Existing',
        url: 'https://example.com/existing',
      }),
    ])
  })

  it('rejects nonpublic destinations and resolves normalized links', async () => {
    const user = await createTestUser()
    const page = await createMyLandingPage(user.id, {
      title: 'Normalized links',
      slug: 'normalized-links',
    })
    await expect(
      replaceMyLandingPageItems(user.id, page.id, [
        { type: 'link', label: 'Local', url: 'http://127.0.0.1/private' },
      ]),
    ).rejects.toMatchObject({ status: 422 })
    const result = await replaceMyLandingPageItems(user.id, page.id, [
      { type: 'link', label: 'Public', url: 'http://EXAMPLE.COM/normalized' },
    ])
    expect(result.items[0]).toMatchObject({ type: 'link', url: 'https://example.com/normalized' })
  })
})
