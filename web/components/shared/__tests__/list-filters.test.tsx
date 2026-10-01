import {
  listFiltersNav,
  resetListFiltersNav,
  restoreListFiltersNav,
} from '@/test-helpers/components/shared/list-filters.mock-support'

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { ListFilters } from '../list-filters'

describe('ListFilters', () => {
  beforeEach(() => {
    resetListFiltersNav()
  })

  afterEach(() => {
    restoreListFiltersNav()
  })

  it('does not apply invalid searchDefaultSort to URL when submitting a search', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={[
          { label: 'New', value: 'new' },
          { label: 'Best', value: 'best' },
        ]}
        searchOnlySortOptions={[{ label: 'Relevance', value: 'relevance' }]}
        searchDefaultSort={'invalid-sort' as never}
      />,
    )

    const input = screen.getByPlaceholderText('Search topics...')
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.submit(input.closest('form')!)

    expect(consoleError).toHaveBeenCalledWith(
      'ListFilters: searchDefaultSort "invalid-sort" must be present in searchOnlySortOptions',
    )
    expect(listFiltersNav.push).toHaveBeenCalledWith('?q=hello', { scroll: false })
  })

  it('marks the search input as the primary route focus target', () => {
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

    expect(screen.getByPlaceholderText('Search topics...')).toHaveAttribute(
      'data-route-focus-target',
      'primary',
    )
  })

  it('logs a validation warning when searchDefaultSort is set but searchOnlySortOptions is absent', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={[
          { label: 'New', value: 'new' },
          { label: 'Best', value: 'best' },
        ]}
        searchDefaultSort={'relevance' as never}
      />,
    )

    expect(consoleError).toHaveBeenCalledWith(
      'ListFilters: searchDefaultSort "relevance" is set but searchOnlySortOptions is absent',
    )
  })

  it('auto-applies valid searchDefaultSort when starting a search on the default sort', () => {
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

    expect(listFiltersNav.push).toHaveBeenCalledWith('?q=hello&sort=relevance', { scroll: false })
  })

  it('auto-applies searchDefaultSort when submitting search via form submit', () => {
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

    expect(listFiltersNav.push).toHaveBeenCalledWith('?q=hello&sort=relevance', { scroll: false })
  })

  it('submits the list search via Enter on the input through the Next router', () => {
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

    const input = screen.getByPlaceholderText('Search topics...') as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'keyboard' } })

    void expectInputEnterSubmits({ input, onSubmit: listFiltersNav.push })
    expect(listFiltersNav.push).toHaveBeenCalledWith('?q=keyboard', { scroll: false })
    expect(document.activeElement).toBe(input)
  })

  it('renders a visible search submit button', () => {
    render(
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={[{ label: 'New', value: 'new' }]}
      />,
    )

    const button = screen.getByRole('button', { name: 'Search' })
    expect(button).toBeVisible()
    expect(button).toHaveClass('h-11', 'w-11')
    expect(button).not.toHaveClass('sm:h-9', 'sm:w-9')
  })

  it('uses a custom accessible label for page-specific search inputs', () => {
    render(
      <ListFilters
        placeholder='Search news...'
        searchLabel='Search news'
        defaultSort='new'
        sortOptions={[{ label: 'New', value: 'new' }]}
      />,
    )

    expect(screen.getByLabelText('Search news')).toHaveAttribute('placeholder', 'Search news...')
  })

  it('preserves input focus when URL search params update after submit', () => {
    const { rerender } = render(
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={[{ label: 'New', value: 'new' }]}
      />,
    )

    const input = screen.getByPlaceholderText('Search topics...') as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'keyboard' } })
    fireEvent.submit(input.closest('form')!)

    listFiltersNav.setSearchParams('q=keyboard')
    rerender(
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={[{ label: 'New', value: 'new' }]}
      />,
    )

    expect(screen.getByPlaceholderText('Search topics...')).toBe(input)
    expect(document.activeElement).toBe(input)
  })
})
