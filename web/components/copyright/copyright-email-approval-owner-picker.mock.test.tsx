import '@/test-helpers/i18n/mock-json-messages'
import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  makeCommunitiesSearchResponse,
  makeCommunity,
} from '@/test-helpers/api-responses/communities'
import type { CopyrightEmailApprovalDraft } from './copyright-email-approval-model'
import { CopyrightEmailApprovalManualTargetFields } from './copyright-email-approval-manual-target-fields'

const resolvedTargets = vi.hoisted(() => vi.fn<VitestLooseMock>())
const fetchTopic = vi.hoisted(() => vi.fn<VitestLooseMock>())
const fetchUser = vi.hoisted(() => vi.fn<VitestLooseMock>())
const fetchCommunities = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock(
  import('@/lib/api/client/communities'),
  () => ({ fetchCommunities }) as unknown as typeof import('@/lib/api/client/communities'),
)
vi.mock(
  import('@/lib/api/client/topics'),
  () => ({ fetchTopic }) as unknown as typeof import('@/lib/api/client/topics'),
)
vi.mock(
  import('@/lib/api/client/users'),
  () => ({ fetchUser }) as unknown as typeof import('@/lib/api/client/users'),
)
vi.mock(import('@/lib/api/client/copyright-notice-targets'), async importOriginal => ({
  ...(await importOriginal()),
  resolveCopyrightNoticeTargets: resolvedTargets,
}))
vi.mock(
  import('@/components/posts/topic-autocomplete'),
  () =>
    ({
      TopicAutocomplete: ({ onChange }: { onChange: (id: string, name: string) => void }) => (
        <button
          type='button'
          onClick={() => onChange('topic-2', 'Harbour topic')}
        >
          Choose topic
        </button>
      ),
    }) as unknown as typeof import('@/components/posts/topic-autocomplete'),
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
const target: CopyrightEmailApprovalDraft['targets'][number] = {
  id: 'first',
  group_id: 'group-1',
  surface: 'post-image',
  post_id: '',
  target_url: 'https://voucha.ai/discussion/one',
  resolution_status: 'failed',
  image_id: '',
}
const draft: CopyrightEmailApprovalDraft = {
  jurisdiction: 'us_dmca',
  claimant_display_name: '',
  claimant_contact: '',
  claimant_email: '',
  work_description: '',
  has_good_faith_belief: false,
  has_accuracy_authority_under_penalty_of_perjury: false,
  electronic_signature: '',
  targets: [target],
}

describe('copyright approval manual owner paths', () => {
  it.each([
    ['topic-logo-image', 'Choose topic', '/topic/harbour', 'topic_id', 'topic-2'],
    ['user-profile-image', 'Choose user', '/user/harbouruser', 'user_id', 'user-2'],
    [
      'community-banner-image',
      'Choose community',
      '/communities/harbour',
      'community_id',
      'community-2',
    ],
  ] as const)(
    'uses the selected %s owner for hosted image lookup',
    async (surface, button, path, key, id) => {
      if (surface === 'topic-logo-image')
        fetchTopic.mockResolvedValue({
          id,
          name: 'Harbour topic',
          topic_type: 'topic',
          slug: 'harbour',
        })
      if (surface === 'user-profile-image')
        fetchUser.mockResolvedValue({ user: { id, username: 'harbouruser' } })
      if (surface === 'community-banner-image')
        fetchCommunities.mockResolvedValue(
          makeCommunitiesSearchResponse({
            communities: [makeCommunity({ id, name: 'Harbour', slug: 'harbour' })],
          }),
        )
      const ownerUrl = new URL(path, window.location.origin).href
      resolvedTargets.mockResolvedValue([
        {
          surface,
          [key]: id,
          image_id: 'right-image',
          target_url: ownerUrl,
          order_index: 0,
          caption: 'Correct image',
        },
        {
          surface,
          [key]: 'different-owner',
          image_id: 'wrong-image',
          target_url: ownerUrl,
          order_index: 1,
          caption: 'Wrong owner image',
        },
        {
          surface: 'post-image',
          post_id: id,
          image_id: 'wrong-surface',
          target_url: ownerUrl,
          order_index: 2,
          caption: 'Wrong surface image',
        },
      ])
      const initial: CopyrightEmailApprovalDraft = {
        ...draft,
        targets: [{ ...target, surface, post_id: '', image_id: '' }],
      }
      const latest = { current: initial }
      function Harness() {
        const [value, setValue] = useState(initial)
        return (
          <CopyrightEmailApprovalManualTargetFields
            target={value.targets[0]!}
            index={0}
            draft={value}
            onChange={next => {
              latest.current = next
              setValue(next)
            }}
            error={undefined}
          />
        )
      }
      render(<Harness />)
      if (surface === 'community-banner-image') {
        fireEvent.change(screen.getByPlaceholderText('Search communities'), {
          target: { value: 'Harbour' },
        })
        fireEvent.click(await screen.findByRole('option', { name: 'Harbour' }))
      } else fireEvent.click(screen.getByRole('button', { name: button }))
      const find = await screen.findByRole('button', { name: 'Find hosted material' })
      fireEvent.click(find)
      await waitFor(() => expect(resolvedTargets).toHaveBeenCalledWith(ownerUrl))
      fireEvent.click(await screen.findByRole('checkbox', { name: /Wrong owner image/ }))
      expect(latest.current.targets[0]?.image_id).toBe('')
      expect(
        screen.queryByRole('checkbox', { name: /Wrong surface image/ }),
      ).not.toBeInTheDocument()
      fireEvent.click(await screen.findByRole('checkbox', { name: /Correct image/ }))
      expect(latest.current.targets[0]).toMatchObject({
        [key]: id,
        image_id: 'right-image',
        target_url: ownerUrl,
        resolution_status: 'pending',
      })
    },
  )

  it('does not build an ID URL for a selected account without a username', async () => {
    fetchUser.mockResolvedValue({ user: { id: 'user-2', username: null } })
    const initial: CopyrightEmailApprovalDraft = {
      ...draft,
      targets: [{ ...target, surface: 'user-profile-image' }],
    }
    render(
      <CopyrightEmailApprovalManualTargetFields
        target={initial.targets[0]!}
        index={0}
        draft={initial}
        onChange={vi.fn<(next: CopyrightEmailApprovalDraft) => void>()}
        error={undefined}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Choose user' }))
    await waitFor(() => expect(fetchUser).toHaveBeenCalledWith('user-2'))
    expect(screen.queryByRole('button', { name: 'Find hosted material' })).not.toBeInTheDocument()
  })

  it('lets staff choose another topic when the selected topic is unavailable', async () => {
    let finishUnavailable!: (value: unknown) => void
    fetchTopic.mockReturnValueOnce(
      new Promise(resolve => {
        finishUnavailable = resolve
      }),
    )
    fetchTopic.mockResolvedValueOnce({
      id: 'topic-2',
      name: 'Harbour topic',
      topic_type: 'topic',
      slug: 'harbour',
    })
    const initial: CopyrightEmailApprovalDraft = {
      ...draft,
      targets: [{ ...target, surface: 'topic-logo-image' }],
    }
    render(
      <CopyrightEmailApprovalManualTargetFields
        target={initial.targets[0]!}
        index={0}
        draft={initial}
        onChange={vi.fn<(next: CopyrightEmailApprovalDraft) => void>()}
        error={undefined}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Choose topic' }))
    await act(async () => finishUnavailable(null))
    expect(screen.queryByRole('button', { name: 'Find hosted material' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose different owner' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose topic' }))
    expect(await screen.findByRole('button', { name: 'Find hosted material' })).toBeEnabled()
    expect(screen.getByText(/Hosted use: .*\/topic\/harbour/)).toBeInTheDocument()
    expect(fetchTopic).toHaveBeenCalledTimes(2)
  })

  it('recovers from a failed account lookup without using an account ID as the URL', async () => {
    let failLookup!: (error: Error) => void
    fetchUser.mockReturnValueOnce(
      new Promise((_, reject) => {
        failLookup = reject
      }),
    )
    fetchUser.mockResolvedValueOnce({
      user: { id: 'user-2', username: 'harbouruser' },
    })
    const initial: CopyrightEmailApprovalDraft = {
      ...draft,
      targets: [{ ...target, surface: 'user-profile-image' }],
    }
    render(
      <CopyrightEmailApprovalManualTargetFields
        target={initial.targets[0]!}
        index={0}
        draft={initial}
        onChange={vi.fn<(next: CopyrightEmailApprovalDraft) => void>()}
        error={undefined}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Choose user' }))
    await act(async () => failLookup(new Error('Account lookup failed')))
    expect(screen.queryByRole('button', { name: 'Find hosted material' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose user' }))
    expect(await screen.findByRole('button', { name: 'Find hosted material' })).toBeEnabled()
    expect(screen.getByText(/Hosted use: .*\/user\/harbouruser/)).toBeInTheDocument()
  })
})
