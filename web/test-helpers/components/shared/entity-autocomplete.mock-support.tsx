import { createContext, use, type ReactNode } from 'react'
import { vi } from 'vitest'
import { renderEntityAutocomplete as renderSharedEntityAutocomplete } from './entity-autocomplete-command.mock-support'

vi.mock(import('@/components/ui/popover'), () => {
  const PopoverContext = createContext(false)
  return {
    Popover: ({ children, open }: { children: ReactNode; open?: boolean }) => (
      <PopoverContext.Provider value={!!open}>{children}</PopoverContext.Provider>
    ),
    PopoverAnchor: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    PopoverContent: ({ children }: { children: ReactNode }) => {
      const open = use(PopoverContext)
      return open ? <div>{children}</div> : null
    },
  } as unknown as typeof import('@/components/ui/popover')
})

// Vitest serves a direct `export { renderEntityAutocomplete }` of this import as undefined.
const renderEntityAutocomplete = renderSharedEntityAutocomplete

export { renderEntityAutocomplete }
