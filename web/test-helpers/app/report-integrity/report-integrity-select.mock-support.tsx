/* oxlint-disable react/only-export-components -- test support file holds a local button stub used by the Select mock */

import type { ReactNode } from 'react'
import { vi } from 'vitest'

function SetResolvedButton({ onClick }: { onClick: () => void }) {
  return (
    // ast-grep-ignore: web-no-raw-form-elements -- test double replaces the Select item with a native button the flag tests click
    <button
      type='button'
      onClick={onClick}
    >
      set resolved
    </button>
  )
}

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        value,
        onValueChange,
        children,
      }: {
        value: string
        onValueChange: (value: string) => void
        children: ReactNode
      }) => (
        <div>
          <div>{`Filter: ${value}`}</div>
          <SetResolvedButton onClick={() => onValueChange('resolved')} />
          {children}
        </div>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
        <div data-value={value}>{children}</div>
      ),
      SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)
