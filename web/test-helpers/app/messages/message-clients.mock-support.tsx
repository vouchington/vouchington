import type { ReactNode } from 'react'
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

export { mockOnError }
