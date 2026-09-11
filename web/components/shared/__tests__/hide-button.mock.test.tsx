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
    toast: { error: vi.fn<VitestLooseMock>() },
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
    EyeOff: () => <svg data-testid='eye-off-icon' />,
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
import { HideButton, HideMenuItem } from '../hide-button'
import { bookmarkEntity, unbookmarkEntity } from '@/lib/api/client/bookmarks'
describe('HideButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it('renders with aria-label "Hide" when not hidden', () => {
    render(
      <HideButton
        entityType='rss_feed_item'
        entityId='item-1'
      />,
    )
    expect(screen.getByRole('button', { name: 'Hide' })).toBeDefined()
  })
  it('renders with aria-label "Unhide" when initialActive=true', () => {
    render(
      <HideButton
        entityType='rss_feed_item'
        entityId='item-1'
        initialActive
      />,
    )
    expect(screen.getByRole('button', { name: 'Unhide' })).toBeDefined()
  })
  it('calls bookmarkEntity on click when not hidden', async () => {
    render(
      <HideButton
        entityType='rss_feed_item'
        entityId='item-1'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    await waitFor(() => {
      expect(bookmarkEntity).toHaveBeenCalledWith('rss_feed_item', 'item-1', 'hide')
    })
  })
  it('dispatches rss-item-hidden CustomEvent after successful hide', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    render(
      <HideButton
        entityType='rss_feed_item'
        entityId='item-1'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    await waitFor(() => {
      expect(bookmarkEntity).toHaveBeenCalled()
    })
    const hideEvent = dispatchSpy.mock.calls.find(
      ([e]) => e instanceof CustomEvent && e.type === 'rss-item-hidden',
    )
    expect(hideEvent).toBeDefined()
    expect((hideEvent![0] as CustomEvent).detail).toEqual({ id: 'item-1' })
    dispatchSpy.mockRestore()
  })
  it('calls unbookmarkEntity when already hidden and clicked', async () => {
    render(
      <HideButton
        entityType='rss_feed_item'
        entityId='item-1'
        initialActive
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Unhide' }))
    await waitFor(() => {
      expect(unbookmarkEntity).toHaveBeenCalledWith('rss_feed_item', 'item-1', 'hide')
    })
  })
  it('toggles aria-pressed from false to true on hide click', async () => {
    render(
      <HideButton
        entityType='rss_feed_item'
        entityId='item-1'
      />,
    )
    const button = screen.getByRole('button', { name: 'Hide' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(button)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Unhide' }).getAttribute('aria-pressed')).toBe(
        'true',
      )
    })
  })
  it('renders the eye-off icon', () => {
    render(
      <HideButton
        entityType='rss_feed_item'
        entityId='item-1'
      />,
    )
    expect(screen.getByTestId('eye-off-icon')).toBeDefined()
  })
  it('does not dispatch rss-item-hidden when unhiding', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    render(
      <HideButton
        entityType='rss_feed_item'
        entityId='item-1'
        initialActive
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Unhide' }))
    await waitFor(() => {
      expect(unbookmarkEntity).toHaveBeenCalled()
    })
    const hideEvent = dispatchSpy.mock.calls.find(
      ([e]) => e instanceof CustomEvent && e.type === 'rss-item-hidden',
    )
    expect(hideEvent).toBeUndefined()
    dispatchSpy.mockRestore()
  })
  it('prevents menu close and hides from HideMenuItem', async () => {
    render(
      <HideMenuItem
        entityType='rss_feed_item'
        entityId='item-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))

    await waitFor(() => {
      expect(dropdownPreventDefault).toHaveBeenCalled()
      expect(bookmarkEntity).toHaveBeenCalledWith('rss_feed_item', 'item-1', 'hide')
    })
  })
  it('prevents menu close and unhides from HideMenuItem', async () => {
    render(
      <HideMenuItem
        entityType='rss_feed_item'
        entityId='item-1'
        initialActive
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Unhide' }))

    await waitFor(() => {
      expect(dropdownPreventDefault).toHaveBeenCalled()
      expect(unbookmarkEntity).toHaveBeenCalledWith('rss_feed_item', 'item-1', 'hide')
    })
  })
  it('uses controlled active state for HideButton toggles', async () => {
    const onActiveChange = vi.fn<VitestLooseMock>()
    render(
      <HideButton
        entityType='rss_feed_item'
        entityId='item-1'
        active={false}
        onActiveChange={onActiveChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))

    await waitFor(() => {
      expect(onActiveChange).toHaveBeenCalledWith(true)
      expect(bookmarkEntity).toHaveBeenCalledWith('rss_feed_item', 'item-1', 'hide')
    })
  })
  it('uses controlled active state for HideMenuItem toggles', async () => {
    const onActiveChange = vi.fn<VitestLooseMock>()
    render(
      <HideMenuItem
        entityType='rss_feed_item'
        entityId='item-1'
        active
        onActiveChange={onActiveChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Unhide' }))

    await waitFor(() => {
      expect(onActiveChange).toHaveBeenCalledWith(false)
      expect(unbookmarkEntity).toHaveBeenCalledWith('rss_feed_item', 'item-1', 'hide')
    })
  })
  it('uses controlled pending state for HideButton', () => {
    render(
      <HideButton
        entityType='rss_feed_item'
        entityId='item-1'
        pending
      />,
    )

    expect(screen.getByRole('button', { name: 'Hide' })).toBeDisabled()
  })
  it('uses controlled pending state for HideMenuItem', () => {
    render(
      <HideMenuItem
        entityType='rss_feed_item'
        entityId='item-1'
        pending
      />,
    )

    expect(screen.getByRole('button', { name: 'Hide' })).toBeDisabled()
  })
  it('skips state updates in catch/finally when entityId changed mid-flight', async () => {
    let reject!: VitestLooseMock
    vi.mocked(bookmarkEntity).mockReturnValueOnce(new Promise((_, r) => (reject = r)))
    const onActiveChange = vi.fn<VitestLooseMock>()
    const onPendingChange = vi.fn<VitestLooseMock>()
    const props = {
      entityType: 'rss_feed_item' as const,
      active: false as const,
      onActiveChange,
      pending: false as const,
      onPendingChange,
    }
    const { rerender } = render(
      <HideButton
        {...props}
        entityId='item-1'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    onActiveChange.mockClear()
    onPendingChange.mockClear()
    act(() => {
      rerender(
        <HideButton
          {...props}
          entityId='item-2'
        />,
      )
    })
    reject(new Error('network'))
    await waitFor(() => {
      expect(onActiveChange).not.toHaveBeenCalled()
      expect(onPendingChange).not.toHaveBeenCalled()
    })
  })
})
