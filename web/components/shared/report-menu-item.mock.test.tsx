import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock(
  import('@/lib/api/client/reports'),
  () =>
    ({
      submitReport: vi
        .fn<VitestLooseMock>()
        .mockResolvedValue({ report: { id: 'r1', status: 'pending' } }),
      REPORT_REASONS: [
        { value: 'spam', label: 'Spam' },
        { value: 'other', label: 'Other' },
      ],
    }) as unknown as typeof import('@/lib/api/client/reports'),
)

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: vi.fn<VitestLooseMock>(), success: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

// next/dynamic in jsdom: resolve the lazy component synchronously
vi.mock(
  import('./report-dialog'),
  () =>
    ({
      ReportDialog: ({ open }: { open: boolean }) =>
        open ? <div data-testid='report-dialog'>Report dialog</div> : null,
    }) as unknown as typeof import('./report-dialog'),
)

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Loader2: () => null,
    Flag: () => <svg data-testid='flag-icon' />,
    MoreHorizontal: () => <svg data-testid='more-horizontal-icon' />,
  }),
)

// Stub Radix DropdownMenu so it renders children inline without portals
vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => (
        <div>{children}</div>
      ),
      DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuItem: ({
        children,
        onSelect,
        disabled,
      }: {
        children: ReactNode
        onSelect?: (e: Event) => void
        disabled?: boolean
      }) => (
        <button
          type='button'
          role='menuitem'
          disabled={disabled}
          onClick={() => onSelect?.(new Event('select'))}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

import { ReportInlineButton, ReportMenuItem, ReportMenuKebab } from './report-menu-item'

describe('ReportMenuItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it('renders with "Report" label', () => {
    render(
      <ReportMenuItem
        entityType='post'
        entityId='post-1'
      />,
    )
    expect(screen.getByRole('menuitem', { name: /report/i })).toBeDefined()
  })

  it('renders with flag icon', () => {
    render(
      <ReportMenuItem
        entityType='post'
        entityId='post-1'
      />,
    )
    expect(screen.getByTestId('flag-icon')).toBeDefined()
  })

  it('clicking the menu item opens the dialog (sets open state)', () => {
    render(
      <ReportMenuItem
        entityType='post'
        entityId='post-1'
      />,
    )
    const item = screen.getByRole('menuitem')
    fireEvent.click(item)
    expect(screen.getByTestId('report-dialog')).toBeDefined()
  })

  it('updates when a same-tab report event is dispatched', async () => {
    render(
      <ReportMenuItem
        entityType='post'
        entityId='post-1'
      />,
    )
    sessionStorage.setItem('report:post:post-1', 'submitted')
    window.dispatchEvent(
      new CustomEvent('voucha:report-submitted', { detail: { key: 'report:post:post-1' } }),
    )
    await waitFor(() => expect(screen.getByRole('menuitem', { name: /reported/i })).toBeDefined())
  })

  it('shows "Reported" label when sessionStorage flag is set', () => {
    sessionStorage.setItem('report:post:post-1', 'submitted')
    render(
      <ReportMenuItem
        entityType='post'
        entityId='post-1'
      />,
    )
    expect(screen.getByRole('menuitem', { name: /reported/i })).toBeDefined()
  })
})

describe('ReportMenuKebab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it('renders the MoreHorizontal trigger button with a report-specific name', () => {
    render(
      <ReportMenuKebab
        entityType='post'
        entityId='post-1'
      />,
    )
    expect(screen.getByRole('button', { name: /report actions/i })).toBeDefined()
    expect(screen.getByTestId('more-horizontal-icon')).toBeDefined()
  })

  it('renders a Report menu item inside', () => {
    render(
      <ReportMenuKebab
        entityType='comment'
        entityId='comment-1'
      />,
    )
    expect(screen.getByRole('menuitem', { name: /report/i })).toBeDefined()
  })
})

describe('ReportInlineButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it('does not render for signed-out users', () => {
    render(
      <ReportInlineButton
        entityType='post'
        entityId='post-1'
        isAuthenticated={false}
      />,
    )
    expect(screen.queryByRole('button', { name: /report/i })).toBeNull()
  })

  it('renders for signed-in users', () => {
    render(
      <ReportInlineButton
        entityType='post'
        entityId='post-1'
        isAuthenticated
      />,
    )
    expect(screen.getByRole('button', { name: /report/i })).toContainElement(
      screen.getByTestId('flag-icon'),
    )
  })

  it('renders with a flag icon', () => {
    render(
      <ReportInlineButton
        entityType='post'
        entityId='post-1'
        isAuthenticated
      />,
    )
    expect(screen.getByTestId('flag-icon')).toBeDefined()
  })
})
