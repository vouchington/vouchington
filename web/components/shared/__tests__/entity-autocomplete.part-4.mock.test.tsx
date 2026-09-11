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
      }: {
        placeholder?: string
        value?: string
        onValueChange?: (v: string) => void
        onFocus?: () => void
        onKeyDown?: (e: React.KeyboardEvent) => void
        disabled?: boolean
        id?: string
        'aria-label'?: string
      }) => (
        <input
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          id={id}
          aria-label={ariaLabel}
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
    { id: query || 'seed', label: query || 'seed' },
  ])
  const onSelect = vi.fn<VitestLooseMock>(
    (item: Item, { setQuery }: { setQuery: (query: string) => void }) => {
      setQuery(item.label)
    },
  )

  render(
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

  return { search, onSelect }
}

describe('EntityAutocomplete', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('searches on focus when minQueryLength is 0 and the query is empty', async () => {
    vi.useFakeTimers()
    const { search } = renderEntityAutocomplete({ minQueryLength: 0 })
    const input = screen.getByPlaceholderText('Search things...')

    fireEvent.focus(input)
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(search).toHaveBeenCalledWith('', expect.any(AbortSignal))
    expect(screen.getByText('seed')).toBeDefined()
  })

  it('does not search on focus of an empty query by default', () => {
    const { search } = renderEntityAutocomplete()
    const input = screen.getByPlaceholderText('Search things...')

    fireEvent.focus(input)

    expect(search).not.toHaveBeenCalled()
  })

  it('keeps the popover open after select when closeOnSelect is false', async () => {
    vi.useFakeTimers()
    const { onSelect } = renderEntityAutocomplete({ closeOnSelect: false })
    const input = screen.getByPlaceholderText('Search things...')

    fireEvent.change(input, { target: { value: 'card' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByText('card')).toBeDefined()

    fireEvent.click(screen.getByText('card'))

    expect(onSelect).toHaveBeenCalledOnce()
    // The popover (and its command-empty sibling) only renders while `open` is true; its
    // presence after select proves closeOnSelect=false did not close the popover.
    expect(screen.queryByTestId('command-empty')).not.toBeNull()
    expect(screen.getByText('card')).toBeDefined()
  })
})
