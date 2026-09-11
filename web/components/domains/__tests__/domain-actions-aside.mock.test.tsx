import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainActionsAside } from '../domain-actions-aside'

const mocks = vi.hoisted(() => ({
  bookmarkEntity: vi.fn<VitestLooseMock>().mockResolvedValue({}),
  unbookmarkEntity: vi.fn<VitestLooseMock>().mockResolvedValue({}),
  getEntityBookmarks: vi.fn<VitestLooseMock>().mockResolvedValue([]),
}))

vi.mock(import('@/lib/api/client/bookmarks'), () => ({
  bookmarkEntity: mocks.bookmarkEntity,
  unbookmarkEntity: mocks.unbookmarkEntity,
  getEntityBookmarks: mocks.getEntityBookmarks,
}))

vi.mock(import('@/hooks/use-bookmark-invalidation'), () => ({
  emitBookmarkChange: vi.fn<VitestLooseMock>(),
  onBookmarkChange: vi.fn<VitestLooseMock>().mockReturnValue(() => {}),
}))

// Stub report-dialog — avoids fetching reports API in tests
vi.mock(
  import('@/components/shared/report-dialog'),
  () =>
    ({
      ReportDialog: ({ open }: { open: boolean }) =>
        open ? <div data-testid='report-dialog' /> : null,
    }) as unknown as typeof import('@/components/shared/report-dialog'),
)

vi.mock(
  import('@/lib/api/client/reports'),
  () =>
    ({
      submitReport: vi.fn<VitestLooseMock>().mockResolvedValue({ report: { id: 'r1' } }),
      REPORT_REASONS: [{ value: 'spam', label: 'Spam' }],
    }) as unknown as typeof import('@/lib/api/client/reports'),
)

vi.mock(
  import('@/components/ui/tooltip'),
  () =>
    ({
      TooltipProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      TooltipTrigger: ({ children, asChild }: { children: ReactNode; asChild?: boolean }) =>
        asChild ? <span>{children}</span> : <div>{children}</div>,
      TooltipContent: ({ children }: { children: ReactNode }) => (
        <div role='tooltip'>{children}</div>
      ),
    }) as unknown as typeof import('@/components/ui/tooltip'),
)

const HOSTNAME_ID = 'hostname-uuid-1'

describe('DomainActionsAside', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the aside container with correct data-pw', () => {
    const { container } = render(<DomainActionsAside hostnameId={HOSTNAME_ID} />)
    expect(container.querySelector('[data-pw="domain-actions-aside"]')).not.toBeNull()
  })

  it('shows mute and block buttons', () => {
    const { container } = render(<DomainActionsAside hostnameId={HOSTNAME_ID} />)
    expect(container.querySelector('[data-pw="domain-mute-button"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="domain-block-button"]')).not.toBeNull()
  })

  it('shows report button', () => {
    const { container } = render(<DomainActionsAside hostnameId={HOSTNAME_ID} />)
    expect(container.querySelector('[data-pw="report-inline-button"]')).not.toBeNull()
  })

  it('renders action buttons inside a group container', () => {
    const { container } = render(<DomainActionsAside hostnameId={HOSTNAME_ID} />)
    const group = container.querySelector('[role="group"]')
    expect(group).not.toBeNull()
    expect(group?.querySelector('[data-pw="domain-mute-button"]')).not.toBeNull()
    expect(group?.querySelector('[data-pw="domain-block-button"]')).not.toBeNull()
    expect(group?.querySelector('[data-pw="report-inline-button"]')).not.toBeNull()
  })
})
