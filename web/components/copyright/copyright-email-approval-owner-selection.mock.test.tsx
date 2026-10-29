import '@/test-helpers/i18n/mock-json-messages'
import { useState } from 'react'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  createCopyrightEmailApprovalDraft,
  type CopyrightEmailApprovalDraft,
} from './copyright-email-approval-model'
import { useCopyrightEmailApprovalOwnerSelection } from './copyright-email-approval-owner-selection'
import { CopyrightEmailApprovalManualTargetFields } from './copyright-email-approval-manual-target-fields'

const fetchUser = vi.hoisted(() => vi.fn<VitestLooseMock>())
const fetchPost = vi.hoisted(() => vi.fn<VitestLooseMock>())
const onError = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock(import('@/lib/on-error'), () => ({ default: onError }))
vi.mock(
  import('@/lib/api/client/posts'),
  () => ({ fetchPost }) as unknown as typeof import('@/lib/api/client/posts'),
)
vi.mock(
  import('@/lib/api/client/users'),
  () => ({ fetchUser }) as unknown as typeof import('@/lib/api/client/users'),
)
vi.mock(
  import('@/components/users/user-autocomplete'),
  () =>
    ({
      UserAutocomplete: ({ onChange }: { onChange: (id: string, username: string) => void }) => (
        <button
          type='button'
          onClick={() => onChange('user-2', 'user-2')}
        >
          Choose user
        </button>
      ),
    }) as unknown as typeof import('@/components/users/user-autocomplete'),
)

const draft = createCopyrightEmailApprovalDraft(undefined)
const target = { ...draft.targets[0]!, resolution_status: 'failed' as const }

describe('copyright approval owner selection draft updates', () => {
  it('preserves claimant and other target edits while an account lookup is pending', async () => {
    let finishLookup!: (value: unknown) => void
    fetchUser.mockReturnValueOnce(
      new Promise(resolve => {
        finishLookup = resolve
      }),
    )
    const initial: CopyrightEmailApprovalDraft = {
      ...draft,
      targets: [
        { ...target, surface: 'user-profile-image' },
        { ...target, id: 'second', group_id: 'group-2' },
      ],
    }
    function Harness() {
      const [value, setValue] = useState(initial)
      return (
        <>
          <output aria-label='Selected account'>{value.targets[0]?.user_id}</output>
          <input
            aria-label='Claimant name'
            value={value.claimant_display_name}
            onChange={event =>
              setValue(current => ({ ...current, claimant_display_name: event.target.value }))
            }
          />
          <input
            aria-label='Other hosted URL'
            value={value.targets[1]!.target_url}
            onChange={event =>
              setValue(current => ({
                ...current,
                targets: current.targets.map(item =>
                  item.id === 'second' ? { ...item, target_url: event.target.value } : item,
                ),
              }))
            }
          />
          <CopyrightEmailApprovalManualTargetFields
            target={value.targets[0]!}
            index={0}
            draft={value}
            onChange={setValue}
            error={undefined}
          />
        </>
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose user' }))
    fireEvent.change(screen.getByLabelText('Claimant name'), {
      target: { value: 'Updated claimant' },
    })
    fireEvent.change(screen.getByLabelText('Other hosted URL'), {
      target: { value: 'https://voucha.ai/discussion/updated' },
    })
    await act(async () => finishLookup({ user: { id: 'user-2', username: 'harbouruser' } }))
    expect(screen.getByRole('button', { name: 'Find hosted material' })).toBeEnabled()
    expect(screen.getByLabelText('Claimant name')).toHaveValue('Updated claimant')
    expect(screen.getByLabelText('Other hosted URL')).toHaveValue(
      'https://voucha.ai/discussion/updated',
    )
    expect(screen.getByLabelText('Selected account')).toHaveTextContent('user-2')
  })
})

describe('copyright owner lookup lifecycle', () => {
  it.each(['user success', 'user error', 'post error'] as const)(
    'ignores a late %s after the target unmounts',
    async scenario => {
      let resolveLookup!: (value: unknown) => void
      let rejectLookup!: (error: Error) => void
      const lookup = new Promise((resolve, reject) => {
        resolveLookup = resolve
        rejectLookup = reject
      })
      const fetchOwner = scenario === 'post error' ? fetchPost : fetchUser
      fetchOwner.mockReturnValueOnce(lookup)
      onError.mockClear()
      const onChange = vi.fn<React.Dispatch<React.SetStateAction<CopyrightEmailApprovalDraft>>>()
      const { result, unmount } = renderHook(() =>
        useCopyrightEmailApprovalOwnerSelection(target, onChange),
      )
      let pending!: Promise<void>
      act(() => {
        pending =
          scenario === 'post error'
            ? result.current.selectPost('post-2', 'Harbour')
            : result.current.selectUser('user-2')
      })
      onChange.mockClear()
      unmount()
      await act(async () => {
        if (scenario === 'user success')
          resolveLookup({ user: { id: 'user-2', username: 'harbouruser' } })
        else rejectLookup(new Error('Lookup failed after closing'))
        await pending
      })
      expect(onChange).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
    },
  )
})
