import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const listFiltersNav = createNavMock()

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        value,
        onValueChange,
      }: {
        children: ReactNode
        value: string
        onValueChange: (value: string) => void
      }) => (
        <select
          aria-label='Sort list'
          value={value}
          onChange={event => onValueChange(event.target.value)}
        >
          {children}
        </select>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({
        children,
        title,
        value,
      }: {
        children: ReactNode
        title?: string
        value: string
      }) => (
        <option
          title={title}
          value={value}
        >
          {children}
        </option>
      ),
      SelectTrigger: ({ children }: { children: ReactNode }) => children,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

function resetListFiltersNav(): void {
  vi.clearAllMocks()
  listFiltersNav.reset()
}

function restoreListFiltersNav(): void {
  vi.restoreAllMocks()
}

export { listFiltersNav, resetListFiltersNav, restoreListFiltersNav }
