import type { ReactNode } from 'react'
import { vi } from 'vitest'

vi.mock(import('@/components/ui/tabs'), () => {
  let selectedValue = ''
  let selectValue: (value: string) => void = () => undefined

  return {
    Tabs: ({
      children,
      onValueChange,
      value,
    }: {
      children?: ReactNode
      onValueChange: (value: string) => void
      value: string
    }) => {
      selectedValue = value
      selectValue = onValueChange
      return <div>{children}</div>
    },
    TabsContent: ({ children, value }: { children?: ReactNode; value: string }) => {
      return selectedValue === value ? <div role='tabpanel'>{children}</div> : null
    },
    TabsList: ({ children }: { children?: ReactNode }) => <div role='tablist'>{children}</div>,
    TabsTrigger: ({
      children,
      value,
    }: {
      children?: ReactNode
      value: string
      asChild?: boolean
    }) => (
      // ast-grep-ignore: web-no-raw-form-elements -- test double replaces the Tabs trigger with a native button the tab tests click
      <button
        aria-selected={selectedValue === value}
        onClick={() => selectValue(value)}
        role='tab'
        type='button'
      >
        {children}
      </button>
    ),
  } as unknown as typeof import('@/components/ui/tabs')
})
