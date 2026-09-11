import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import { createMyLandingPage, replaceMyLandingPageItems } from '@services/my'
import { createProfileLink } from '@services/my/profile-links'
import type { PrivateUser } from '@services/users/types'

describe('Public landing pages API', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()

    const profileLink = await createProfileLink(user.id, {
      link_type: 'url',
      url: 'https://example.com/public',
      name: 'Public link',
    })

    const landingPage = await createMyLandingPage(user.id, {
      title: 'Public links',
      slug: 'public-links',
      subtitle: 'Public subtitle',
    })

    await replaceMyLandingPageItems(user.id, landingPage.id, [
      { type: 'profile_link', profile_link_id: profileLink.id },
    ])
  })
  it('returns the default public landing page by username', async () => {
    const request = createRequest()
    const response = await request.get(`/api/v1/users/${user.username}/landing-page`).expect(200)

    expect(response.body.user.username).toBe(user.username)
    expect(response.body.landing_page.title).toBe('Public links')
    expect(response.body.landing_page.items).toHaveLength(1)
    expect(response.headers['cache-control']).toContain('public')
  })

  it('returns a public landing page by slug', async () => {
    const request = createRequest()
    const response = await request
      .get(`/api/v1/users/${user.username}/landing-pages/public-links`)
      .expect(200)

    expect(response.body.user.username).toBe(user.username)
    expect(response.body.landing_page.title).toBe('Public links')
    expect(response.body.landing_page.items).toHaveLength(1)
    expect(response.headers['cache-control']).toContain('public')
    expect(response.headers['cache-control']).toContain('max-age')
  })

  it('returns 404 for unknown landing pages', async () => {
    const request = createRequest()
    await request.get(`/api/v1/users/${user.username}/landing-pages/not-real`).expect(404)
  })
})
