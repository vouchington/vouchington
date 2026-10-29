import '@/test-helpers/i18n/mock-json-messages'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { navMockModule } from 'vouchington-tooling/next-navigation-mock'
import AdminModlogPage from './page'
const notFoundMock = vi.hoisted(() =>
  vi.fn<() => never>(() => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  }),
)
const permanentRedirectMock = vi.hoisted(() =>
  vi.fn<(path: string) => never>(path => {
    throw new Error(`permanentRedirect:${path}`)
  }),
)
vi.mock(
  import('next/navigation'),
  () =>
    ({
      ...navMockModule,
      notFound: notFoundMock,
      permanentRedirect: permanentRedirectMock,
    }) as unknown as typeof import('next/navigation'),
)

const requireAdminMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const serverApiGetMock = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/lib/auth/require-admin'), () => ({
  requireAdmin: requireAdminMock,
}))

vi.mock(
  import('@/lib/api/server'),
  () =>
    ({
      serverApi: { get: serverApiGetMock },
    }) as unknown as typeof import('@/lib/api/server'),
)

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>().mockReturnValue({}),
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav data-testid='breadcrumbs' />,
}))

vi.mock(import('@/components/admin/admin-page-header'), () => ({
  AdminPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock(import('@/components/admin/admin-table-shell'), () => ({
  AdminTableShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock(import('@/components/admin/admin-pagination'), () => ({
  AdminPagination: () => <nav data-testid='admin-pagination' />,
}))

const emptyData = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  moderator_actions: {},
  users: {},
}

const dataWithAction = {
  results: [{ __entity_type: 'moderator_action' as const, id: 'action-1' }],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  moderator_actions: {
    'action-1': {
      id: 'action-1',
      community_id: null,
      actor_user_id: 'user-1',
      action_type: 'ban',
      post_id: null,
      target_user_id: 'user-2',
      report_id: null,
      review_dispute_id: null,
      community_application_id: null,
      reason: 'Spam',
      metadata: {},
      created_at: '2026-06-01T10:00:00.000Z',
    },
  },
  users: {
    'user-1': { id: 'user-1', username: 'moderator' },
  },
}

describe('AdminModlogPage', () => {
  beforeEach(() => {
    notFoundMock.mockClear()
    permanentRedirectMock.mockClear()
    requireAdminMock.mockReset()
    requireAdminMock.mockResolvedValue(undefined)
    serverApiGetMock.mockReset()
    serverApiGetMock.mockResolvedValue(emptyData)
  })

  it('renders the heading', async () => {
    const page = await AdminModlogPage({ searchParams: Promise.resolve({}) })
    render(page)
    expect(screen.getByText('Mod Log')).toBeDefined()
  })

  it('renders empty state when no results', async () => {
    serverApiGetMock.mockResolvedValue(emptyData)
    const page = await AdminModlogPage({ searchParams: Promise.resolve({}) })
    render(page)
    expect(screen.getByText('No moderation actions found.')).toBeDefined()
  })

  it('renders action rows when results are present', async () => {
    serverApiGetMock.mockResolvedValue(dataWithAction)
    const page = await AdminModlogPage({ searchParams: Promise.resolve({}) })
    render(page)
    expect(screen.getByText('@moderator')).toBeDefined()
    expect(screen.getByText('ban')).toBeDefined()
    expect(screen.getByText('Spam')).toBeDefined()
  })

  it('renders System for actions with no actor', async () => {
    serverApiGetMock.mockResolvedValue({
      ...dataWithAction,
      moderator_actions: {
        'action-1': { ...dataWithAction.moderator_actions['action-1'], actor_user_id: null },
      },
    })
    const page = await AdminModlogPage({ searchParams: Promise.resolve({}) })
    render(page)
    expect(screen.getByText('System')).toBeDefined()
  })

  it('calls serverApi with after cursor when provided', async () => {
    await AdminModlogPage({ searchParams: Promise.resolve({ after: 'cursor-abc' }) })
    expect(serverApiGetMock).toHaveBeenCalledWith(
      '/api/v1/admin/modlog',
      expect.objectContaining({
        searchParams: expect.objectContaining({ after: 'cursor-abc' }),
      }),
    )
  })

  it('resolves a community slug before filtering the modlog', async () => {
    serverApiGetMock.mockImplementation((path: string) =>
      path.startsWith('/api/v1/communities/')
        ? Promise.resolve({ community: { id: 'community-uuid', slug: 'test-community' } })
        : Promise.resolve(emptyData),
    )
    await AdminModlogPage({
      searchParams: Promise.resolve({ community: 'test-community' }),
    })
    expect(serverApiGetMock).toHaveBeenCalledWith(
      '/api/v1/admin/modlog',
      expect.objectContaining({
        searchParams: expect.objectContaining({ community_id: 'community-uuid' }),
      }),
    )
  })

  it('redirects a community ID to its canonical slug', async () => {
    serverApiGetMock.mockResolvedValue({
      community: { id: 'community-uuid', slug: 'test-community' },
    })
    await expect(
      AdminModlogPage({ searchParams: Promise.resolve({ community: 'community-uuid' }) }),
    ).rejects.toThrow('permanentRedirect:/admin/modlog?community=test-community')
    expect(notFoundMock).not.toHaveBeenCalled()
  })

  it('redirects a user ID to its canonical username', async () => {
    serverApiGetMock.mockResolvedValue({ user: { id: 'user-uuid', username: 'moderator' } })
    await expect(
      AdminModlogPage({ searchParams: Promise.resolve({ actor: 'user-uuid' }) }),
    ).rejects.toThrow('permanentRedirect:/admin/modlog?actor=moderator')
    expect(notFoundMock).not.toHaveBeenCalled()
  })

  it('redirects legacy ID params to canonical filters and preserves the cursor', async () => {
    serverApiGetMock.mockImplementation((path: string) => {
      if (path === '/api/v1/communities/community-uuid')
        return Promise.resolve({ community: { id: 'community-uuid', slug: 'test-community' } })
      if (path === '/api/v1/users/user-uuid')
        return Promise.resolve({ user: { id: 'user-uuid', username: 'moderator' } })
      return Promise.resolve(emptyData)
    })
    await expect(
      AdminModlogPage({
        searchParams: Promise.resolve({
          community_id: 'community-uuid',
          actor_user_id: 'user-uuid',
          after: 'cursor-abc',
        }),
      }),
    ).rejects.toThrow(
      'permanentRedirect:/admin/modlog?community=test-community&actor=moderator&after=cursor-abc',
    )
    expect(serverApiGetMock).not.toHaveBeenCalledWith('/api/v1/admin/modlog', expect.anything())
  })

  it('uses canonical filters ahead of legacy ID aliases', async () => {
    serverApiGetMock.mockImplementation((path: string) =>
      path === '/api/v1/communities/test-community'
        ? Promise.resolve({ community: { id: 'community-uuid', slug: 'test-community' } })
        : Promise.resolve(emptyData),
    )
    await expect(
      AdminModlogPage({
        searchParams: Promise.resolve({ community: 'test-community', community_id: 'other-uuid' }),
      }),
    ).rejects.toThrow('permanentRedirect:/admin/modlog?community=test-community')
    expect(serverApiGetMock).not.toHaveBeenCalledWith('/api/v1/communities/other-uuid')
  })

  it('fails closed when an ID has no canonical username', async () => {
    serverApiGetMock.mockResolvedValue({ user: { id: 'user-uuid', username: null } })
    await expect(
      AdminModlogPage({ searchParams: Promise.resolve({ actor_user_id: 'user-uuid' }) }),
    ).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
    expect(permanentRedirectMock).not.toHaveBeenCalled()
  })

  it('checks admin authorization before resolving a legacy identifier', async () => {
    requireAdminMock.mockRejectedValue(new Error('Unauthorized'))
    await expect(
      AdminModlogPage({ searchParams: Promise.resolve({ community_id: 'community-uuid' }) }),
    ).rejects.toThrow('Unauthorized')
    expect(serverApiGetMock).not.toHaveBeenCalled()
  })

  it('renders pagination', async () => {
    const page = await AdminModlogPage({ searchParams: Promise.resolve({}) })
    render(page)
    expect(screen.getByTestId('admin-pagination')).toBeDefined()
  })
})
