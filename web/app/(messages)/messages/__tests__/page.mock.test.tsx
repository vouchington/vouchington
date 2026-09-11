import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockGetMyMessages } = vi.hoisted(() => ({
  mockGetMyMessages: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server/messages'), () => ({
  getMyMessages: mockGetMyMessages,
}))

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav />,
}))

vi.mock(import('@/components/shared/page-header'), () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock(
  import('@/lib/seo/metadata'),
  () =>
    ({
      createNoIndexMetadata: (t: string) => ({ title: t }),
    }) as unknown as typeof import('@/lib/seo/metadata'),
)

vi.mock(import('../messages-inbox-client'), () => ({
  MessagesInboxClient: () => <div data-pw='messages-inbox-client'>inbox</div>,
}))

import MessagesPage from '../page'

describe('MessagesPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders MessagesInboxClient with conversations from API', async () => {
    mockGetMyMessages.mockResolvedValueOnce({
      results: [],
      page_info: { has_next_page: false, end_cursor: null },
    })
    const jsx = await MessagesPage()
    render(jsx)
    expect(screen.getByText('inbox')).toBeDefined()
  })

  it('renders MessagesInboxClient even when API fails', async () => {
    mockGetMyMessages.mockRejectedValueOnce(new Error('network error'))
    const jsx = await MessagesPage()
    render(jsx)
    expect(screen.getByText('inbox')).toBeDefined()
  })

  it('renders the Messages heading', async () => {
    mockGetMyMessages.mockResolvedValueOnce({
      results: [],
      page_info: { has_next_page: false, end_cursor: null },
    })
    const jsx = await MessagesPage()
    render(jsx)
    expect(screen.getByText('Messages')).toBeDefined()
  })
})
