import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { NewsFilters } from '../news-filters'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()

describe('NewsFilters — keyboard submit', () => {
  beforeEach(() => {
    mockNav.reset()
    mockNav.setPathname('/news')
  })

  it('submits via Enter on the news search input through the Next router', () => {
    render(<NewsFilters />)

    const input = screen.getByLabelText('Search news') as HTMLInputElement
    expect(input).toHaveAttribute('placeholder', 'Search by text or #topic')
    input.focus()
    fireEvent.change(input, { target: { value: 'inflation' } })

    void expectInputEnterSubmits({ input, onSubmit: mockNav.push })
    expect(mockNav.push).toHaveBeenCalledWith('?q=inflation', { scroll: false })
    expect(document.activeElement).toBe(input)
  })

  it('renders a visible search submit button', () => {
    render(<NewsFilters />)

    const button = screen.getByRole('button', { name: 'Search' })
    expect(button).toBeVisible()
    expect(button).toHaveClass('h-11', 'w-11')
    expect(button).not.toHaveClass('sm:h-9', 'sm:w-9')
  })

  it('preserves input focus when initialQ updates after submit', () => {
    const { rerender } = render(<NewsFilters />)

    const input = screen.getByPlaceholderText('Search by text or #topic') as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'inflation' } })
    fireEvent.submit(input.closest('form')!)

    mockNav.setSearchParams('q=inflation')
    rerender(<NewsFilters />)

    expect(screen.getByPlaceholderText('Search by text or #topic')).toBe(input)
    expect(document.activeElement).toBe(input)
  })
})
