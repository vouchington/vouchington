import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReferralLinksManager } from '../referral-links-manager'
import {
  updateReferralLink,
  deleteReferralLink,
  deactivateReferralLink,
  unfurlReferralLink,
  getMyReferralLinksClient,
} from '@/lib/api/client/referral-links'
import onError, { onSuccess } from '@/lib/on-error'
import type { UserReferralLinkWithDetails } from '@/types/api-responses'

const fakeLink = vi.hoisted((): UserReferralLinkWithDetails => ({
  id: 'link-1',
  user_id: 'user-1',
  referral_program_id: 'rp-1',
  url_id: 'url-1',
  url: 'https://bank.com/ref/you',
  label: 'My link',
  activated_at: '2024-01-01T00:00:00Z',
  deactivated_at: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  referral_program_name: 'Bank',
  referral_program_slug: 'bank',
  parent_link_id: null,
  unfurl_requested_at: null,
  unfurl_completed_at: null,
  unfurl_failed_at: null,
  unfurl_last_error: null,
}))

vi.mock(import('next/navigation'), () => ({
  useRouter: vi.fn<VitestLooseMock>(() => ({ push: vi.fn<VitestLooseMock>() })),
}))

vi.mock(import('@/lib/api/client/referral-links'), () => ({
  updateReferralLink: vi.fn<VitestLooseMock>(),
  deleteReferralLink: vi.fn<VitestLooseMock>(),
  activateReferralLink: vi.fn<VitestLooseMock>(),
  deactivateReferralLink: vi.fn<VitestLooseMock>(),
  unfurlReferralLink: vi.fn<VitestLooseMock>(),
  getMyReferralLinksClient: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

// Stub ReferralLinkGroups to expose callbacks as test buttons
vi.mock(import('../referral-links-manager/referral-link-groups'), () => ({
  ReferralLinkGroups: ({
    onSaveLabel,
    onToggleActive,
    onUnfurl,
    onDelete,
  }: {
    onSaveLabel?: (link: UserReferralLinkWithDetails) => void
    onToggleActive?: (link: UserReferralLinkWithDetails) => void
    onUnfurl?: (link: UserReferralLinkWithDetails) => void
    onDelete?: (id: string) => void
  }) => (
    <div>
      <button
        type='button'
        onClick={() => onSaveLabel?.(fakeLink)}
      >
        trigger-save-label
      </button>
      <button
        type='button'
        onClick={() => onToggleActive?.(fakeLink)}
      >
        trigger-toggle-active
      </button>
      <button
        type='button'
        onClick={() => onUnfurl?.(fakeLink)}
      >
        trigger-unfurl
      </button>
      <button
        type='button'
        onClick={() => onDelete?.(fakeLink.id)}
      >
        trigger-delete
      </button>
    </div>
  ),
}))

vi.mock(import('../referral-links-manager/add-referral-link'), () => ({
  AddReferralLink: () => <div data-testid='add-referral-link' />,
}))

const mockUpdateReferralLink = vi.mocked(updateReferralLink)
const mockDeleteReferralLink = vi.mocked(deleteReferralLink)
const mockDeactivateReferralLink = vi.mocked(deactivateReferralLink)
const mockUnfurlReferralLink = vi.mocked(unfurlReferralLink)
const mockGetMyReferralLinksClient = vi.mocked(getMyReferralLinksClient)
const mockOnError = vi.mocked(onError)
const mockOnSuccess = vi.mocked(onSuccess)

describe('ReferralLinksManager — error handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls onError when save label fails', async () => {
    mockUpdateReferralLink.mockRejectedValueOnce(new Error('update failed'))

    render(
      <ReferralLinksManager
        initialLinks={[fakeLink]}
        initialPageInfo={null}
        hasPlusTier
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'trigger-save-label' }))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: 'Failed to update label' }),
      )
    })
  })

  it('calls onError when toggle active fails', async () => {
    mockDeactivateReferralLink.mockRejectedValueOnce(new Error('toggle failed'))

    render(
      <ReferralLinksManager
        initialLinks={[fakeLink]}
        initialPageInfo={null}
        hasPlusTier
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'trigger-toggle-active' }))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: 'Failed to update link' }),
      )
    })
  })

  it('calls onError when delete fails', async () => {
    mockDeleteReferralLink.mockRejectedValueOnce(new Error('delete failed'))

    render(
      <ReferralLinksManager
        initialLinks={[fakeLink]}
        initialPageInfo={null}
        hasPlusTier
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'trigger-delete' }))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: 'Failed to remove link' }),
      )
    })
  })

  it('preserves the list and exposes an announced retry when load more fails', async () => {
    mockGetMyReferralLinksClient.mockRejectedValueOnce(new Error('load failed'))

    render(
      <ReferralLinksManager
        initialLinks={[fakeLink]}
        initialPageInfo={{ has_next_page: true, end_cursor: 'cursor-1', start_cursor: null }}
        hasPlusTier
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /load more/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load more')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'trigger-delete' })).toBeVisible()
  })

  it('updates unfurl state and shows a success toast when unfurl succeeds', async () => {
    mockUnfurlReferralLink.mockResolvedValueOnce({
      referral_link: {
        id: fakeLink.id,
        parent_link_id: null,
        unfurl_requested_at: '2024-02-01T00:00:00Z',
        unfurl_completed_at: null,
        unfurl_failed_at: null,
        unfurl_last_error: null,
      },
    })

    render(
      <ReferralLinksManager
        initialLinks={[fakeLink]}
        initialPageInfo={null}
        hasPlusTier
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'trigger-unfurl' }))

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledWith(
        'Unfurl requested — per-card links will appear shortly',
      )
    })
    expect(mockUnfurlReferralLink).toHaveBeenCalledWith(fakeLink.id)
  })

  it('calls onError with a fallback when unfurl fails', async () => {
    mockUnfurlReferralLink.mockRejectedValueOnce(new Error('unfurl failed'))

    render(
      <ReferralLinksManager
        initialLinks={[fakeLink]}
        initialPageInfo={null}
        hasPlusTier
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'trigger-unfurl' }))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: 'Failed to request unfurl' }),
      )
    })
  })
})
