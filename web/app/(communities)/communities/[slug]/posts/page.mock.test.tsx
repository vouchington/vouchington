import { beforeEach, describe, expect, it, vi } from 'vitest'
import CommunityPostsRedirectPage from './page'

const { mockPermanentRedirect } = vi.hoisted(() => ({
  mockPermanentRedirect: vi.fn<VitestLooseMock>((path: string) => {
    throw new Error(`permanentRedirect:${path}`)
  }),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      permanentRedirect: mockPermanentRedirect,
    }) as unknown as typeof import('next/navigation'),
)

describe('CommunityPostsRedirectPage', () => {
  beforeEach(() => {
    mockPermanentRedirect.mockClear()
  })

  it('redirects to community index', async () => {
    await expect(
      CommunityPostsRedirectPage({ params: Promise.resolve({ slug: 'rewards' }) }),
    ).rejects.toThrow('permanentRedirect:/communities/rewards')
  })

  it('preserves sort and q query params', async () => {
    await expect(
      CommunityPostsRedirectPage({
        params: Promise.resolve({ slug: 'rewards' }),
        searchParams: Promise.resolve({ sort: 'hot', q: 'test' }),
      }),
    ).rejects.toThrow('permanentRedirect:/communities/rewards?sort=hot&q=test')
  })
})
