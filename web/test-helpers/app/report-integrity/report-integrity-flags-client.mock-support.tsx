import type { ReactNode } from 'react'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import type { ReportIntegrityFlagsClient } from '@/app/(report-integrity)/report-integrity/flags/report-integrity-flags-client'
import { vi } from 'vitest'

const mockNav = createNavMock()

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

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
      }) => {
        const setResolved = (
          // ast-grep-ignore: web-no-raw-form-elements -- test double replaces Select with a button the flag tests click by name
          <button
            type='button'
            onClick={() => onValueChange('resolved')}
          >
            set resolved
          </button>
        )
        const setAll = (
          // ast-grep-ignore: web-no-raw-form-elements -- test double replaces Select with a button the flag tests click by name
          <button
            type='button'
            onClick={() => onValueChange('all')}
          >
            set all
          </button>
        )
        return (
          <div>
            <div>{`Filter: ${value}`}</div>
            {setResolved}
            {setAll}
            {children}
          </div>
        )
      },
      SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
        <div data-value={value}>{children}</div>
      ),
      SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(import('@/lib/api/client/report-integrity'), () => ({
  resolveReportIntegrityFlag: vi.fn<VitestLooseMock>(),
  applyReportAbusePenalty: vi.fn<VitestLooseMock>(),
}))

type FlagResult = Parameters<typeof ReportIntegrityFlagsClient>[0]['initialData']['results'][0]

function makeFlag(overrides: Partial<FlagResult> = {}): FlagResult {
  return {
    id: 'flag-1',
    post_id: null,
    reported_user_id: null,
    hostname_id: null,
    rss_feed_item_id: null,
    flag_type: 'mass_report_suspected',
    reporter_count: 5,
    new_account_reporter_percent: 0.4,
    details: {},
    resolved_at: null,
    resolved_by_id: null,
    resolution: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeInitialData(flags: FlagResult[] = []) {
  return {
    results: flags,
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }
}

export { makeFlag, makeInitialData, mockNav }
