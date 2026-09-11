import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock(
  import('@/components/ui/switch'),
  () =>
    ({
      Switch: ({
        checked,
        onCheckedChange,
        disabled,
        ...props
      }: {
        checked?: boolean
        onCheckedChange?: (checked: boolean) => void
        disabled?: boolean
        [key: string]: unknown
      }) => (
        <button
          type='button'
          role='switch'
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onCheckedChange?.(!checked)}
          {...props}
        />
      ),
    }) as unknown as typeof import('@/components/ui/switch'),
)

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        onValueChange,
      }: {
        children: React.ReactNode
        onValueChange?: (v: string) => void
      }) => (
        <div
          data-testid='select-mock'
          role='none'
          onClick={e => {
            const target = e.target as HTMLElement
            const value = target.getAttribute('data-select-value')
            if (value && onValueChange) onValueChange(value)
          }}
          onKeyDown={e => {
            const target = e.target as HTMLElement
            const value = target.getAttribute('data-select-value')
            if (value && onValueChange) onValueChange(value)
          }}
        >
          {children}
        </div>
      ),
      SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectValue: () => null,
      SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
        <button
          type='button'
          data-select-value={value}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(import('@/lib/api/client/moderator-vacation'), () => ({
  setMyModeratorVacation: vi.fn<VitestLooseMock>().mockResolvedValue({}),
  clearMyModeratorVacation: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
  setSuppressCommunityDigestsWhileOnVacation: vi.fn<VitestLooseMock>().mockResolvedValue({}),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

import { CommunityModeratorVacationPanel } from '../community-moderator-vacation-panel'
import {
  setMyModeratorVacation,
  clearMyModeratorVacation,
  setSuppressCommunityDigestsWhileOnVacation,
} from '@/lib/api/client/moderator-vacation'
import onError, { onSuccess } from '@/lib/on-error'

const mockSetVacation = vi.mocked(setMyModeratorVacation)
const mockClearVacation = vi.mocked(clearMyModeratorVacation)
const mockSetSuppressDigests = vi.mocked(setSuppressCommunityDigestsWhileOnVacation)
const mockOnError = vi.mocked(onError)
const mockOnSuccess = vi.mocked(onSuccess)

const SLUG = 'test-community'
const ACTIVE_VACATION = {
  community_id: 'c-1',
  user_id: 'u-1',
  starts_at: '2026-06-09T00:00:00.000Z',
  ends_at: null,
  created_at: '2026-06-09T00:00:00.000Z',
  updated_at: '2026-06-09T00:00:00.000Z',
}

describe('CommunityModeratorVacationPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders inactive state when initialVacation is null', () => {
    render(
      <CommunityModeratorVacationPanel
        communitySlug={SLUG}
        initialVacation={null}
      />,
    )

    const toggle = screen.getByRole('switch', { name: 'On vacation' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(screen.queryByTestId('select-mock')).toBeNull()
  })

  it('renders active state with duration picker when initialVacation is set', () => {
    render(
      <CommunityModeratorVacationPanel
        communitySlug={SLUG}
        initialVacation={ACTIVE_VACATION}
      />,
    )

    const toggle = screen.getByRole('switch', { name: 'On vacation' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('select-mock')).toBeDefined()
  })

  it('updates digest suppression independently from vacation state', async () => {
    render(
      <CommunityModeratorVacationPanel
        communitySlug={SLUG}
        initialVacation={null}
        initialSuppressCommunityDigestsWhileOnVacation={false}
      />,
    )
    fireEvent.click(
      screen.getByRole('switch', { name: 'Pause community digests while on vacation' }),
    )
    await waitFor(() => expect(mockSetSuppressDigests).toHaveBeenCalledWith(SLUG, true))
    expect(mockSetVacation).not.toHaveBeenCalled()
    expect(mockClearVacation).not.toHaveBeenCalled()
  })

  it('hydrates the persisted digest suppression preference', () => {
    render(
      <CommunityModeratorVacationPanel
        communitySlug={SLUG}
        initialVacation={null}
        initialSuppressCommunityDigestsWhileOnVacation
      />,
    )
    expect(
      screen
        .getByRole('switch', { name: 'Pause community digests while on vacation' })
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(screen.getByRole('switch', { name: 'On vacation' }).getAttribute('aria-checked')).toBe(
      'false',
    )
  })

  it('rolls back digest suppression when the PATCH fails', async () => {
    mockSetSuppressDigests.mockRejectedValueOnce(new Error('PATCH failed'))
    render(
      <CommunityModeratorVacationPanel
        communitySlug={SLUG}
        initialVacation={ACTIVE_VACATION}
        initialSuppressCommunityDigestsWhileOnVacation={false}
      />,
    )
    const toggle = screen.getByRole('switch', {
      name: 'Pause community digests while on vacation',
    })
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'))
    expect(screen.getByTestId('select-mock')).toBeDefined()
  })

  it('enables vacation mode when toggle is clicked from inactive', async () => {
    render(
      <CommunityModeratorVacationPanel
        communitySlug={SLUG}
        initialVacation={null}
      />,
    )

    fireEvent.click(screen.getByRole('switch', { name: 'On vacation' }))

    await waitFor(() => {
      expect(mockSetVacation).toHaveBeenCalledWith(SLUG, { endsAt: null })
    })
    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledWith('Vacation mode enabled')
    })

    expect(screen.getByTestId('select-mock')).toBeDefined()
  })

  it('disables vacation mode when toggle is clicked from active', async () => {
    render(
      <CommunityModeratorVacationPanel
        communitySlug={SLUG}
        initialVacation={ACTIVE_VACATION}
      />,
    )

    fireEvent.click(screen.getByRole('switch', { name: 'On vacation' }))

    await waitFor(() => {
      expect(mockClearVacation).toHaveBeenCalledWith(SLUG)
    })
    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledWith('Vacation mode disabled')
    })
  })

  it('updates duration when a different option is selected while active', async () => {
    render(
      <CommunityModeratorVacationPanel
        communitySlug={SLUG}
        initialVacation={ACTIVE_VACATION}
      />,
    )

    fireEvent.click(screen.getByText('7 days'))

    await waitFor(() => {
      expect(mockSetVacation).toHaveBeenCalledWith(
        SLUG,
        expect.objectContaining({ endsAt: expect.any(String) }),
      )
    })
    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledWith('Vacation duration updated')
    })
  })

  it('rolls back active state and calls onError when toggle fails', async () => {
    const err = new Error('Network error')
    mockSetVacation.mockRejectedValueOnce(err)

    render(
      <CommunityModeratorVacationPanel
        communitySlug={SLUG}
        initialVacation={null}
      />,
    )

    fireEvent.click(screen.getByRole('switch', { name: 'On vacation' }))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        err,
        expect.objectContaining({ fallback: 'Failed to update vacation mode' }),
      )
    })

    const toggle = screen.getByRole('switch', { name: 'On vacation' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })

  it('rolls back duration state and calls onError when duration change fails', async () => {
    const err = new Error('Network error')
    mockSetVacation.mockRejectedValueOnce(err)

    render(
      <CommunityModeratorVacationPanel
        communitySlug={SLUG}
        initialVacation={ACTIVE_VACATION}
      />,
    )

    fireEvent.click(screen.getByText('7 days'))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        err,
        expect.objectContaining({ fallback: 'Failed to update vacation duration' }),
      )
    })
  })
})
