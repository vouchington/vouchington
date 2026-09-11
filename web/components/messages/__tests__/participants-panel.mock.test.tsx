import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const { mockAddParticipant, mockRemoveParticipant, mockUpdatePolicy, mockPush, mockOnError } =
  vi.hoisted(() => ({
    mockAddParticipant: vi.fn<VitestLooseMock>(),
    mockRemoveParticipant: vi.fn<VitestLooseMock>(),
    mockUpdatePolicy: vi.fn<VitestLooseMock>(),
    mockPush: vi.fn<VitestLooseMock>(),
    mockOnError: vi.fn<VitestLooseMock>(),
  }))
vi.mock(import('@/lib/api/client/messages'), () => ({
  addConversationParticipant: mockAddParticipant,
  removeConversationParticipant: mockRemoveParticipant,
  updateConversationParticipantPolicy: mockUpdatePolicy,
}))
vi.mock(import('@/lib/api/client/users'), () => ({
  searchUsers: vi.fn<VitestLooseMock>(),
}))
vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: mockPush }),
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
}))
vi.mock(
  import('@/components/shared/user-avatar'),
  () =>
    ({
      UserAvatar: ({
        username,
      }: {
        username: string
        profileImageId: string | null
        size?: string
      }) => <span>{username}</span>,
    }) as unknown as typeof import('@/components/shared/user-avatar'),
)
vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({
        children,
        onClick,
        disabled,
        type: _t,
        loading: _l,
        size: _s,
        variant: _v,
        ...rest
      }: {
        children: React.ReactNode
        onClick?: () => void
        disabled?: boolean
        type?: string
        loading?: boolean
        size?: string
        variant?: string
        [k: string]: unknown
      }) => (
        <button
          type='button'
          onClick={onClick}
          disabled={disabled}
          {...rest}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/button'),
)
vi.mock(
  import('@/components/shared/entity-autocomplete'),
  () =>
    ({
      EntityAutocomplete: ({
        onSelect,
        ariaLabel,
        dataPw,
      }: {
        onSelect: (item: UserSearchResult, helpers: { setQuery: (q: string) => void }) => void
        ariaLabel?: string
        dataPw?: { input?: string; item?: string }
        [k: string]: unknown
      }) => (
        <button
          type='button'
          data-pw={dataPw?.item}
          aria-label={ariaLabel}
          onClick={() =>
            onSelect({ id: 'new-u', username: 'newuser' } as UserSearchResult, {
              setQuery: vi.fn<VitestLooseMock>(),
            })
          }
        >
          Add
        </button>
      ),
    }) as unknown as typeof import('@/components/shared/entity-autocomplete'),
)
import type { UserSearchResult } from '@/types/user'
import { ParticipantsPanel } from '../participants-panel'
import type { DirectMessageParticipant } from '@/types/messages'

function makeParticipant(
  id: string,
  userId: string,
  username: string | null = null,
): DirectMessageParticipant {
  return {
    id,
    conversation_id: 'conv-1',
    user_id: userId,
    role: 'member',
    created_at: '2026-01-01T00:00:00Z',
    username,
    profile_image_id: null,
  }
}

const OWNER = makeParticipant('p-owner', 'user-owner', 'owneruser')
const MEMBER = makeParticipant('p-member', 'user-member', 'memberuser')

function renderOwner(extra?: Partial<Parameters<typeof ParticipantsPanel>[0]>) {
  return render(
    <ParticipantsPanel
      conversationId='conv-1'
      currentUserId='user-owner'
      isOwner
      initialParticipants={[OWNER, MEMBER]}
      initialParticipantAddPolicy='owner_only'
      {...extra}
    />,
  )
}

