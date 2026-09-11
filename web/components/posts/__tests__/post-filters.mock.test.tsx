import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { PostFilters } from '../post-filters'

function renderWithProviders(ui: ReactNode) {
  return render(<TooltipProvider>{ui}</TooltipProvider>)
}

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        value,
        onValueChange,
      }: {
        children: ReactNode
        value: string
        onValueChange: (value: string) => void
      }) => (
        <select
          aria-label='Sort list'
          value={value}
          onChange={event => onValueChange(event.target.value)}
        >
          {children}
        </select>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
        <option value={value}>{children}</option>
      ),
      SelectTrigger: ({ children }: { children: ReactNode }) => children,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()

describe('PostFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('renders search input', () => {
    renderWithProviders(<PostFilters />)
    expect(screen.getByPlaceholderText('Search by text or #topic')).toBeDefined()
  })

  it('renders sort dropdown without relevance when no search', () => {
    renderWithProviders(<PostFilters />)
    const sortSelect = screen.getByLabelText('Sort list') as HTMLSelectElement
    expect(sortSelect).toBeDefined()
    expect(screen.getByRole('option', { name: 'Hot' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'New' })).toBeDefined()
    expect(screen.queryByRole('option', { name: 'Relevance' })).toBeNull()
  })

  it('renders relevance sort option when search query is active', () => {
    mockNav.setSearchParams('q=test+query')
    renderWithProviders(<PostFilters />)
    expect(screen.getByRole('option', { name: 'Hot' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'New' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'Relevance' })).toBeDefined()
  })

  it('can disable relevance sort for feed-backed lists', () => {
    mockNav.setSearchParams('q=test+query')
    renderWithProviders(<PostFilters enableRelevanceSort={false} />)

    expect(screen.getByRole('option', { name: 'Hot' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'New' })).toBeDefined()
    expect(screen.queryByRole('option', { name: 'Relevance' })).toBeNull()
  })

  it('updates URL when sort dropdown changes', () => {
    renderWithProviders(<PostFilters />)
    fireEvent.change(screen.getByLabelText('Sort list'), { target: { value: 'new' } })

    expect(mockNav.push).toHaveBeenCalledWith(
      expect.stringContaining('sort=new'),
      expect.any(Object),
    )
  })

  it('selects active sort filter', () => {
    mockNav.setSearchParams('sort=hot')
    renderWithProviders(<PostFilters />)

    expect(screen.getByLabelText('Sort list')).toHaveProperty('value', 'hot')
  })

  it('shows current search query in input', () => {
    mockNav.setSearchParams('q=test+query')
    renderWithProviders(<PostFilters />)

    const input = screen.getByPlaceholderText('Search by text or #topic') as HTMLInputElement
    expect(input.value).toBe('test query')
  })

  it('can hide search input', () => {
    renderWithProviders(<PostFilters showSearch={false} />)
    expect(screen.queryByPlaceholderText('Search by text or #topic')).toBeNull()
  })

  it('does not show a separate Post Type filter', () => {
    renderWithProviders(<PostFilters />)
    expect(screen.queryByText('Post Type')).toBeNull()
  })
})
