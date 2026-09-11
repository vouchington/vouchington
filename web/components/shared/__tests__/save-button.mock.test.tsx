import type { ReactNode } from 'react'
import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock(import('@/lib/api/client/bookmarks'), () => ({
  bookmarkEntity: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
  unbookmarkEntity: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
}))

function mockSonner() {
  return {
    toast: { error: vi.fn<VitestLooseMock>(), success: vi.fn<VitestLooseMock>() },
  } as unknown as typeof import('sonner')
}
vi.mock(import('sonner'), mockSonner)
function mockRateLimitError() {
  return {
    isRateLimitError: () => false,
    getRateLimitMessage: () => '',
  } as unknown as typeof import('@/lib/api/rate-limit-error')
}
vi.mock(import('@/lib/api/rate-limit-error'), mockRateLimitError)
vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Loader2: () => null,
    Bookmark: () => <svg data-testid='bookmark-icon' />,
    BookmarkCheck: () => <svg data-testid='bookmark-check-icon' />,
  }),
)
const dropdownPreventDefault = vi.hoisted(() => vi.fn<VitestLooseMock>())

function mockDropdownMenu() {
  return {
    DropdownMenuItem: ({
      children,
      disabled,
      onSelect,
    }: {
      children: ReactNode
      disabled?: boolean
      onSelect?: (event: { preventDefault: () => void }) => void
    }) => (
      <button
        type='button'
        disabled={disabled}
        onClick={() => onSelect?.({ preventDefault: dropdownPreventDefault })}
      >
        {children}
      </button>
    ),
  } as unknown as typeof import('@/components/ui/dropdown-menu')
}
vi.mock(import('@/components/ui/dropdown-menu'), mockDropdownMenu)
import { SaveButton, SaveMenuItem } from '../save-button'
import { bookmarkEntity, unbookmarkEntity } from '@/lib/api/client/bookmarks'
describe('SaveButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it('renders with aria-label "Save" when not saved', () => {
    render(
      <SaveButton
        entityType='rss_feed_item'
        entityId='item-1'
      />,
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined()
  })
  it('renders with aria-label "Saved" when initialActive=true', () => {
    render(
      <SaveButton
        entityType='rss_feed_item'
        entityId='item-1'
        initialActive
      />,
    )
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDefined()
  })
  it('calls bookmarkEntity on click when not saved', async () => {
    render(
      <SaveButton
        entityType='rss_feed_item'
        entityId='item-1'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(bookmarkEntity).toHaveBeenCalledWith('rss_feed_item', 'item-1', 'save')
    })
  })
  it('calls unbookmarkEntity when already saved and clicked', async () => {
    render(
      <SaveButton
        entityType='rss_feed_item'
        entityId='item-1'
        initialActive
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }))
    await waitFor(() => {
      expect(unbookmarkEntity).toHaveBeenCalledWith('rss_feed_item', 'item-1', 'save')
    })
  })
  it('toggles aria-pressed from false to true on save click', async () => {
    render(
      <SaveButton
        entityType='rss_feed_item'
        entityId='item-1'
      />,
    )
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(button)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Saved' }).getAttribute('aria-pressed')).toBe(
        'true',
      )
    })
  })
  it('renders the bookmark icon when not saved', () => {
    render(
      <SaveButton
        entityType='rss_feed_item'
        entityId='item-1'
      />,
    )
    expect(screen.getByTestId('bookmark-icon')).toBeDefined()
  })
  it('renders the bookmark-check icon when saved', () => {
    render(
      <SaveButton
        entityType='rss_feed_item'
        entityId='item-1'
        initialActive
      />,
    )
    expect(screen.getByTestId('bookmark-check-icon')).toBeDefined()
  })
  it('prevents menu close and saves from SaveMenuItem', async () => {
    render(
      <SaveMenuItem
        entityType='rss_feed_item'
        entityId='item-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(dropdownPreventDefault).toHaveBeenCalled()
      expect(bookmarkEntity).toHaveBeenCalledWith('rss_feed_item', 'item-1', 'save')
    })
  })
  it('prevents menu close and removes from saved items from SaveMenuItem', async () => {
    render(
      <SaveMenuItem
        entityType='rss_feed_item'
        entityId='item-1'
        initialActive
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove from saved items' }))

    await waitFor(() => {
      expect(dropdownPreventDefault).toHaveBeenCalled()
      expect(unbookmarkEntity).toHaveBeenCalledWith('rss_feed_item', 'item-1', 'save')
    })
  })
  it('uses controlled active state for SaveButton toggles', async () => {
    const onActiveChange = vi.fn<VitestLooseMock>()
    render(
      <SaveButton
        entityType='rss_feed_item'
        entityId='item-1'
        active={false}
        onActiveChange={onActiveChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onActiveChange).toHaveBeenCalledWith(true)
      expect(bookmarkEntity).toHaveBeenCalledWith('rss_feed_item', 'item-1', 'save')
    })
  })
  it('uses controlled active state for SaveMenuItem toggles', async () => {
    const onActiveChange = vi.fn<VitestLooseMock>()
    render(
      <SaveMenuItem
        entityType='rss_feed_item'
        entityId='item-1'
        active
        onActiveChange={onActiveChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove from saved items' }))

    await waitFor(() => {
      expect(onActiveChange).toHaveBeenCalledWith(false)
      expect(unbookmarkEntity).toHaveBeenCalledWith('rss_feed_item', 'item-1', 'save')
    })
  })
  it('uses controlled pending state for SaveButton', () => {
    render(
      <SaveButton
        entityType='rss_feed_item'
        entityId='item-1'
        pending
      />,
    )

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
  it('uses controlled pending state for SaveMenuItem', () => {
    render(
      <SaveMenuItem
        entityType='rss_feed_item'
        entityId='item-1'
        pending
      />,
    )

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
  it('defaults data-pw to "save-button"', () => {
    render(
      <SaveButton
        entityType='rss_feed_item'
        entityId='item-1'
      />,
    )
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('data-pw')).toBe('save-button')
  })
  it('accepts a custom data-pw override', () => {
    render(
      <SaveButton
        entityType='post'
        entityId='post-1'
        data-pw='post-save-button'
      />,
    )
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('data-pw')).toBe(
      'post-save-button',
    )
  })
  it('skips state updates in catch/finally when entityId changed mid-flight', async () => {
    let settle!: VitestLooseMock
    vi.mocked(bookmarkEntity).mockReturnValueOnce(new Promise((_, rej) => (settle = rej)))

    const onActiveChange = vi.fn<VitestLooseMock>()
    const onPendingChange = vi.fn<VitestLooseMock>()
    const { rerender } = render(
      <SaveButton
        entityType='rss_feed_item'
        entityId='item-1'
        active={false}
        onActiveChange={onActiveChange}
        pending={false}
        onPendingChange={onPendingChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    onActiveChange.mockClear()
    onPendingChange.mockClear()

    act(() => {
      rerender(
        <SaveButton
          entityType='rss_feed_item'
          entityId='item-2'
          active={false}
          onActiveChange={onActiveChange}
          pending={false}
          onPendingChange={onPendingChange}
        />,
      )
    })

    settle(new Error('network'))
    await waitFor(() => {
      expect(onActiveChange).not.toHaveBeenCalled()
      expect(onPendingChange).not.toHaveBeenCalled()
    })
  })
})
