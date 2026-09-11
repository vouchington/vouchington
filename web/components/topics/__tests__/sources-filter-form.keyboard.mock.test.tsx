import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { SourcesFilterForm } from '../sources-filter-form'

vi.mock(import('@/components/ui/select'), () => {
  const Select = ({ value, onValueChange, children }: any) => (
    <select
      data-testid='mock-select'
      value={value}
      onChange={e => onValueChange(e.target.value)}
    >
      {children}
    </select>
  )
  const SelectTrigger = () => null
  const SelectValue = () => null
  const SelectContent = ({ children }: any) => children
  const SelectItem = ({ value, children }: any) => <option value={value}>{children}</option>
  return {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
  } as unknown as typeof import('@/components/ui/select')
})

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()

describe('SourcesFilterForm — keyboard submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('submits via Enter on the sources search input through the Next router', () => {
    render(<SourcesFilterForm />)

    const input = screen.getByLabelText('Search sources') as HTMLInputElement
    expect(input).toHaveAttribute('placeholder', 'Search by text or #topic')
    input.focus()
    fireEvent.change(input, { target: { value: 'fintech' } })

    void expectInputEnterSubmits({ input, onSubmit: mockNav.push })
    expect(mockNav.push).toHaveBeenCalledWith('?q=fintech', { scroll: false })
    expect(document.activeElement).toBe(input)
  })

  it('renders a visible search submit button', () => {
    render(<SourcesFilterForm />)

    const button = screen.getByRole('button', { name: 'Search' })
    expect(button).toBeVisible()
    expect(button).toHaveClass('h-11', 'w-11')
    expect(button).not.toHaveClass('sm:h-9', 'sm:w-9')
  })

  it('publisher type select pushes publisher_type param immediately', () => {
    render(<SourcesFilterForm defaultPublisherType='' />)

    const select = screen.getByTestId('mock-select')
    fireEvent.change(select, { target: { value: 'blog' } })

    expect(mockNav.push).toHaveBeenCalledWith('?publisher_type=blog', { scroll: false })
  })

  it('preserves input focus when q updates after submit', () => {
    const { rerender } = render(<SourcesFilterForm />)

    const input = screen.getByPlaceholderText('Search by text or #topic') as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'fintech' } })
    fireEvent.submit(input.closest('form')!)

    mockNav.setSearchParams('q=fintech')
    rerender(<SourcesFilterForm />)

    expect(screen.getByPlaceholderText('Search by text or #topic')).toBe(input)
    expect(document.activeElement).toBe(input)
  })
})
