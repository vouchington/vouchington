import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import { CommunityAutomodFlagsPanel } from '../community-automod-flags-panel'
import type { CommunityModerationQueueEntry } from '@/types/api-responses'

const mocks = vi.hoisted(() => ({
  onError: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
  dismissCommunityAutomodFlag: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/community-automod'), () => ({
  dismissCommunityAutomodFlag: mocks.dismissCommunityAutomodFlag,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mocks.onError,
  onSuccess: mocks.onSuccess,
}))

const mockNav = createNavMock()

function flagEntry(
  overrides: Partial<CommunityModerationQueueEntry> = {},
): CommunityModerationQueueEntry {
  return {
    id: 'post-1',
    created_at: '2026-06-01T12:00:00.000Z',
    entity_type: 'post',
    entity_id: 'post-1',
    queue_source: 'automod_flag',
    reason: null,
    report_count: 0,
    resolved_by_id: null,
    status: 'pending',
    target_available: true,
    target_label: 'Flagged post title',
    target_content: {
      kind: 'post',
      text: 'Flagged post title',
      declared_language: null,
      lingua_rs_detected_language: 'en',
    },
    target_path: '/discussion/flagged-post',
    target_user_id: 'user-1',
    judgement: null,
    post_moderation_context: null,
    community_ban_evasion: null,
    is_system_generated: false,
    ...overrides,
  }
}

describe('CommunityAutomodFlagsPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('renders nothing when no flag is open', () => {
    const { container } = render(
      <CommunityAutomodFlagsPanel
        entries={[]}
        communitySlug='credit-cards'
      />,
    )

    expect(container.innerHTML).toBe('')
  })

  it('lists each flagged post with a link to it', () => {
    render(
      <CommunityAutomodFlagsPanel
        entries={[flagEntry(), flagEntry({ id: 'post-2', entity_id: 'post-2' })]}
        communitySlug='credit-cards'
      />,
    )

    expect(document.querySelector('section[aria-label="Automod flags"]')).not.toBeNull()
    expect(screen.getAllByRole('link', { name: 'Flagged post title' })[0]).toHaveProperty(
      'href',
      expect.stringContaining('/discussion/flagged-post'),
    )
    expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(2)
  })

  it('falls back to the label and skips the link when the post has no content or path', () => {
    render(
      <CommunityAutomodFlagsPanel
        entries={[flagEntry({ target_content: null, target_path: null })]}
        communitySlug='credit-cards'
      />,
    )

    expect(screen.queryByRole('link')).toBeNull()
    expect(document.body.textContent).toContain('Flagged post title')
  })

  it('dismisses a flag, removes its row, and refreshes the page', async () => {
    mocks.dismissCommunityAutomodFlag.mockResolvedValueOnce(undefined)
    render(
      <CommunityAutomodFlagsPanel
        entries={[flagEntry()]}
        communitySlug='credit-cards'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => {
      expect(mocks.dismissCommunityAutomodFlag).toHaveBeenCalledWith('credit-cards', 'post-1')
    })
    expect(mocks.onSuccess).toHaveBeenCalledWith('Automod flag dismissed')
    expect(mockNav.refresh).toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('Flagged post title')
  })

  it('keeps the row and reports the failure when dismissal fails', async () => {
    const failure = new Error('network failure')
    mocks.dismissCommunityAutomodFlag.mockRejectedValueOnce(failure)
    render(
      <CommunityAutomodFlagsPanel
        entries={[flagEntry()]}
        communitySlug='credit-cards'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => {
      expect(mocks.onError).toHaveBeenCalledWith(failure, {
        fallback: 'Failed to dismiss the automod flag',
      })
    })
    expect(mocks.onSuccess).not.toHaveBeenCalled()
    expect(mockNav.refresh).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveProperty('disabled', false)
  })
})
