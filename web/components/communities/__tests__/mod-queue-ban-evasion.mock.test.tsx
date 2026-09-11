import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityBanEvasionContext } from '@/types/api-responses'

const { mockConfirmCommunityBanEvasion, mockDismissCommunityBanEvasion, mockOnError } = vi.hoisted(
  () => ({
    mockConfirmCommunityBanEvasion: vi.fn<() => Promise<void>>(),
    mockDismissCommunityBanEvasion: vi.fn<() => Promise<void>>(),
    mockOnError: vi.fn<VitestLooseMock>(),
  }),
)

vi.mock(import('@/lib/api/client/community-ban-evasion'), () => ({
  confirmCommunityBanEvasion: mockConfirmCommunityBanEvasion,
  dismissCommunityBanEvasion: mockDismissCommunityBanEvasion,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
}))

import { ModQueueBanEvasionActions } from '../mod-queue-ban-evasion'

const banEvasion: CommunityBanEvasionContext = {
  community_id: 'community-1',
  community_slug: 'test-community',
  source_user_id: 'source-user-1',
  source_username: 'banned-user',
  score: 0.82,
  flagged_at: '2026-05-31T06:30:00.000Z',
}

function renderActions(onAction = vi.fn<VitestLooseMock>()) {
  return render(
    <ModQueueBanEvasionActions
      banEvasion={banEvasion}
      entityId='user-suspect'
      reportId='report-1'
      disabled={false}
      onAction={onAction}
    />,
  )
}

function renderRedactedActions() {
  return render(
    <ModQueueBanEvasionActions
      banEvasion={{
        community_id: 'community-1',
        community_slug: 'test-community',
        flagged_at: '2026-05-31T06:30:00.000Z',
      }}
      entityId='user-suspect'
      reportId='report-1'
      disabled={false}
      onAction={vi.fn<VitestLooseMock>()}
    />,
  )
}

describe('ModQueueBanEvasionActions', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('calls confirmCommunityBanEvasion and onAction when confirm is clicked', async () => {
    mockConfirmCommunityBanEvasion.mockResolvedValueOnce(undefined)
    const onAction = vi.fn<VitestLooseMock>()

    const { getByRole } = renderActions(onAction)
    fireEvent.click(getByRole('button', { name: /confirm ban/i }))

    await waitFor(() => expect(onAction).toHaveBeenCalledWith('report-1'))
    expect(mockConfirmCommunityBanEvasion).toHaveBeenCalledWith('community-1', 'user-suspect')
  })

  it('hides confirm when ban-evasion evidence is redacted', () => {
    const { getByRole, queryByRole } = renderRedactedActions()

    expect(queryByRole('button', { name: /confirm ban/i })).toBeNull()
    expect(getByRole('button', { name: /dismiss flag/i })).toBeTruthy()
  })

  it('shows confirm when score evidence exists without a source user', () => {
    const { getByRole } = render(
      <ModQueueBanEvasionActions
        banEvasion={{ ...banEvasion, source_user_id: '', source_username: null }}
        entityId='user-suspect'
        reportId='report-1'
        disabled={false}
        onAction={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(getByRole('button', { name: /confirm ban/i })).toBeTruthy()
  })

  it('calls onError when confirmCommunityBanEvasion fails', async () => {
    const err = new Error('confirm failed')
    mockConfirmCommunityBanEvasion.mockRejectedValueOnce(err)
    const onAction = vi.fn<(reportId: string) => void>()

    const { getByRole } = renderActions(onAction)
    fireEvent.click(getByRole('button', { name: /confirm ban/i }))

    await waitFor(() =>
      expect(mockOnError).toHaveBeenCalledWith(err, {
        fallback: 'Failed to confirm ban evasion',
      }),
    )
    expect(onAction).not.toHaveBeenCalled()
  })

  it('calls dismissCommunityBanEvasion and onAction when dismiss is clicked', async () => {
    mockDismissCommunityBanEvasion.mockResolvedValueOnce(undefined)
    const onAction = vi.fn<VitestLooseMock>()

    const { getByRole } = renderActions(onAction)
    fireEvent.click(getByRole('button', { name: /dismiss flag/i }))

    await waitFor(() => expect(onAction).toHaveBeenCalledWith('report-1'))
    expect(mockDismissCommunityBanEvasion).toHaveBeenCalledWith('community-1', 'user-suspect')
  })

  it('calls onError when dismissCommunityBanEvasion fails', async () => {
    const err = new Error('dismiss failed')
    mockDismissCommunityBanEvasion.mockRejectedValueOnce(err)

    const { getByRole } = renderActions()
    fireEvent.click(getByRole('button', { name: /dismiss flag/i }))

    await waitFor(() =>
      expect(mockOnError).toHaveBeenCalledWith(err, {
        fallback: 'Failed to dismiss ban-evasion flag',
      }),
    )
  })
})
