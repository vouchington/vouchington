import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SearchInput, SearchInputShell } from '../search-input'

describe('SearchInput', () => {
  it('renders a search icon', () => {
    render(
      <SearchInput
        name='q'
        placeholder='Search...'
      />,
    )
    // lucide Search icon renders an SVG; assert it is present inside the container
    const wrapper = screen.getByPlaceholderText('Search...').closest('div')
    const svg = wrapper?.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('renders the placeholder on the input', () => {
    render(<SearchInput placeholder='Search posts...' />)
    expect(screen.getByPlaceholderText('Search posts...')).toBeDefined()
  })

  it('uses type=search with CSS to suppress the native WebKit clear button', () => {
    render(<SearchInput />)
    const inputs = document.querySelectorAll('input[type="search"]')
    expect(inputs.length).toBeGreaterThan(0)
    const input = inputs[0] as HTMLInputElement
    expect(input.className).toContain('[&::-webkit-search-cancel-button]:hidden')
  })

  it('forwards name and defaultValue', () => {
    render(
      <SearchInput
        name='q'
        defaultValue='hello'
        placeholder='Search...'
      />,
    )
    const input = screen.getByPlaceholderText('Search...') as HTMLInputElement
    expect(input.name).toBe('q')
    expect(input.defaultValue).toBe('hello')
  })

  it('applies inputClassName to the inner input', () => {
    render(
      <SearchInput
        placeholder='Search...'
        inputClassName='my-custom-class'
      />,
    )
    const input = screen.getByPlaceholderText('Search...')
    expect(input.className).toContain('my-custom-class')
  })

  it('applies className to the outer shell', () => {
    render(
      <SearchInput
        placeholder='Search...'
        className='shell-class'
      />,
    )
    const input = screen.getByPlaceholderText('Search...')
    const shell = input.closest('[class*="shell-class"]')
    expect(shell).toBeTruthy()
  })

  it('renders the default shell data-pw hook', () => {
    const { container } = render(<SearchInput placeholder='Search...' />)
    expect(container.querySelector('[data-pw="search-input-shell"]')).not.toBeNull()
  })

  it('renders clear button when value is provided and onClearValue is set', () => {
    const mockClear = vi.fn<() => void>()
    render(
      <SearchInput
        placeholder='Search...'
        value='hello'
        onChange={() => {}}
        onClearValue={mockClear}
      />,
    )
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeVisible()
  })

  it('does not render clear button when value is empty', () => {
    const mockClear = vi.fn<() => void>()
    render(
      <SearchInput
        placeholder='Search...'
        value=''
        onChange={() => {}}
        onClearValue={mockClear}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
  })

  it('does not render clear button when onClearValue is not provided', () => {
    render(
      <SearchInput
        placeholder='Search...'
        value='hello'
        onChange={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
  })

  it('calls onClearValue when clear button is clicked', () => {
    const mockClear = vi.fn<() => void>()
    render(
      <SearchInput
        placeholder='Search...'
        value='hello'
        onChange={() => {}}
        onClearValue={mockClear}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(mockClear).toHaveBeenCalledTimes(1)
  })
})

describe('SearchInputShell', () => {
  it('renders children', () => {
    render(
      <SearchInputShell>
        <input
          aria-label='Inner search'
          placeholder='inner'
        />
      </SearchInputShell>,
    )
    expect(screen.getByPlaceholderText('inner')).toBeDefined()
  })

  it('renders a Search icon', () => {
    const { container } = render(
      <SearchInputShell>
        <span>content</span>
      </SearchInputShell>,
    )
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('allows a custom data-pw hook', () => {
    const { container } = render(
      <SearchInputShell data-pw='topic-chip-search-shell'>
        <span>content</span>
      </SearchInputShell>,
    )
    expect(container.querySelector('[data-pw="topic-chip-search-shell"]')).not.toBeNull()
  })
})
