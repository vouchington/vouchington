import { createContext, use, useEffect, useRef, type ReactNode } from 'react'
import { vi } from 'vitest'
import { renderEntityAutocomplete as renderSharedEntityAutocomplete } from './entity-autocomplete-command.mock-support'

const { mockPreventDefault } = vi.hoisted(() => ({
  mockPreventDefault: vi.fn<() => void>(),
}))

vi.mock(import('@/components/ui/popover'), () => {
  const PopoverContext = createContext(false)
  return {
    Popover: ({ children, open }: { children: ReactNode; open?: boolean }) => (
      <PopoverContext.Provider value={!!open}>{children}</PopoverContext.Provider>
    ),
    PopoverAnchor: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    PopoverContent: ({
      children,
      onOpenAutoFocus,
    }: {
      children: ReactNode
      onOpenAutoFocus?: (event: { preventDefault: () => void }) => void
    }) => {
      const open = use(PopoverContext)
      const wasOpen = useRef(false)
      useEffect(() => {
        if (open && !wasOpen.current) onOpenAutoFocus?.({ preventDefault: mockPreventDefault })
        wasOpen.current = open
      }, [open, onOpenAutoFocus])
      return open ? <div>{children}</div> : null
    },
  } as unknown as typeof import('@/components/ui/popover')
})

// Vitest serves a direct `export { renderEntityAutocomplete }` of this import as undefined.
const renderEntityAutocomplete = renderSharedEntityAutocomplete

export { mockPreventDefault, renderEntityAutocomplete }
