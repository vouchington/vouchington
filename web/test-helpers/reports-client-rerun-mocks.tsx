import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'

export const mockNav = createNavMock()

const {
  mockResolveModerationReport,
  mockRerunReportJudgement,
  mockOnError,
  mockOnSuccess,
  mockUsePendingAiRefresh,
} = vi.hoisted(() => ({
  mockResolveModerationReport: vi.fn<VitestLooseMock>(),
  mockRerunReportJudgement: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
  mockUsePendingAiRefresh: vi.fn<VitestLooseMock>(),
}))

export {
  mockResolveModerationReport,
  mockRerunReportJudgement,
  mockOnError,
  mockOnSuccess,
  mockUsePendingAiRefresh,
}

vi.mock(import('@/lib/api/client/reports'), () => ({
  resolveModerationReport: mockResolveModerationReport,
  rerunReportJudgement: mockRerunReportJudgement,
}))

vi.mock(import('@/lib/on-error'), () => ({ default: mockOnError, onSuccess: mockOnSuccess }))
vi.mock(import('@/hooks/use-pending-ai-refresh'), () => ({
  usePendingAiRefresh: mockUsePendingAiRefresh,
}))
vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        onValueChange,
        value,
      }: {
        children: ReactNode
        onValueChange: (value: string) => void
        value: string
      }) => (
        // ast-grep-ignore: web-no-raw-form-elements -- this test double replaces the UI Select with native select semantics so rerun tests can change sort order
        <select
          aria-label='Sort reports'
          value={value}
          onChange={event => onValueChange(event.currentTarget.value)}
        >
          {children}
        </select>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
        <option value={value}>{children}</option>
      ),
      SelectTrigger: ({ children }: { children: ReactNode }) => children,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)
