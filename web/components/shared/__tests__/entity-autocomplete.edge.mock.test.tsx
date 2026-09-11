import { act, fireEvent, render, screen } from '@testing-library/react'
import { createContext, use, useEffect, useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EntityAutocomplete } from '../entity-autocomplete'

const { mockPreventDefault } = vi.hoisted(() => ({
  mockPreventDefault: vi.fn<() => void>(),
}))

vi.mock(import('@/components/ui/popover'), () => {
  const PopoverContext = createContext(false)
  return {
    Popover: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
      <PopoverContext.Provider value={!!open}>{children}</PopoverContext.Provider>
    ),
    PopoverAnchor: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    PopoverContent: ({
      children,
      onOpenAutoFocus,
    }: {
      children: React.ReactNode
      onOpenAutoFocus?: (e: any) => void
    }) => {
      const open = use(PopoverContext)
      const wasOpen = useRef(false)
      useEffect(() => {
        if (open && !wasOpen.current) {
          onOpenAutoFocus?.({ preventDefault: mockPreventDefault })
        }
        wasOpen.current = open
      }, [open, onOpenAutoFocus])
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
    { id: query, label: query },
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

describe('EntityAutocomplete Edge Cases', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('prevents default focus behavior when popover opens', async () => {
    vi.useFakeTimers()
    renderEntityAutocomplete()
    const input = screen.getByPlaceholderText('Search things...')

    fireEvent.change(input, { target: { value: 'card' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(mockPreventDefault).toHaveBeenCalled()
  })

  it('supports emptyText as a function', () => {
    const emptyTextFn = vi.fn<(query: string) => string>().mockReturnValue('Nothing matches query')
    renderEntityAutocomplete({
      emptyText: emptyTextFn,
    })

    const input = screen.getByPlaceholderText('Search things...')
    fireEvent.change(input, { target: { value: 'abc' } })

    expect(screen.getByTestId('command-empty').textContent).toBe('Nothing matches query')
    expect(emptyTextFn).toHaveBeenCalledWith('abc')
  })

  it('ignores successful search result when signal is aborted', async () => {
    vi.useFakeTimers()
    let resolveFirstSearch!: (results: Item[]) => void
    const search = vi.fn<VitestLooseMock>()
    search.mockImplementationOnce(
      () =>
        new Promise<Item[]>(resolve => {
          resolveFirstSearch = resolve
        }),
    )
    search.mockResolvedValueOnce([{ id: 'second', label: 'second' }])

    renderEntityAutocomplete({ search })
    const input = screen.getByPlaceholderText('Search things...')

    fireEvent.change(input, { target: { value: 'first' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    fireEvent.change(input, { target: { value: 'second' } })

    await act(async () => {
      resolveFirstSearch([{ id: 'first', label: 'first' }])
    })

    expect(screen.queryByText('first')).toBeNull()
  })

  it('handles focus when query is truthy or empty, and ignores non-Escape keys on keydown', () => {
    renderEntityAutocomplete()
    const input = screen.getByPlaceholderText('Search things...')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'card' } })
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByRole('list')).toBeInTheDocument()
  })
})
