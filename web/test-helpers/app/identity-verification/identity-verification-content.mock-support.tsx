/* oxlint-disable no-mistakes/playwright-consistent-attribute -- moved test support forwards the select data-testid the identity verification tests query */
import type { ReactNode } from 'react'
import { vi } from 'vitest'

const { mockOnError, mockOnSuccess } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/identity-verification'), () => ({
  startMyIdentityVerificationCheckout: vi.fn<VitestLooseMock>(),
  updateMyIdentityVerificationDisplayPreferences: vi.fn<VitestLooseMock>(),
  getMyIdentityVerificationSessionUrl: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: mockOnSuccess,
}))

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        onValueChange,
        value,
        children,
      }: {
        children: ReactNode
        onValueChange?: (value: string) => void
        value?: string
      }) => (
        // ast-grep-ignore: web-no-raw-form-elements -- test double forwards the select the identity verification tests query
        <select
          aria-label='name-display-select'
          data-testid='name-display-select'
          value={value}
          onChange={event => onValueChange?.(event.target.value)}
        >
          {children}
        </select>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
        // ast-grep-ignore: web-no-raw-form-elements -- test double forwards the select the identity verification tests query
        <option value={value}>{children}</option>
      ),
      SelectTrigger: () => null,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

export { mockOnError, mockOnSuccess }
