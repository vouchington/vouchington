import type { ChangeEventHandler, ReactNode } from 'react'
import { vi } from 'vitest'

const { mockOnError } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/navigation/use-resolved-breadcrumbs'), () => ({
  useResolvedBreadcrumbs: vi.fn<VitestLooseMock>().mockReturnValue([]),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
}))

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav />,
}))

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({
        children,
        onClick,
        disabled,
        type: _type,
        loading: _loading,
        ...rest
      }: {
        children: ReactNode
        onClick?: () => void
        disabled?: boolean
        type?: string
        loading?: boolean
        [k: string]: unknown
      }) => (
        // ast-grep-ignore: web-no-raw-form-elements -- test double replaces Button with a native button the message client tests click
        <button
          type='button'
          onClick={onClick}
          disabled={disabled}
          {...rest}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/button'),
)

vi.mock(
  import('@/components/ui/textarea'),
  () =>
    ({
      Textarea: ({
        value,
        onChange,
        disabled,
        ...rest
      }: {
        value?: string
        onChange?: ChangeEventHandler<HTMLTextAreaElement>
        disabled?: boolean
        [k: string]: unknown
      }) => (
        // ast-grep-ignore: web-no-raw-form-elements -- test double replaces Textarea with a native textarea the message client tests fill
        <textarea
          value={value}
          onChange={onChange}
          disabled={disabled}
          {...rest}
        />
      ),
    }) as unknown as typeof import('@/components/ui/textarea'),
)

export { mockOnError }
