import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetMyNotificationRedirectTarget, mockRedirect } = vi.hoisted(() => ({
  mockGetMyNotificationRedirectTarget: vi.fn<VitestLooseMock>(),
  mockRedirect: vi.fn<VitestLooseMock>((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
}))

vi.mock(
  import('next/navigation'),
  () => ({ redirect: mockRedirect }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/server/my'), () => ({
  getMyNotificationRedirectTarget: mockGetMyNotificationRedirectTarget,
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

import NotificationRedirectPage from './page'

const searchParams = Promise.resolve({ notification_id: 'notification-1' })

describe('NotificationRedirectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to a same-site target returned by the API', async () => {
    mockGetMyNotificationRedirectTarget.mockResolvedValue({ target_url: '/feed/news' })

    await expect(NotificationRedirectPage({ searchParams })).rejects.toThrow('redirect:/feed/news')
  })

  it('falls back home when the API fails', async () => {
    mockGetMyNotificationRedirectTarget.mockRejectedValue(new Error('api failed'))

    await expect(NotificationRedirectPage({ searchParams })).rejects.toThrow('redirect:/')
  })

  it('falls back home for an invalid absolute target URL', async () => {
    mockGetMyNotificationRedirectTarget.mockResolvedValue({
      target_url: 'mailto:tests+test@voucha.ai',
    })

    await expect(NotificationRedirectPage({ searchParams })).rejects.toThrow('redirect:/')
  })

  it('falls back home for an encoded protocol-relative path', async () => {
    mockGetMyNotificationRedirectTarget.mockResolvedValue({ target_url: '/%2Fexample.com' })

    await expect(NotificationRedirectPage({ searchParams })).rejects.toThrow('redirect:/')
  })
})
