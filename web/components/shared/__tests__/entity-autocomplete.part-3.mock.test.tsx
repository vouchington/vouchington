import { act, fireEvent, render, screen } from '@testing-library/react'

import { createContext, use } from 'react'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { EntityAutocomplete } from '../entity-autocomplete'

vi.mock(import('@/components/ui/popover'), () => {
  const PopoverContext = createContext(false)
  return {
    Popover: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
      <PopoverContext.Provider value={!!open}>{children}</PopoverContext.Provider>
    ),
    PopoverAnchor: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    PopoverContent: ({ children }: { children: React.ReactNode }) => {
      const open = use(PopoverContext)
      return open ? <div>{children}</div> : null
    },
  } as unknown as typeof import('@/components/ui/popover')
})

vi.mock(
  import('@/components/ui/command'),
  () =>
    ({
      Command: ({
        children,
        shouldFilter: _shouldFilter,
        ...props
      }: {
        children: React.ReactNode
        shouldFilter?: boolean
        [key: string]: unknown
      }) => <div {...props}>{children}</div>,
      CommandInput: ({
        placeholder,
        value,
        onValueChange,
        onFocus,
        onKeyDown,
        disabled,
        id,
        'aria-label': ariaLabel,
        'data-pw': dataPw,
      }: {
        placeholder?: string
        value?: string
        onValueChange?: (v: string) => void
        onFocus?: () => void
        onKeyDown?: (e: React.KeyboardEvent) => void
        disabled?: boolean
        id?: string
        'aria-label'?: string
        'data-pw'?: string
      }) => (
        <input
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          id={id}
          aria-label={ariaLabel}
          data-pw={dataPw}
          onChange={e => onValueChange?.(e.target.value)}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
        />
      ),
      CommandList: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
      CommandEmpty: ({ children }: { children: React.ReactNode }) => (
        <li data-testid='command-empty'>{children}</li>
      ),
      CommandItem: ({
        children,
        onSelect,
        value,
      }: {
        children: React.ReactNode
        onSelect?: () => void
        value?: string
      }) => (
        <li data-value={value}>
          <button
            type='button'
            onClick={onSelect}
          >
            {children}
          </button>
        </li>
      ),
    }) as unknown as typeof import('@/components/ui/command'),
)

interface Item {
  id: string
  label: string
}

function renderEntityAutocomplete(
  overrides: Partial<React.ComponentProps<typeof EntityAutocomplete<Item>>> = {},
) {
  const search = vi.fn<VitestLooseMock>(async (query: string): Promise<Item[]> => [
    { id: query, label: query },
  ])
  const onSelect = vi.fn<VitestLooseMock>(
    (item: Item, { setQuery }: { setQuery: (query: string) => void }) => {
      setQuery(item.label)
    },
  )

  const result = render(
    <EntityAutocomplete
      search={search}
      getKey={(item: Item) => item.id}
      renderItem={(item: Item) => item.label}
      onSelect={onSelect}
      placeholder='Search things...'
      ariaLabel='Search things'
      emptyText='No things found.'
      {...overrides}
    />,
  )

  return { ...result, search, onSelect }
}

describe('EntityAutocomplete', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('renders caller-provided data-pw hooks', () => {
    const { container } = renderEntityAutocomplete({
      dataPw: {
        input: 'entity-autocomplete-input',
        item: 'entity-autocomplete-item',
      },
    })

    expect(container.querySelector('[data-pw="entity-autocomplete-input"]')).not.toBeNull()
  })

  it('ignores abort errors', async () => {
    vi.useFakeTimers()
    const onSearchError = vi.fn<VitestLooseMock>()
    const search = vi.fn<VitestLooseMock>(async () => {
      throw new DOMException('Aborted', 'AbortError')
    })

    renderEntityAutocomplete({ search, onSearchError })

    fireEvent.change(screen.getByPlaceholderText('Search things...'), {
      target: { value: 'card' },
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(onSearchError).not.toHaveBeenCalled()
  })

  it('forwards input attributes and command item values', async () => {
    vi.useFakeTimers()
    renderEntityAutocomplete({
      id: 'thing-search',
      disabled: true,
      getItemValue: item => `value:${item.id}`,
    })
    const input = screen.getByPlaceholderText('Search things...')

    expect(input).toHaveAttribute('id', 'thing-search')
    expect(input).toBeDisabled()

    renderEntityAutocomplete({ getItemValue: item => `value:${item.id}` })
    const enabledInput = screen.getAllByPlaceholderText('Search things...')[1] as HTMLElement
    fireEvent.change(enabledInput, { target: { value: 'card' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(screen.getByText('card').closest('li')).toHaveAttribute('data-value', 'value:card')
  })

  it('fires onQueryChange with the edited text on user input, not on programmatic select', async () => {
    vi.useFakeTimers()
    const onQueryChange = vi.fn<VitestLooseMock>()
    renderEntityAutocomplete({ onQueryChange })
    const input = screen.getByPlaceholderText('Search things...')

    fireEvent.change(input, { target: { value: 'ca' } })
    expect(onQueryChange).toHaveBeenLastCalledWith('ca')

    fireEvent.change(input, { target: { value: 'card' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(onQueryChange).toHaveBeenLastCalledWith('card')

    // Selecting a result updates the query via setQuery, but must NOT fire onQueryChange.
    onQueryChange.mockClear()
    fireEvent.click(screen.getByText('card'))
    expect(onQueryChange).not.toHaveBeenCalled()
  })
})
