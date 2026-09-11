import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  expectInputEnterSubmits,
  expectTextareaCmdEnterSubmits,
} from '@/test-helpers/form-keyboard'
import { makeCommunityResponse } from '@/test-helpers/api-responses'
import { CommunitySettingsForm } from '../community-settings-form'
import type { Community } from '@/types/api-responses'

const mockRouterPush = vi.fn<VitestLooseMock>()
const mockRouterRefresh = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        push: mockRouterPush,
        refresh: mockRouterRefresh,
      }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client'), () => ({
  updateCommunity: vi.fn<VitestLooseMock>(),
  archiveCommunity: vi.fn<VitestLooseMock>(),
  unarchiveCommunity: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({ children, onValueChange, value }: any) => {
        const trigger = (Array.isArray(children) ? children : [children]).find(
          child => child?.props?.id,
        )
        const labels: Record<string, string> = {
          'list-type': 'Canonical List Action',
          'member-roster-visibility': 'Member Roster Visibility',
          visibility: 'Visibility',
        }
        return (
          <select
            aria-label={labels[trigger?.props?.id] ?? 'Select'}
            value={value}
            onChange={event => onValueChange(event.target.value)}
          >
            {children}
          </select>
        )
      },
      SelectContent: ({ children }: any) => children,
      SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
      SelectTrigger: ({ children, id }: any) => <span id={id}>{children}</span>,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

import { archiveCommunity, unarchiveCommunity, updateCommunity } from '@/lib/api/client'

const mockUpdateCommunity = vi.mocked(updateCommunity)
const mockArchiveCommunity = vi.mocked(archiveCommunity)
const mockUnarchiveCommunity = vi.mocked(unarchiveCommunity)

const community = {
  id: 'community-1',
  name: 'My Community',
  slug: 'my-community',
  markdown: 'Original description',
  visibility: 'public',
  member_roster_visibility: 'public',
  post_approval_required_at: null,
  member_invites_allowed_at: null,
} as Community

describe('CommunitySettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the save button disabled after success while routing', async () => {
    mockUpdateCommunity.mockResolvedValue(
      makeCommunityResponse({
        community: {
          ...community,
          slug: 'renamed-community',
        },
      }),
    )

    render(<CommunitySettingsForm community={community} />)

    fireEvent.change(screen.getByLabelText('Slug'), {
      target: { value: 'renamed-community' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))

    await waitFor(() => {
      expect(mockUpdateCommunity).toHaveBeenCalled()
      expect(mockRouterPush).toHaveBeenCalledWith('/communities/renamed-community/settings')
    })

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
  })

  it('submits member roster visibility settings', async () => {
    const communityWithPrivateRoster = {
      ...community,
      member_roster_visibility: 'members',
    } as Community
    mockUpdateCommunity.mockResolvedValue(
      makeCommunityResponse({
        community: {
          ...communityWithPrivateRoster,
          member_roster_visibility: 'members',
        },
      }),
    )

    render(<CommunitySettingsForm community={communityWithPrivateRoster} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Member Roster Visibility' }), {
      target: { value: 'moderators' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))

    await waitFor(() => {
      expect(mockUpdateCommunity).toHaveBeenCalledWith(
        'my-community',
        expect.objectContaining({ member_roster_visibility: 'moderators' }),
      )
    })
  })

  it('toggles require-post-approval checkbox', () => {
    render(<CommunitySettingsForm community={community} />)
    const checkbox = screen.getByRole('checkbox', {
      name: 'Require post approval before publishing',
    })
    expect(checkbox).toBeDefined()
    // Click triggers onCheckedChange → setRequiresPostApproval (covers L129)
    fireEvent.click(checkbox)
    expect(checkbox).toHaveAttribute('data-state', 'checked')
  })

  it('submits when Enter is pressed in the name input', async () => {
    mockUpdateCommunity.mockResolvedValue({
      community,
    } as Awaited<ReturnType<typeof updateCommunity>>)
    render(<CommunitySettingsForm community={community} />)
    const input = screen.getByLabelText('Community Name') as HTMLInputElement
    void expectInputEnterSubmits({ input, onSubmit: mockUpdateCommunity })
    await waitFor(() => expect(mockUpdateCommunity).toHaveBeenCalled())
  })

  it('Cmd+Enter and Ctrl+Enter submit from the description textarea; plain Enter does not', () => {
    mockUpdateCommunity.mockResolvedValue({
      community,
    } as Awaited<ReturnType<typeof updateCommunity>>)
    render(<CommunitySettingsForm community={community} />)
    const textarea = screen.getByLabelText('Description') as HTMLTextAreaElement
    const onSubmit = vi.fn<VitestLooseMock>()
    textarea.form!.addEventListener('submit', onSubmit)
    expectTextareaCmdEnterSubmits({ textarea, onSubmit })
  })

  it('archives after danger zone confirmation', async () => {
    mockArchiveCommunity.mockResolvedValue({
      community: {
        ...community,
        archived_at: '2026-01-01T00:00:00Z',
      },
    } as Awaited<ReturnType<typeof archiveCommunity>>)

    render(<CommunitySettingsForm community={community} />)

    fireEvent.click(screen.getByRole('button', { name: 'Archive Community' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Archive' }))

    await waitFor(() => {
      expect(mockArchiveCommunity).toHaveBeenCalledWith('my-community')
      expect(mockRouterPush).toHaveBeenCalledWith('/communities')
    })
  })

  it('shows archive failures in the danger zone', async () => {
    mockArchiveCommunity.mockRejectedValue(new Error('Archive failed'))

    render(<CommunitySettingsForm community={community} />)

    fireEvent.click(screen.getByRole('button', { name: 'Archive Community' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Archive' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Archive failed')
    })
  })

  it('shows restore failures in the danger zone', async () => {
    const archivedCommunity = {
      ...community,
      archived_at: '2026-01-01T00:00:00Z',
      archived_by_id: 'user-1',
    } as Community
    mockUnarchiveCommunity.mockRejectedValue(new Error('Restore failed'))

    render(<CommunitySettingsForm community={archivedCommunity} />)

    fireEvent.click(screen.getByRole('button', { name: 'Restore Community' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Restore' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Restore failed')
    })
  })

  it('restores archived communities after danger zone confirmation', async () => {
    const archivedCommunity = {
      ...community,
      archived_at: '2026-01-01T00:00:00Z',
      archived_by_id: 'user-1',
    } as Community
    mockUnarchiveCommunity.mockResolvedValue({
      community: {
        ...community,
        archived_at: null,
        archived_by_id: null,
      },
    } as Awaited<ReturnType<typeof unarchiveCommunity>>)

    render(<CommunitySettingsForm community={archivedCommunity} />)

    fireEvent.click(screen.getByRole('button', { name: 'Restore Community' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Restore' }))

    await waitFor(() => {
      expect(mockUnarchiveCommunity).toHaveBeenCalledWith('my-community')
      expect(mockRouterRefresh).toHaveBeenCalled()
    })
  })
})
