import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminAiCostsPage from './page'
import type { CommunityAiCostTotal } from '@/types/ai-costs'

const { getAiCostTotalsMock, getResolvedUiLocaleMock, requireAdminMock } = vi.hoisted(() => ({
  getAiCostTotalsMock: vi.fn<VitestLooseMock>(),
  getResolvedUiLocaleMock: vi.fn<VitestLooseMock>(),
  requireAdminMock: vi.fn<VitestLooseMock>(),
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
  AdminPagination: ({
    nextHref,
    previousHref,
  }: {
    nextHref?: string | null
    previousHref?: string | null
  }) => <nav data-testid='admin-pagination'>{`${previousHref ?? ''}|${nextHref ?? ''}`}</nav>,
}))

vi.mock(import('@/lib/auth/require-admin'), () => ({
  requireAdmin: requireAdminMock,
}))

vi.mock(import('@/lib/api/server/ai-costs'), () => ({
  getAiCostTotals: getAiCostTotalsMock,
}))

vi.mock(import('@/lib/i18n/get-resolved-ui-locale'), () => ({
  getResolvedUiLocale: getResolvedUiLocaleMock,
}))

vi.mock(
  import('@/lib/seo/metadata'),
  () =>
    ({
      createNoIndexMetadata: (title: string) => ({ title }),
    }) as unknown as typeof import('@/lib/seo/metadata'),
)

describe('AdminAiCostsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getResolvedUiLocaleMock.mockResolvedValue('en')
    requireAdminMock.mockResolvedValue(undefined)
  })

  it('formats counts and scaled costs with the resolved UI locale', async () => {
    getResolvedUiLocaleMock.mockResolvedValue('es')
    getAiCostTotalsMock.mockResolvedValue({
      results: [
        makeTotal({
          community_id: 'community-singular',
          community_slug: 'singular-community',
          unpriced_request_count: 1,
        }),
        makeTotal({
          community_id: 'community-plural',
          community_slug: 'plural-community',
          request_count: 10_000,
          total_input_tokens: 20_000,
          total_output_tokens: 30_000,
          unpriced_request_count: 40_000,
        }),
      ],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })

    render(await AdminAiCostsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('10.000')).toBeDefined()
    expect(screen.getByText('20.000')).toBeDefined()
    expect(screen.getByText('30.000')).toBeDefined()
    expect(screen.getByText(/0,005 US\$.*1 solicitud sin precio/)).toBeDefined()
    expect(screen.getByText(/0,005 US\$.*40.000 solicitudes sin precio/)).toBeDefined()
    expect(screen.queryByText(/unpriced/)).toBeNull()
    expect(screen.queryByText('10,000')).toBeNull()
  })

  it('requires admin access and renders cost totals', async () => {
    getAiCostTotalsMock.mockResolvedValue({
      results: [makeTotal()],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })

    const page = await AdminAiCostsPage({ searchParams: Promise.resolve({}) })
    render(page)

    expect(requireAdminMock).toHaveBeenCalled()
    expect(screen.getByTestId('breadcrumbs')).toBeDefined()
    expect(screen.getByText('AI Costs')).toBeDefined()
    expect(document.querySelector('[data-pw="admin-ai-costs-row"]')).not.toBeNull()
    expect(screen.getByText('test-community')).toBeDefined()
    expect(getAiCostTotalsMock).toHaveBeenCalledWith({ after: undefined, limit: 25 })
  })

  it('renders empty state when no usage recorded', async () => {
    getAiCostTotalsMock.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })

    const page = await AdminAiCostsPage({ searchParams: Promise.resolve({}) })
    render(page)

    expect(document.querySelector('[data-pw="admin-ai-costs-empty"]')).not.toBeNull()
    expect(screen.getByText('No AI usage recorded yet.')).toBeDefined()
  })

  it('forwards and renders an opaque continuation cursor', async () => {
    getAiCostTotalsMock.mockResolvedValue({
      results: [makeTotal()],
      page_info: {
        has_next_page: true,
        start_cursor: 'start',
        end_cursor: 'opaque/composite+cursor',
      },
    })

    render(
      await AdminAiCostsPage({
        searchParams: Promise.resolve({ after: 'previous/opaque+cursor' }),
      }),
    )

    expect(getAiCostTotalsMock).toHaveBeenCalledWith({
      after: 'previous/opaque+cursor',
      limit: 25,
    })
    expect(screen.getByTestId('admin-pagination')).toHaveTextContent(
      '/admin/ai-costs|/admin/ai-costs?after=opaque%2Fcomposite%2Bcursor',
    )
  })
})

function makeTotal(overrides: Partial<CommunityAiCostTotal> = {}): CommunityAiCostTotal {
  return {
    community_id: 'community-1',
    community_slug: 'test-community',
    request_count: 10,
    total_input_tokens: 1000,
    total_output_tokens: 500,
    unpriced_request_count: 0,
    total_cost: { amount: '5000', currency: 'usd', scale: 6 },
    ...overrides,
  }
}
