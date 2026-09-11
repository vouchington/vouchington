import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen } from '@testing-library/react'

import type { ReactNode } from 'react'

import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'

import { ListFilters } from '../list-filters'

import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'

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
      SelectItem: ({
        children,
        title,
        value,
      }: {
        children: ReactNode
        title?: string
        value: string
      }) => (
        <option
          title={title}
          value={value}
        >
          {children}
        </option>
      ),
      SelectTrigger: ({ children }: { children: ReactNode }) => children,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

describe('ListFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('updates URL when sort dropdown changes', () => {
    render(
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={[
          { label: 'New', value: 'new' },
          { label: 'Best', value: 'best' },
        ]}
      />,
    )

    fireEvent.change(screen.getByLabelText('Sort list'), { target: { value: 'best' } })

    expect(mockNav.push).toHaveBeenCalledWith('?sort=best', { scroll: false })
    // Guard against duplicate-call regressions (note: mock uses native <select>, not Radix BubbleInput)
    expect(mockNav.push).toHaveBeenCalledTimes(1)
  })

  it('falls back to default sort when the URL sort is unsupported', () => {
    mockNav.setSearchParams('sort=unsupported')

    render(
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={[
          { label: 'New', value: 'new' },
          { label: 'Best', value: 'best' },
        ]}
      />,
    )

    expect(screen.getByLabelText('Sort list')).toHaveValue('new')
  })

  it('keeps sort option descriptions available on dropdown items', () => {
    render(
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={[
          { label: 'New', value: 'new', description: 'Latest topics first' },
          { label: 'Best', value: 'best', description: 'Highest scoring topics first' },
        ]}
      />,
    )

    expect(screen.getByRole('option', { name: 'New' })).toHaveAttribute(
      'title',
      'Latest topics first',
    )
    expect(screen.getByRole('option', { name: 'Best' })).toHaveAttribute(
      'title',
      'Highest scoring topics first',
    )
  })

  it('clears searchDefaultSort when clearing search while it is active', () => {
    mockNav.setSearchParams('q=hello&sort=relevance')

    render(
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={[
          { label: 'New', value: 'new' },
          { label: 'Best', value: 'best' },
        ]}
        searchOnlySortOptions={[{ label: 'Relevance', value: 'relevance' }]}
        searchDefaultSort='relevance'
      />,
    )

    const input = screen.getByPlaceholderText('Search topics...')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.submit(input.closest('form')!)

    expect(mockNav.push).toHaveBeenCalledWith('?', { scroll: false })
  })

  it('trims whitespace before submit and clears on X click', () => {
    mockNav.setSearchParams('q=hello')
    render(
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={[{ label: 'New', value: 'new' }]}
      />,
    )
    const input = screen.getByPlaceholderText('Search topics...')
    fireEvent.change(input, { target: { value: 'world  ' } })
    fireEvent.submit(input.closest('form')!)
    expect(mockNav.push).toHaveBeenCalledWith('?q=world', { scroll: false })
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(mockNav.push).toHaveBeenLastCalledWith('?', { scroll: false })
  })

  it('does not override user-selected non-default sort with searchDefaultSort when starting a search', () => {
    mockNav.setSearchParams('sort=best')

    render(
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={[
          { label: 'New', value: 'new' },
          { label: 'Best', value: 'best' },
        ]}
        searchOnlySortOptions={[{ label: 'Relevance', value: 'relevance' }]}
        searchDefaultSort='relevance'
      />,
    )

    const input = screen.getByPlaceholderText('Search topics...')
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.submit(input.closest('form')!)

    expect(mockNav.push).toHaveBeenCalledWith('?sort=best&q=hello', { scroll: false })
  })

  it('renders the search submit button as the last interactive control in the row', () => {
    render(
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={[{ label: 'New', value: 'new' }]}
      />,
    )
    const sortTrigger = screen.getByLabelText('Sort list')
    const submitButton = screen.getByRole('button', { name: 'Search' })
    // Submit button must come after the sort trigger in DOM order
    expect(
      sortTrigger.compareDocumentPosition(submitButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('renders the row container with full width', () => {
    const { container } = render(
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={[{ label: 'New', value: 'new' }]}
      />,
    )
    // The root element (form or div) should stretch to fill its flex parent
    expect(container.firstChild).toHaveClass('flex-1')
  })

  it('renders children before the sort dropdown and submit button', () => {
    render(
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={[{ label: 'New', value: 'new' }]}
      >
        <button type='button'>Custom child</button>
      </ListFilters>,
    )
    const child = screen.getByRole('button', { name: 'Custom child' })
    const sortTrigger = screen.getByLabelText('Sort list')
    const submitButton = screen.getByRole('button', { name: 'Search' })
    // Child before sort
    expect(
      child.compareDocumentPosition(sortTrigger) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // Child before submit
    expect(
      child.compareDocumentPosition(submitButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
