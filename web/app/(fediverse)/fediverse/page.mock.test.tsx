import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetCurrentUser, mockGetFediverseSearch, mockGetFlag, mockNotFound, mockPageWithAside } =
  vi.hoisted(() => ({
    mockGetCurrentUser: vi.fn<VitestLooseMock>(),
    mockGetFediverseSearch: vi.fn<VitestLooseMock>(),
    mockGetFlag: vi.fn<VitestLooseMock>(),
    mockNotFound: vi.fn<VitestLooseMock>(),
    mockPageWithAside: vi.fn<typeof import('@/components/page-with-aside').PageWithAside>(),
  }))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: mockNotFound,
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('@/lib/feature-flags/server'), () => ({
  getEffectiveServerFeatureFlag: mockGetFlag,
}))

vi.mock(import('@/lib/api/server/fediverse'), () => ({
  getFediverseSearch: mockGetFediverseSearch,
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav>breadcrumbs</nav>,
}))

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: mockPageWithAside,
}))

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({ children }: { children: ReactNode }) => children,
    }) as unknown as typeof import('@/components/ui/button'),
)

vi.mock(
  import('@/components/ui/input'),
  () =>
    ({
      Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    }) as unknown as typeof import('@/components/ui/input'),
)

vi.mock(import('@/lib/seo/metadata'), () => ({
  createPageMetadata: vi.fn<VitestLooseMock>().mockReturnValue({}),
}))

import FediversePage from './page'

describe('FediversePage', () => {
  beforeEach(() => {
    mockGetCurrentUser.mockReset()
    mockGetFediverseSearch.mockReset()
    mockGetFlag.mockReset()
    mockNotFound.mockReset()
    mockGetCurrentUser.mockResolvedValue(null)
    mockGetFlag.mockResolvedValue(true)
    mockNotFound.mockImplementation(() => {
      throw new Error('not-found')
    })
    mockPageWithAside.mockReset()
    mockPageWithAside.mockImplementation(({ children }) => <div>{children}</div>)
  })

  it('returns notFound when the fediverse flag is disabled', async () => {
    mockGetFlag.mockResolvedValue(false)

    await expect(FediversePage({ searchParams: Promise.resolve({}) })).rejects.toThrow('not-found')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('renders the empty search prompt without calling the search API', async () => {
    const ui = await FediversePage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('heading', { name: 'Fediverse' })).toBeInTheDocument()
    expect(screen.getByText('Enter a search term to start.')).toBeInTheDocument()
    expect(mockGetFediverseSearch).not.toHaveBeenCalled()
  })

  it('composes the non-infinite search page in the shared no-aside shell', async () => {
    const ui = await FediversePage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(mockPageWithAside).toHaveBeenCalled()
    const pageWithAsideProps = mockPageWithAside.mock.calls[0]?.[0]
    expect(pageWithAsideProps).toMatchObject({ showFooter: false })
    expect(pageWithAsideProps).not.toHaveProperty('aside')
  })

  it('searches the selected provider and renders bucket results', async () => {
    mockGetFediverseSearch.mockResolvedValue({
      buckets: [
        {
          provider: 'peertube',
          status: 'ok',
          items: [
            {
              id: 'fediverse-1',
              provider: 'peertube',
              result_type: 'video',
              external_url: 'https://videos.example/watch/1',
              title: 'Test Video',
              source_hostname: 'videos.example',
              summary: 'A useful video.',
            },
          ],
        },
        { provider: 'mastodon', status: 'error', items: [] },
      ],
    })

    const ui = await FediversePage({
      searchParams: Promise.resolve({ q: '  test  ', provider: 'peertube' }),
    })
    render(ui)

    expect(mockGetFediverseSearch).toHaveBeenCalledWith({
      q: 'test',
      providers: ['peertube'],
      limit: 10,
    })
    expect(screen.getByRole('link', { name: /test video/i })).toHaveAttribute(
      'href',
      expect.stringContaining('https://videos.example/watch/1?utm_source=voucha'),
    )
    expect(screen.getByText('A useful video.')).toBeInTheDocument()
    expect(screen.getByText('error')).toBeInTheDocument()
    expect(screen.getByText('No results from this provider.')).toBeInTheDocument()
  })

  it('renders the Lemmy provider filter and searches it end-to-end', async () => {
    mockGetFediverseSearch.mockResolvedValue({
      buckets: [{ provider: 'lemmy', status: 'ok', items: [] }],
    })

    const ui = await FediversePage({
      searchParams: Promise.resolve({ q: 'test', provider: 'lemmy' }),
    })
    render(ui)

    expect(screen.getByRole('link', { name: 'Lemmy' })).toBeInTheDocument()
    expect(mockGetFediverseSearch).toHaveBeenCalledWith({
      q: 'test',
      providers: ['lemmy'],
      limit: 10,
    })
  })

  it('renders unsafe provider result URLs without clickable hrefs', async () => {
    mockGetFediverseSearch.mockResolvedValue({
      buckets: [
        {
          provider: 'mastodon',
          status: 'ok',
          items: [
            {
              id: 'fediverse-unsafe',
              provider: 'mastodon',
              result_type: 'post',
              external_url: 'javascript:alert(1)',
              title: 'Unsafe Post',
              source_hostname: 'social.example',
              summary: null,
            },
          ],
        },
      ],
    })

    const ui = await FediversePage({ searchParams: Promise.resolve({ q: 'test' }) })
    render(ui)

    expect(screen.getByText('Unsafe Post')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /unsafe post/i })).not.toBeInTheDocument()
  })

  it('renders the no-results state for unsupported provider params and failed searches', async () => {
    mockGetFediverseSearch.mockRejectedValue(new Error('offline'))

    const ui = await FediversePage({
      searchParams: Promise.resolve({ q: 'test', provider: 'unknown' }),
    })
    render(ui)

    expect(mockGetFediverseSearch).toHaveBeenCalledWith({
      q: 'test',
      providers: undefined,
      limit: 10,
    })
    expect(screen.getByText('No Fediverse results found.')).toBeInTheDocument()
  })
})
