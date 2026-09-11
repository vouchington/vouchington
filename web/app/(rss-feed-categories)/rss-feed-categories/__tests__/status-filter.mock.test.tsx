import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        onValueChange,
        value,
      }: {
        children: ReactNode
        onValueChange?: (value: string) => void
        value?: string
      }) => (
        <select
          aria-label='Category status filter'
          value={value}
          onChange={event => onValueChange?.(event.target.value)}
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

import { RssFeedCategoryStatusFilter } from '../status-filter'

describe('RssFeedCategoryStatusFilter', () => {
  beforeEach(() => {
    mockNav.reset()
  })

  it('renders the status select', () => {
    render(<RssFeedCategoryStatusFilter />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('renders with pending as default when no status param', () => {
    render(<RssFeedCategoryStatusFilter />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('pending')
  })

  it('renders all status options', () => {
    render(<RssFeedCategoryStatusFilter />)
    expect(screen.getByRole('option', { name: 'Pending' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Rejected' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'All' })).toBeInTheDocument()
  })

  it('pushes rejected status on change', () => {
    render(<RssFeedCategoryStatusFilter />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    select.value = 'rejected'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(mockNav.push).toHaveBeenCalledWith(expect.stringContaining('status=rejected'))
  })

  it('removes status param when selecting pending', () => {
    mockNav.setSearchParams('status=rejected')
    render(<RssFeedCategoryStatusFilter />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    select.value = 'pending'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(mockNav.push).toHaveBeenCalledWith(expect.not.stringContaining('status='))
  })
})
