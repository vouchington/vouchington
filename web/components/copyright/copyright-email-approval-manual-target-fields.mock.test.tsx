import '@/test-helpers/i18n/mock-json-messages'
import { useState, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CopyrightEmailApprovalDraft } from './copyright-email-approval-model'
import { CopyrightEmailApprovalManualTargetFields } from './copyright-email-approval-manual-target-fields'

const resolvedTargets = vi.hoisted(() => vi.fn<VitestLooseMock>())
const fetchPost = vi.hoisted(() => vi.fn<VitestLooseMock>())
const fetchPosts = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock(
  import('@/lib/api/client/posts'),
  () => ({ fetchPost, fetchPosts }) as unknown as typeof import('@/lib/api/client/posts'),
)
vi.mock(import('@/lib/api/client/copyright-notice-targets'), async importOriginal => ({
  ...(await importOriginal()),
  resolveCopyrightNoticeTargets: resolvedTargets,
}))
vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        value,
        onValueChange,
      }: {
        children: ReactNode
        value: string
        onValueChange: (value: string) => void
      }) => (
        <select
          aria-label='Image surface 1'
          value={value}
          onChange={event => onValueChange(event.target.value)}
        >
          {children}
        </select>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
        <option value={value}>{children}</option>
      ),
      SelectTrigger: () => null,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

const target: CopyrightEmailApprovalDraft['targets'][number] = {
  id: 'first',
  group_id: 'group-1',
  surface: 'post-image',
  post_id: 'post-1',
  user_id: undefined,
  user_profile_link_id: undefined,
  topic_id: undefined,
  community_id: undefined,
  image_id: 'image-1',
  target_url: 'https://voucha.ai/discussion/one',
  resolution_status: 'failed',
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
  targets: [target, { ...target, id: 'second' }],
}

describe('CopyrightEmailApprovalManualTargetFields', () => {
  beforeEach(() => {
    fetchPosts.mockResolvedValue({
      posts: {
        'post-2': { id: 'post-2', title: 'Harbour', post_type: 'discussion' },
      },
    })
  })

  it('offers a post search and hosted image picker without asking for an ID', () => {
    render(
      <CopyrightEmailApprovalManualTargetFields
        target={target}
        index={0}
        draft={draft}
        onChange={vi.fn<(next: CopyrightEmailApprovalDraft) => void>()}
        error='URL lookup failed'
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('URL lookup failed')
    expect(screen.getByPlaceholderText(/Search posts/)).toHaveValue('')
    expect(screen.queryByPlaceholderText(/resolved .*id/i)).not.toBeInTheDocument()
  })

  it('clears stale owner and image selections when staff changes surface', () => {
    const onChange = vi.fn<(next: CopyrightEmailApprovalDraft) => void>()
    render(
      <CopyrightEmailApprovalManualTargetFields
        target={target}
        index={0}
        draft={draft}
        onChange={onChange}
        error={undefined}
      />,
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Image surface 1' }), {
      target: { value: 'community-banner-image' },
    })
    expect(onChange.mock.lastCall?.[0].targets[0]).toMatchObject({
      surface: 'community-banner-image',
      post_id: '',
      image_id: '',
      community_id: undefined,
    })
    expect(onChange.mock.lastCall?.[0].targets[1]).toEqual(draft.targets[1])
  })

  it('resolves the selected owner URL and stores only its matching image', async () => {
    const ownerUrl = new URL('/discussion/harbour', window.location.origin).href
    fetchPost.mockResolvedValue({
      post: { id: 'post-2', title: 'Harbour', post_type: 'discussion', slug: 'harbour' },
    })
    resolvedTargets.mockResolvedValue([
      {
        surface: 'post-image',
        post_id: 'post-2',
        image_id: 'image-2',
        target_url: ownerUrl,
        order_index: 0,
        caption: 'Harbour image',
      },
      {
        surface: 'post-image',
        post_id: 'another-post',
        image_id: 'wrong-image',
        target_url: ownerUrl,
        order_index: 1,
        caption: 'Wrong image',
      },
    ])
    const latest = { current: draft }
    function Harness() {
      const [value, setValue] = useState(draft)
      return (
        <CopyrightEmailApprovalManualTargetFields
          target={value.targets[0]!}
          index={0}
          draft={value}
          onChange={next => {
            latest.current = next
            setValue(next)
          }}
          error='URL lookup failed'
        />
      )
    }
    render(<Harness />)
    fireEvent.change(screen.getByPlaceholderText(/Search posts/), {
      target: { value: 'Harbour' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /Harbour/ }))
    expect(fetchPosts).toHaveBeenCalledWith({
      q: 'Harbour',
      limit: 10,
      signal: expect.any(AbortSignal),
    })
    expect(screen.queryByText('post-2')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Hosted use URL')).not.toBeInTheDocument()
    await screen.findByRole('button', { name: 'Find hosted material' })
    fireEvent.click(screen.getByRole('button', { name: 'Find hosted material' }))
    await waitFor(() => expect(resolvedTargets).toHaveBeenCalledWith(ownerUrl))
    fireEvent.click(await screen.findByRole('checkbox', { name: /Harbour image/ }))
    expect(latest.current.targets[0]).toMatchObject({
      post_id: 'post-2',
      image_id: 'image-2',
      target_url: ownerUrl,
      resolution_status: 'pending',
    })
    expect(latest.current.targets[1]).toEqual(draft.targets[1])
  })

  it('locks a selected owner until staff explicitly clears it', async () => {
    fetchPost.mockResolvedValue({
      post: { id: 'post-2', title: 'Harbour', post_type: 'discussion', slug: 'harbour' },
    })
    const latest = { current: draft }
    function Harness() {
      const [value, setValue] = useState(draft)
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
    fireEvent.change(screen.getByPlaceholderText(/Search posts/), {
      target: { value: 'Harbour' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /Harbour/ }))
    expect(screen.queryByPlaceholderText(/Search posts/)).not.toBeInTheDocument()
    await screen.findByRole('button', { name: 'Find hosted material' })
    fireEvent.click(screen.getByRole('button', { name: 'Choose different owner' }))
    expect(latest.current.targets[0]).toMatchObject({
      post_id: '',
      image_id: '',
      resolution_status: 'failed',
    })
    expect(screen.getByPlaceholderText(/Search posts/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Find hosted material' })).not.toBeInTheDocument()
  })

  it('ignores a late owner lookup after staff clears the selection', async () => {
    let finishLookup!: (value: unknown) => void
    fetchPost.mockReturnValueOnce(
      new Promise(resolve => {
        finishLookup = resolve
      }),
    )
    const latest = { current: draft }
    function Harness() {
      const [value, setValue] = useState(draft)
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
    fireEvent.change(screen.getByPlaceholderText(/Search posts/), {
      target: { value: 'Harbour' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /Harbour/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose different owner' }))
    finishLookup({
      post: { id: 'post-2', title: 'Harbour', post_type: 'discussion', slug: 'harbour' },
    })
    await waitFor(() => expect(fetchPost).toHaveBeenCalledWith('post-2'))
    expect(latest.current.targets[0]).toMatchObject({ post_id: '', image_id: '' })
    expect(screen.queryByRole('button', { name: 'Find hosted material' })).not.toBeInTheDocument()
  })
})
