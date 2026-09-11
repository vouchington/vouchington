import { describe, expect, it, vi } from 'vitest'

const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn<VitestLooseMock>(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

vi.mock(
  import('next/navigation'),
  () => ({ redirect: mockRedirect }) as unknown as typeof import('next/navigation'),
)

import MyUsersDismissedRecommendationsPage from './page'

describe('MyUsersDismissedRecommendationsPage', () => {
  it('redirects to /my/friend-recommendations/dismissed', () => {
    expect(() => MyUsersDismissedRecommendationsPage()).toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/my/friend-recommendations/dismissed')
  })
})
