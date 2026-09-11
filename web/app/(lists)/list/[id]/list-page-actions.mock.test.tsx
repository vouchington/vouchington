import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const { mockToastSuccess, mockRouterRefresh } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn<VitestLooseMock>(),
  mockRouterRefresh: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('sonner'),
  () => ({ toast: { success: mockToastSuccess } }) as unknown as typeof import('sonner'),
)
vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRouterRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('@/components/lists/list-import-community-dialog'),
  () =>
    ({
      ListImportCommunityDialog: ({
        open,
        onImported,
      }: {
        open: boolean
        listId: string
        onOpenChange: (v: boolean) => void
        onImported?: () => void
      }) =>
        open ? (
          <div data-testid='import-dialog'>
            <button
              type='button'
              aria-label='trigger imported'
              data-testid='trigger-imported'
              onClick={() => onImported?.()}
            />
          </div>
        ) : null,
    }) as unknown as typeof import('@/components/lists/list-import-community-dialog'),
)

import { ListPageActions } from './list-page-actions'

describe('ListPageActions', () => {
  beforeEach(() => {
    mockToastSuccess.mockReset()
    mockRouterRefresh.mockReset()
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn<VitestLooseMock>().mockResolvedValue(undefined) },
    })
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://example.com' },
      writable: true,
    })
  })

  it('renders data-pw container', () => {
    render(<ListPageActions listId='list-1' />)
    expect(document.querySelector('[data-pw="list-page-actions"]')).not.toBeNull()
  })

  it('renders copy link and import buttons', () => {
    render(<ListPageActions listId='list-1' />)
    expect(document.querySelector('[data-pw="list-copy-link"]')).not.toBeNull()
    expect(document.querySelector('[data-pw="list-import-community"]')).not.toBeNull()
  })

  it('copies list URL and shows success toast on copy link click', async () => {
    render(<ListPageActions listId='list-abc' />)
    fireEvent.click(document.querySelector('[data-pw="list-copy-link"]')!)
    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://example.com/list/list-abc',
      )
      expect(mockToastSuccess).toHaveBeenCalledWith('Link copied')
    })
  })

  it('opens import dialog when import button clicked', () => {
    render(<ListPageActions listId='list-1' />)
    expect(screen.queryByTestId('import-dialog')).toBeNull()
    fireEvent.click(document.querySelector('[data-pw="list-import-community"]')!)
    expect(screen.getByTestId('import-dialog')).not.toBeNull()
  })

  it('calls router.refresh after import completes', () => {
    render(<ListPageActions listId='list-1' />)
    fireEvent.click(document.querySelector('[data-pw="list-import-community"]')!)
    fireEvent.click(screen.getByTestId('trigger-imported'))
    expect(mockRouterRefresh).toHaveBeenCalledOnce()
  })
})
