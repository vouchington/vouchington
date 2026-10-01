import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateCommunityAutomodSettings } from '@/lib/api/client/community-automod'
import { makeCommunity, makeCommunityResponse } from '@/test-helpers/api-responses'
import { CommunityAutomodActionForm } from '../community-automod-action-form'

const { mockRefresh, mockOnError, mockOnSuccess } = vi.hoisted(() => ({
  mockRefresh: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/client/community-automod'), () => ({
  updateCommunityAutomodSettings: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: mockOnSuccess,
}))

const mockUpdateCommunityAutomodSettings = vi.mocked(updateCommunityAutomodSettings)

function radio(action: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    `[data-pw="community-automod-action-${action}"]`,
  )
  if (!element) throw new Error(`missing radio ${action}`)
  return element
}

describe('CommunityAutomodActionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('offers the three actions with the stored one selected and nothing to save', () => {
    render(
      <CommunityAutomodActionForm
        community={{ slug: 'rewards', automod_action: 'review_queue' }}
      />,
    )

    expect(radio('record_only')).toHaveAttribute('aria-checked', 'false')
    expect(radio('review_queue')).toHaveAttribute('aria-checked', 'true')
    expect(radio('unpublish')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('Send to review queue')).toBeInTheDocument()
    expect(screen.getByText('Save automod action')).toBeDisabled()
  })

  it('saves the chosen action and refreshes the page', async () => {
    mockUpdateCommunityAutomodSettings.mockResolvedValue(
      makeCommunityResponse({
        community: makeCommunity({ id: 'community-1', automod_action: 'unpublish' }),
      }),
    )
    render(
      <CommunityAutomodActionForm community={{ slug: 'rewards', automod_action: 'record_only' }} />,
    )

    fireEvent.click(radio('unpublish'))
    expect(screen.getByText('Save automod action')).not.toBeDisabled()
    fireEvent.click(screen.getByText('Save automod action'))

    await waitFor(() => {
      expect(mockUpdateCommunityAutomodSettings).toHaveBeenCalledWith('rewards', {
        automod_action: 'unpublish',
      })
    })
    expect(mockOnSuccess).toHaveBeenCalledWith('Automod action saved')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('reports save failures', async () => {
    const error = new Error('save failed')
    mockUpdateCommunityAutomodSettings.mockRejectedValue(error)
    render(
      <CommunityAutomodActionForm community={{ slug: 'rewards', automod_action: 'record_only' }} />,
    )

    fireEvent.click(radio('review_queue'))
    fireEvent.click(screen.getByText('Save automod action'))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(error, {
        fallback: 'Could not save the automod action.',
        tags: { form: 'community-automod-action' },
      })
    })
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