describe('ParticipantsPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders participant list with usernames', () => {
    renderOwner()
    expect(screen.getByText('@owneruser')).toBeDefined()
    expect(screen.getByText('@memberuser')).toBeDefined()
  })

  it('owner sees remove button for other participants', () => {
    const { container } = renderOwner()
    expect(container.querySelector('[data-pw="remove-participant-button"]')).not.toBeNull()
  })

  it('remove button shows confirm step on click', () => {
    const { container } = renderOwner()
    const removeBtn = container.querySelector(
      '[data-pw="remove-participant-button"]',
    ) as HTMLButtonElement
    fireEvent.click(removeBtn)
    expect(container.querySelector('[data-pw="confirm-remove-participant"]')).not.toBeNull()
  })

  it('owner removes a participant', async () => {
    mockRemoveParticipant.mockResolvedValueOnce(undefined)
    const { container } = renderOwner()
    fireEvent.click(
      container.querySelector('[data-pw="remove-participant-button"]') as HTMLButtonElement,
    )
    fireEvent.click(
      container.querySelector('[data-pw="confirm-remove-participant"]') as HTMLButtonElement,
    )
    await waitFor(() => {
      expect(mockRemoveParticipant).toHaveBeenCalledWith('conv-1', 'user-member')
    })
  })

  it('non-owner sees leave button', () => {
    const { container } = render(
      <ParticipantsPanel
        conversationId='conv-1'
        currentUserId='user-member'
        isOwner={false}
        initialParticipants={[OWNER, MEMBER]}
        initialParticipantAddPolicy='owner_only'
      />,
    )
    expect(container.querySelector('[data-pw="leave-conversation-button"]')).not.toBeNull()
  })

  it('leave conversation calls remove and navigates', async () => {
    mockRemoveParticipant.mockResolvedValueOnce(undefined)
    const { container } = render(
      <ParticipantsPanel
        conversationId='conv-1'
        currentUserId='user-member'
        isOwner={false}
        initialParticipants={[OWNER, MEMBER]}
        initialParticipantAddPolicy='owner_only'
      />,
    )
    fireEvent.click(
      container.querySelector('[data-pw="leave-conversation-button"]') as HTMLButtonElement,
    )
    await waitFor(() => {
      expect(mockRemoveParticipant).toHaveBeenCalledWith('conv-1', 'user-member')
    })
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/messages')
    })
  })

  it('owner sees add participant button when policy is owner_only', () => {
    const { container } = renderOwner()
    expect(container.querySelector('[data-pw="add-participant-button"]')).not.toBeNull()
  })

  it('all_members policy shows add button for non-owner', () => {
    const { container } = render(
      <ParticipantsPanel
        conversationId='conv-1'
        currentUserId='user-member'
        isOwner={false}
        initialParticipants={[OWNER, MEMBER]}
        initialParticipantAddPolicy='all_members'
      />,
    )
    expect(container.querySelector('[data-pw="add-participant-button"]')).not.toBeNull()
  })

  it('add participant submits via EntityAutocomplete', async () => {
    mockAddParticipant.mockResolvedValueOnce({
      participant: makeParticipant('p-new', 'new-u', 'newuser'),
    })
    const { container } = renderOwner()
    fireEvent.click(
      container.querySelector('[data-pw="add-participant-button"]') as HTMLButtonElement,
    )
    fireEvent.click(
      container.querySelector('[data-pw="add-participant-item"]') as HTMLButtonElement,
    )
    await waitFor(() => {
      expect(mockAddParticipant).toHaveBeenCalledWith('conv-1', 'new-u')
    })
  })

  it('owner sees policy toggle buttons', () => {
    const { container } = renderOwner()
    expect(container.querySelector('[data-pw="policy-owner-only"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="policy-all-members"]')).not.toBeNull()
  })

  it('owner can change policy to all_members', async () => {
    mockUpdatePolicy.mockResolvedValueOnce(undefined)
    const { container } = renderOwner()
    fireEvent.click(container.querySelector('[data-pw="policy-all-members"]') as HTMLButtonElement)
    await waitFor(() => {
      expect(mockUpdatePolicy).toHaveBeenCalledWith('conv-1', 'all_members')
    })
  })

  it('cancel confirm-remove hides the confirm buttons', () => {
    const { container } = renderOwner()
    fireEvent.click(
      container.querySelector('[data-pw="remove-participant-button"]') as HTMLButtonElement,
    )
    expect(container.querySelector('[data-pw="confirm-remove-participant"]')).not.toBeNull()
    const [cancelBtn] = screen.getAllByText('Cancel')
    fireEvent.click(cancelBtn!)
    expect(container.querySelector('[data-pw="confirm-remove-participant"]')).toBeNull()
  })

  it('cancel add-form hides the autocomplete', () => {
    const { container } = renderOwner()
    fireEvent.click(
      container.querySelector('[data-pw="add-participant-button"]') as HTMLButtonElement,
    )
    expect(container.querySelector('[data-pw="add-participant-item"]')).not.toBeNull()
    const cancelBtns = screen.getAllByText('Cancel')
    fireEvent.click(cancelBtns.at(-1)!)
    expect(container.querySelector('[data-pw="add-participant-button"]')).not.toBeNull()
  })

  it('calls onError when removeParticipant fails', async () => {
    mockRemoveParticipant.mockRejectedValueOnce(new Error('fail'))
    const { container } = renderOwner()
    fireEvent.click(
      container.querySelector('[data-pw="remove-participant-button"]') as HTMLButtonElement,
    )
    fireEvent.click(
      container.querySelector('[data-pw="confirm-remove-participant"]') as HTMLButtonElement,
    )
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
  })
})
