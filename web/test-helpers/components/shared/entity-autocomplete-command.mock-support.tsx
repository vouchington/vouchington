/* oxlint-disable no-mistakes/playwright-consistent-attribute, no-mistakes/playwright-literals -- moved test support preserves existing Testing Library selectors */
import type { ComponentProps, KeyboardEvent, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'

interface Item {
  id: string
  label: string
}

vi.mock(
  import('@/components/ui/command'),
  () =>
    ({
      Command: ({
        children,
        shouldFilter: _shouldFilter,
        ...props
      }: {
        children: ReactNode
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
        onKeyDown?: (e: KeyboardEvent) => void
        disabled?: boolean
        id?: string
        'aria-label'?: string
        'data-pw'?: string
      }) => (
        <Input
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          id={id}
          aria-label={ariaLabel}
          data-pw={dataPw ?? 'command-input'}
          onChange={event => onValueChange?.(event.target.value)}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
        />
      ),
      CommandList: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
      CommandEmpty: ({ children }: { children: ReactNode }) => (
        <li data-testid='command-empty'>{children}</li>
      ),
      CommandItem: ({
        children,
        onSelect,
        value,
      }: {
        children: ReactNode
        onSelect?: () => void
        value?: string
      }) => (
        <li data-value={value}>
          <Button
            type='button'
            onClick={onSelect}
          >
            {children}
          </Button>
        </li>
      ),
    }) as unknown as typeof import('@/components/ui/command'),
)

export function renderEntityAutocomplete(
  overrides: Partial<ComponentProps<typeof EntityAutocomplete<Item>>> = {},
  options?: { seedEmptyQuery?: boolean },
) {
  const search = vi.fn<VitestLooseMock>(async (query: string): Promise<Item[]> => {
    const value = options?.seedEmptyQuery ? query || 'seed' : query
    return [{ id: value, label: value }]
  })
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
