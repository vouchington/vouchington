import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const {
  mockGetMyMessageThread,
  mockGetConversationParticipants,
  mockGetConversation,
  mockNotFound,
  mockGetCurrentUser,
} = vi.hoisted(() => ({
  mockGetMyMessageThread: vi.fn<VitestLooseMock>(),
  mockGetConversationParticipants: vi.fn<VitestLooseMock>(),
  mockGetConversation: vi.fn<VitestLooseMock>(),
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('NOT_FOUND')
  }),
}))

vi.mock(import('@/lib/api/server/messages'), () => ({
  getMyMessageThread: mockGetMyMessageThread,
  getConversationParticipants: mockGetConversationParticipants,
  getConversation: mockGetConversation,
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: mockNotFound,
      redirect: vi.fn<VitestLooseMock>(),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('@/lib/seo/metadata'),
  () =>
    ({
      createNoIndexMetadata: (t: string) => ({ title: t }),
    }) as unknown as typeof import('@/lib/seo/metadata'),
)

vi.mock(import('react'), async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    Suspense: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  } as unknown as typeof import('react')
})

vi.mock(import('../conversation-page-client'), () => ({
  DirectMessagePageClient: () => <div data-pw='dm-page-client'>client</div>,
}))

import DirectMessagePage from '../page'

describe('DirectMessagePage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockNotFound.mockImplementation(() => {
      throw new Error('NOT_FOUND')
    })
  })

  it('renders DirectMessagePageClient when thread exists', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({ id: 'user-1' })
    mockGetMyMessageThread.mockResolvedValueOnce({
      results: [],
      page_info: { has_next_page: false, end_cursor: null },
    })
    mockGetConversationParticipants.mockResolvedValueOnce({ results: [] })
    mockGetConversation.mockResolvedValueOnce(null)
    const jsx = await DirectMessagePage({ params: Promise.resolve({ conversationId: 'conv-1' }) })
    render(jsx)
    expect(screen.getByText('client')).toBeDefined()
  })

  it('calls notFound when thread is missing', async () => {
    mockGetMyMessageThread.mockResolvedValueOnce(null)
    await expect(
      DirectMessagePage({ params: Promise.resolve({ conversationId: 'conv-1' }) }),
    ).rejects.toThrow('NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })
})
