import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

const { mockImportCommunityList, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockImportCommunityList: vi.fn<VitestLooseMock>(),
  mockToastSuccess: vi.fn<VitestLooseMock>(),
  mockToastError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/lists'), () => ({
  importCommunityListClient: mockImportCommunityList,
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { success: mockToastSuccess, error: mockToastError },
    }) as unknown as typeof import('sonner'),
)

vi.mock(
  import('@/components/ui/dialog'),
  () =>
    ({
      Dialog: ({
        open,
        children,
      }: {
        open: boolean
        children: ReactNode
        onOpenChange?: (open: boolean) => void
      }) => (open ? <div data-testid='dialog'>{children}</div> : null),
      DialogContent: ({ children, ...props }: { children: ReactNode; [k: string]: unknown }) => (
        <div
          data-testid='dialog-content'
          {...props}
        >
          {children}
        </div>
      ),
      DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
      DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    }) as unknown as typeof import('@/components/ui/dialog'),
)

import { ListImportCommunityDialog } from '../list-import-community-dialog'

describe('ListImportCommunityDialog', () => {
  beforeEach(() => {
    mockImportCommunityList.mockReset()
    mockToastSuccess.mockReset()
    mockToastError.mockReset()
  })

  it('renders nothing when closed', () => {
    render(
      <ListImportCommunityDialog
        listId='list-1'
        open={false}
        onOpenChange={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.queryByTestId('dialog')).toBeNull()
  })

  it('renders dialog with data-pw when open', () => {
    render(
      <ListImportCommunityDialog
        listId='list-1'
        open
        onOpenChange={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(document.querySelector('[data-pw="import-community-dialog"]')).not.toBeNull()
  })

  it('submit button is disabled when input is empty', () => {
    render(
      <ListImportCommunityDialog
        listId='list-1'
        open
        onOpenChange={vi.fn<VitestLooseMock>()}
      />,
    )
    const btn = document.querySelector('[data-pw="import-community-submit"]') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('calls importCommunityListClient with listId and trimmed communitySlug on submit', async () => {
    mockImportCommunityList.mockResolvedValue({ posts: 2, items: 3 })
    const onOpenChange = vi.fn<VitestLooseMock>()
    render(
      <ListImportCommunityDialog
        listId='list-1'
        open
        onOpenChange={onOpenChange}
      />,
    )
    const input = document.querySelector(
      '[data-pw="import-community-id-input"]',
    ) as HTMLInputElement
    fireEvent.change(input, { target: { value: '  comm-abc  ' } })
    fireEvent.click(document.querySelector('[data-pw="import-community-submit"]')!)
    await waitFor(() => {
      expect(mockImportCommunityList).toHaveBeenCalledWith('list-1', 'comm-abc')
    })
  })

  it('shows success toast and closes dialog after import', async () => {
    mockImportCommunityList.mockResolvedValue({ posts: 1, items: 4 })
    const onOpenChange = vi.fn<VitestLooseMock>()
    render(
      <ListImportCommunityDialog
        listId='list-1'
        open
        onOpenChange={onOpenChange}
      />,
    )
    const input = document.querySelector(
      '[data-pw="import-community-id-input"]',
    ) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'comm-abc' } })
    fireEvent.click(document.querySelector('[data-pw="import-community-submit"]')!)
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Imported 5 items')
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('calls onImported with result after successful import', async () => {
    const result = { posts: 1, items: 4 }
    mockImportCommunityList.mockResolvedValue(result)
    const onImported = vi.fn<VitestLooseMock>()
    render(
      <ListImportCommunityDialog
        listId='list-1'
        open
        onOpenChange={vi.fn<VitestLooseMock>()}
        onImported={onImported}
      />,
    )
    const input = document.querySelector(
      '[data-pw="import-community-id-input"]',
    ) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'comm-abc' } })
    fireEvent.click(document.querySelector('[data-pw="import-community-submit"]')!)
    await waitFor(() => {
      expect(onImported).toHaveBeenCalledWith(result)
    })
  })

  it('shows error toast when import fails', async () => {
    mockImportCommunityList.mockRejectedValue(new Error('Network error'))
    render(
      <ListImportCommunityDialog
        listId='list-1'
        open
        onOpenChange={vi.fn<VitestLooseMock>()}
      />,
    )
    const input = document.querySelector(
      '[data-pw="import-community-id-input"]',
    ) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'comm-abc' } })
    fireEvent.click(document.querySelector('[data-pw="import-community-submit"]')!)
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Import failed. Check the community name and try again.',
      )
    })
  })
})
