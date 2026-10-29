import '@/test-helpers/i18n/mock-json-messages'
import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'
import { makeTopicRecommendationMutationResponse } from '@/test-helpers/api-responses'

const {
  getCurrentUserMock,
  getTopicRecommendationMock,
  redirectMock,
  permanentRedirectMock,
  notFoundMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<VitestLooseMock>(),
  getTopicRecommendationMock: vi.fn<VitestLooseMock>(),
  redirectMock: vi.fn<VitestLooseMock>(() => {
    throw new Error('NEXT_REDIRECT')
  }),
  permanentRedirectMock: vi.fn<VitestLooseMock>(() => {
    throw new Error('NEXT_PERMANENT_REDIRECT')
  }),
  notFoundMock: vi.fn<VitestLooseMock>(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      ...navMockModule,
      redirect: redirectMock,
      permanentRedirect: permanentRedirectMock,
      notFound: notFoundMock,
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: getCurrentUserMock }))
vi.mock(import('@/lib/api/server/topic-recommendations'), () => ({
  getTopicRecommendation: getTopicRecommendationMock,
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))
vi.mock(import('@/components/topic-recommendations/topic-recommendation-form'), () => ({
  TopicRecommendationForm: ({
    recommendation,
  }: ComponentProps<
    typeof import('@/components/topic-recommendations/topic-recommendation-form').TopicRecommendationForm
  >) => <div data-testid='recommendation-edit-form'>{recommendation?.slug}</div>,
}))

import EditTopicRecommendationPage from './page'

const slug = 'readable-topic-recommendation'
const params = Promise.resolve({ slug })
const post = {
  ...makeTopicRecommendationMutationResponse().post,
  slug,
  created_by_id: 'author-1',
}
const nav = createNavMock()

describe('EditTopicRecommendationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nav.reset()
    getCurrentUserMock.mockResolvedValue({ id: 'author-1', roles: [] })
    getTopicRecommendationMock.mockResolvedValue({ post })
  })

  it('looks up a pending recommendation by slug and renders its edit form for its author', async () => {
    render(await EditTopicRecommendationPage({ params }))

    expect(getTopicRecommendationMock).toHaveBeenCalledWith(slug)
    expect(screen.getByTestId('recommendation-edit-form')).toHaveTextContent(slug)
  })

  it('allows an administrator to edit another author’s pending recommendation', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'admin-1', roles: ['administrator'] })

    render(await EditTopicRecommendationPage({ params }))
    expect(screen.getByTestId('recommendation-edit-form')).toHaveTextContent(slug)
  })

  it('redirects a different author and an approved recommendation to the listing', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'other-user', roles: [] })
    await expect(EditTopicRecommendationPage({ params })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirectMock).toHaveBeenCalledWith('/topic-recommendations')

    getCurrentUserMock.mockResolvedValue({ id: 'author-1', roles: [] })
    getTopicRecommendationMock.mockResolvedValue({
      post: { ...post, topic_recommendation: { status: 'approved' } },
    })
    await expect(EditTopicRecommendationPage({ params })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirectMock).toHaveBeenCalledWith('/topic-recommendations')
  })

  it('returns not found when the slug has no recommendation', async () => {
    getTopicRecommendationMock.mockResolvedValue(null)

    await expect(EditTopicRecommendationPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('redirects signed-out visitors before looking up a recommendation', async () => {
    getCurrentUserMock.mockResolvedValue(null)

    await expect(EditTopicRecommendationPage({ params })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirectMock).toHaveBeenCalledWith('/login')
    expect(getTopicRecommendationMock).not.toHaveBeenCalled()
  })

  it('redirects an owned pending UUID lookup to the recommendation slug', async () => {
    const postId = '019e0000-0000-7000-8000-000000000002'
    getTopicRecommendationMock.mockResolvedValue({ post: { ...post, id: postId } })

    await expect(
      EditTopicRecommendationPage({ params: Promise.resolve({ slug: postId }) }),
    ).rejects.toThrow('NEXT_PERMANENT_REDIRECT')
    expect(permanentRedirectMock).toHaveBeenCalledWith(`/topic-recommendations/${slug}/edit`)
  })

  it('does not disclose a foreign UUID recommendation through its canonical slug', async () => {
    const postId = '019e0000-0000-7000-8000-000000000002'
    getCurrentUserMock.mockResolvedValue({ id: 'other-user', roles: [] })
    getTopicRecommendationMock.mockResolvedValue({ post: { ...post, id: postId } })

    await expect(
      EditTopicRecommendationPage({ params: Promise.resolve({ slug: postId }) }),
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(permanentRedirectMock).not.toHaveBeenCalled()
  })
})
